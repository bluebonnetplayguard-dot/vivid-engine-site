// Saved-history rules (spec 2G). Pure rules and crypto run anywhere; the store tests need a scratch Postgres:
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/vivid_test npm test      (setup DROPS the public schema)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { openTestDb, makeUser, skipDb } from './helpers/db.mjs';

const require = createRequire(import.meta.url);
const dist = process.env.VE_DIST || new URL('../dist/', import.meta.url).pathname;
const { FieldCipher, HistoryCipherError, termsOf, cipherFromEnv } = require(dist + 'history/crypto.js');
const rules = require(dist + 'history/rules.js');
const { HistoryStore, HistoryError } = require(dist + 'history/store.js');
const catalog = require(dist + 'shared/pricing-catalog.js');

const key = () => randomBytes(32);
const cipher = (k = key(), previous = []) => new FieldCipher({ current: k, previous });
const DAY = 86_400_000;
const row = (o = {}) => ({ plan_id: 'search_pro', status: 'active', ended_at: null, retention_days: 365, full_text_search: false, bulk_export: false, memory: false, ...o });
const MAX_ROW = { plan_id: 'search_max', retention_days: null, full_text_search: true, bulk_export: true, memory: true };

// ---------- encryption ----------
test('encryption: round trip, fresh IV each time, nothing readable in the token', () => {
  const c = cipher();
  const a = c.encrypt('my secret question about foundations', 'u1:message');
  const b = c.encrypt('my secret question about foundations', 'u1:message');
  assert.notEqual(a, b);
  assert.ok(!a.includes('secret'));
  assert.equal(c.decrypt(a, 'u1:message'), 'my secret question about foundations');
  assert.equal(c.decrypt(c.encrypt('', 'x'), 'x'), '');
});
test('encryption: tampering, wrong owner and wrong field all fail the integrity check', () => {
  const c = cipher();
  const t = c.encrypt('hello', 'u1:message');
  assert.throws(() => c.decrypt(t, 'u2:message'), HistoryCipherError);
  assert.throws(() => c.decrypt(t, 'u1:title'), HistoryCipherError);
  const parts = t.split('.'); parts[4] = parts[4].slice(0, -2) + (parts[4].endsWith('AA') ? 'BB' : 'AA');
  assert.throws(() => c.decrypt(parts.join('.'), 'u1:message'), HistoryCipherError);
  assert.equal(c.tryDecrypt('garbage', 'u1:message', 'fallback'), 'fallback');
});
test('encryption: key rotation keeps old data readable, new data uses the new key', () => {
  const oldKey = key(); const newKey = key();
  const old = cipher(oldKey).encrypt('kept', 'a');
  const rotated = cipher(newKey, [oldKey]);
  assert.equal(rotated.decrypt(old, 'a'), 'kept');
  assert.equal(rotated.encrypt('x', 'a').split('.')[1], rotated.activeKeyId);
  assert.throws(() => cipher(newKey).decrypt(old, 'a'), HistoryCipherError);   // old key dropped = unreadable
});
test('encryption: blind index is per person and per word; stop words are not indexed', () => {
  const c = cipher();
  assert.equal(c.blind('u1', 'roofing'), c.blind('u1', 'roofing'));
  assert.notEqual(c.blind('u1', 'roofing'), c.blind('u2', 'roofing'));
  assert.notEqual(cipher().blind('u1', 'roofing'), c.blind('u1', 'roofing'));
  assert.deepEqual(termsOf('The Café and the ROOFING, roofing 42!'), ['cafe', 'roofing']);
});
test('encryption: production without a key refuses to store history; development gets a throwaway key', () => {
  assert.equal(cipherFromEnv({}, true), null);
  assert.ok(cipherFromEnv({}, false));
  assert.throws(() => cipherFromEnv({ HISTORY_ENCRYPTION_KEY: 'c2hvcnQ=' }, true), HistoryCipherError);
  assert.ok(cipherFromEnv({ HISTORY_ENCRYPTION_KEY: key().toString('base64') }, true));
});

// ---------- plan rules ----------
test('rules: guests and Free save nothing', () => {
  assert.equal(rules.resolveHistoryAccess([]).allowed, false);
  assert.equal(rules.shouldSave(rules.NO_HISTORY, false), false);
  assert.equal(rules.canExport(rules.NO_HISTORY), false);
  for (const id of ['search_free', 'web_free', 'app_free', 'free']) assert.equal(catalog.historyForPlan(id), null, id);
});
test('rules: every paid catalog plan has history; Pro-level 12 months, Max and All-In-One until deleted', () => {
  const paidPlans = catalog.ALL_SELF_SERVE.filter(p => p.competitor || p.setPrice);
  assert.ok(paidPlans.length >= 10);
  for (const p of paidPlans) assert.ok(catalog.historyForPlan(p.id), p.id);
  assert.equal(catalog.historyForPlan('search_pro').retentionDays, 365);
  assert.equal(catalog.historyForPlan('web_core').retentionDays, 365);
  assert.equal(catalog.historyForPlan('app_builder').retentionDays, 365);
  for (const id of ['search_max', 'all_in_one']) {
    const h = catalog.historyForPlan(id);
    assert.deepEqual([h.retentionDays, h.fullTextSearch, h.bulkExport, h.memory], [null, true, true, true], id);
  }
  assert.equal(catalog.historyForPlan('search_pro').fullTextSearch, false);
});
test('rules: Pro can save; Max gets search, export and memory; Pro does not', () => {
  const pro = rules.resolveHistoryAccess([row()]);
  assert.deepEqual([pro.allowed, pro.readOnly, pro.retentionDays, pro.fullTextSearch, pro.bulkExport, pro.memory], [true, false, 365, false, false, false]);
  const max = rules.resolveHistoryAccess([row(MAX_ROW)]);
  assert.deepEqual([max.retentionDays, max.fullTextSearch, max.bulkExport, max.memory], [null, true, true, true]);
  assert.equal(rules.resolveHistoryAccess([row(), row(MAX_ROW)]).retentionDays, null);
});
test('rules: Private mode never saves', () => {
  const pro = rules.resolveHistoryAccess([row()]);
  assert.equal(rules.shouldSave(pro, false), true);
  assert.equal(rules.shouldSave(pro, true), false);
});
test('rules: 30-day read-only window after a downgrade, then nothing', () => {
  const now = new Date('2026-11-01T12:00:00Z');
  const ended = d => rules.resolveHistoryAccess([row({ status: 'ended', ended_at: new Date(now - d * DAY) })], now);
  const ro = ended(10);
  assert.deepEqual([ro.allowed, ro.readOnly], [true, true]);
  assert.equal(rules.shouldSave(ro, false), false);          // cannot save new
  assert.equal(rules.canExport(ro), true);                   // can take their data
  assert.equal(rules.memoryActive(ro, true), false);
  assert.equal(ended(29.9).readOnly, true);
  assert.equal(ended(30.1).allowed, false);
  assert.equal(ro.readOnlyUntil, new Date(now - 10 * DAY + 30 * DAY).toISOString());
});
test('rules: memory needs the plan, a switched-on setting and no read-only', () => {
  const max = rules.resolveHistoryAccess([row(MAX_ROW)]);
  assert.equal(rules.memoryActive(max, true), true);
  assert.equal(rules.memoryActive(max, false), false);
  assert.equal(rules.memoryActive(rules.resolveHistoryAccess([row()]), true), false);
});
test('rules: auto-delete accepts 30, 90, 365 or never', () => {
  assert.equal(rules.parseAutoDelete(30), 30); assert.equal(rules.parseAutoDelete('90'), 90);
  assert.equal(rules.parseAutoDelete(null), null); assert.equal(rules.parseAutoDelete('never'), null);
  assert.throws(() => rules.parseAutoDelete(7), RangeError);
});
test('rules: the two pricing catalog copies are identical', () => {
  const a = readFileSync(new URL('../src/shared/pricing-catalog.ts', import.meta.url), 'utf8');
  const b = readFileSync(new URL('../../site/src/config/pricing-catalog.ts', import.meta.url), 'utf8');
  assert.equal(a, b);
});

// ---------- store, against a real database ----------
let db, store, c;
const KEEP = { skip: skipDb };
test('store: setup', KEEP, async () => { db = await openTestDb(); c = cipher(); store = new HistoryStore(db, c); });

async function paid(userId, tier = 'pro', status = 'active') {
  const s = await db.one('INSERT INTO ai_subscriptions(owner_user_id, tier, status) VALUES ($1, $2, $3) RETURNING id', [userId, tier, status]);
  await store.syncEntitlements(userId); return s.id;
}

test('store: nothing readable in the database', KEEP, async () => {
  const u = await makeUser(db); await paid(u.id);
  const id = await store.createConversation(u.id, { title: 'Quote for the Katy warehouse' });
  await store.appendMessage(u.id, id, { role: 'user', content: 'How much for a metal roof in Katy?', sources: [{ url: 'https://example.com/roofs', title: 'Roof guide', cited: true }] });
  const dump = JSON.stringify([
    await db.query('SELECT * FROM conversations WHERE id = $1', [id]), await db.query('SELECT * FROM messages WHERE conversation_id = $1', [id]),
    await db.query('SELECT * FROM conversation_sources WHERE conversation_id = $1', [id])]);
  for (const plain of ['warehouse', 'metal roof', 'example.com', 'Roof guide']) assert.ok(!dump.includes(plain), plain);
  const got = await store.get(u.id, id);
  assert.equal(got.title, 'Quote for the Katy warehouse');
  assert.equal(got.messages[0].content, 'How much for a metal roof in Katy?');
  assert.deepEqual(got.messages[0].sources.map(s => [s.n, s.url, s.title, s.cited]), [[1, 'https://example.com/roofs', 'Roof guide', true]]);
});

test('store: one person can never see or change another person\'s data', KEEP, async () => {
  const a = await makeUser(db); const b = await makeUser(db); await paid(a.id); await paid(b.id);
  const id = await store.createConversation(a.id, { title: 'Private plan' });
  await store.appendMessage(a.id, id, { role: 'user', content: 'confidential tooling budget' });
  const space = await store.createSpace(a.id, 'Clients');
  await assert.rejects(store.get(b.id, id), e => e.status === 404);
  await assert.rejects(store.update(b.id, id, { title: 'hijack' }), e => e.status === 404);
  await assert.rejects(store.remove(b.id, id), e => e.status === 404);
  await assert.rejects(store.appendMessage(b.id, id, { role: 'user', content: 'x' }), e => e.status === 404);
  await assert.rejects(store.setFavorite(b.id, id, true), e => e.status === 404);
  await assert.rejects(store.update(b.id, await store.createConversation(b.id, { title: 'mine' }), { spaceId: space.id }), e => e.status === 404);
  assert.equal((await store.list(b.id, { q: 'tooling', fullText: true })).length, 0);
  assert.equal((await store.memorySnippets(b.id, 'confidential tooling budget', null)).length, 0);
  await assert.rejects(store.get(a.id, 'not-an-id'), e => e.status === 404);
  assert.equal((await store.get(a.id, id)).title, 'Private plan');
});

test('store: a row that cannot be decrypted is reported, not fatal', KEEP, async () => {
  const u = await makeUser(db); await paid(u.id);
  await store.createConversation(u.id, { title: 'fine' });
  const bad = await store.createConversation(u.id, { title: 'will break' });
  await db.query(`UPDATE conversations SET title_enc = 'v1.deadbeef.AAAA.AAAA.AAAA' WHERE id = $1`, [bad]);
  assert.deepEqual((await store.list(u.id)).map(x => x.title).sort(), ['Untitled', 'fine']);
});

test('store: list order, pin, rename, Spaces, favorites', KEEP, async () => {
  const u = await makeUser(db); await paid(u.id);
  const a = await store.createConversation(u.id, { title: 'Alpha' });
  const b = await store.createConversation(u.id, { title: 'Beta' });
  await store.appendMessage(u.id, a, { role: 'user', content: 'alpha question' });
  assert.deepEqual((await store.list(u.id)).map(x => x.title), ['Alpha', 'Beta']);   // most recent first
  await store.update(u.id, b, { pinned: true });
  assert.deepEqual((await store.list(u.id)).map(x => x.title), ['Beta', 'Alpha']);   // pinned first
  await store.update(u.id, a, { title: '  Renamed  ' });
  assert.equal((await store.get(u.id, a)).title, 'Renamed');
  await assert.rejects(store.update(u.id, a, { title: '   ' }), HistoryError);
  const sp = await store.createSpace(u.id, 'Jobs');
  await assert.rejects(store.createSpace(u.id, 'jobs'), e => e.status === 409);
  await store.update(u.id, a, { spaceId: sp.id });
  assert.deepEqual((await store.list(u.id, { spaceId: sp.id })).map(x => x.title), ['Renamed']);
  assert.equal((await store.spaces(u.id))[0].conversations, 1);
  await store.setFavorite(u.id, b, true);
  assert.deepEqual((await store.list(u.id, { favorites: true })).map(x => x.title), ['Beta']);
  await store.setFavorite(u.id, b, false);
  assert.equal((await store.list(u.id, { favorites: true })).length, 0);
  await store.deleteSpace(u.id, sp.id);
  assert.equal((await store.get(u.id, a)).space, null);        // conversation survives, Space is gone
});

test('store: title search always; full-text search uses the blind index (whole words, this person only)', KEEP, async () => {
  const u = await makeUser(db); await paid(u.id, 'max');
  const a = await store.createConversation(u.id, { title: 'Estimate' });
  await store.appendMessage(u.id, a, { role: 'assistant', content: 'Galvanized purlins need a corrosion coating near the coast.' });
  const b = await store.createConversation(u.id, { title: 'Other' });
  await store.appendMessage(u.id, b, { role: 'user', content: 'Which permit does Pearland require?' });
  assert.deepEqual((await store.list(u.id, { q: 'estim' })).map(x => x.title), ['Estimate']);
  assert.deepEqual((await store.list(u.id, { q: 'purlins coating', fullText: true })).map(x => x.title), ['Estimate']);
  assert.deepEqual((await store.list(u.id, { q: 'purlins permit', fullText: true })).map(x => x.title), []);   // every word must match
  assert.deepEqual((await store.list(u.id, { q: 'purlins', fullText: false })).map(x => x.title), []);        // not on this plan
});

test('store: memory finds earlier answers, never from the current conversation, and respects the plan', KEEP, async () => {
  const u = await makeUser(db); await paid(u.id, 'max');
  const a = await store.createConversation(u.id, { title: 'Old' });
  await store.appendMessage(u.id, a, { role: 'assistant', content: 'The client prefers standing seam panels in Galvalume.' });
  const b = await store.createConversation(u.id, { title: 'New' });
  assert.deepEqual(await store.memorySnippets(u.id, 'which panels does the client prefer', b), ['The client prefers standing seam panels in Galvalume.']);
  assert.deepEqual(await store.memorySnippets(u.id, 'which panels does the client prefer', a), []);
  assert.equal((await store.updateSettings(u.id, { memoryEnabled: true }, await store.access(u.id))).memory_enabled, true);
  const p = await makeUser(db); await paid(p.id, 'pro');
  await assert.rejects(store.updateSettings(p.id, { memoryEnabled: true }, await store.access(p.id)), e => e.status === 403);
});

test('store: export and delete one / delete all (deleting is always allowed)', KEEP, async () => {
  const u = await makeUser(db); const subId = await paid(u.id, 'max');
  const ids = [];
  for (const t of ['One', 'Two', 'Three']) { const id = await store.createConversation(u.id, { title: t }); await store.appendMessage(u.id, id, { role: 'user', content: `${t} question` }); ids.push(id); }
  const out = await store.exportAll(u.id);
  assert.equal(out.conversations.length, 3);
  assert.ok(out.conversations.every(x => x.messages.length === 1));
  assert.deepEqual(await store.remove(u.id, ids[0]), { deleted: 1 });
  assert.equal((await db.query('SELECT 1 FROM messages WHERE conversation_id = $1', [ids[0]])).length, 0);   // messages go with it
  await db.query(`UPDATE ai_subscriptions SET status = 'canceled' WHERE id = $1`, [subId]); await store.syncEntitlements(u.id);   // downgrade
  assert.equal((await store.removeAll(u.id)).deleted, 2);
  assert.equal((await store.list(u.id)).length, 0);
});

test('store: default and per-conversation auto-delete', KEEP, async () => {
  const u = await makeUser(db); await paid(u.id);
  await store.updateSettings(u.id, { defaultAutoDeleteDays: 30 }, await store.access(u.id));
  const fresh = await store.createConversation(u.id, { title: 'Inherits 30' });
  assert.equal((await store.get(u.id, fresh)).auto_delete_days, 30);
  await assert.rejects(store.update(u.id, fresh, { autoDeleteDays: 5 }), HistoryError);
  const old = await store.createConversation(u.id, { title: 'Old' }); await store.update(u.id, old, { autoDeleteDays: 30 });
  const pinned = await store.createConversation(u.id, { title: 'Pinned old' }); await store.update(u.id, pinned, { autoDeleteDays: 30, pinned: true });
  const never = await store.createConversation(u.id, { title: 'Never' }); await store.update(u.id, never, { autoDeleteDays: null });
  await db.query(`UPDATE conversations SET updated_date = now() - interval '40 days' WHERE id = ANY($1)`, [[old, pinned, never]]);
  assert.equal((await store.expire()).autoDeleted, 1);
  assert.deepEqual((await store.list(u.id)).map(x => x.title).sort(), ['Inherits 30', 'Never', 'Pinned old']);
});

test('store: 12-month plans drop older conversations; until-deleted plans keep everything', KEEP, async () => {
  const pro = await makeUser(db); await paid(pro.id, 'pro');
  const max = await makeUser(db); await paid(max.id, 'max');
  for (const u of [pro, max]) { const id = await store.createConversation(u.id, { title: 'ancient' }); await db.query(`UPDATE conversations SET updated_date = now() - interval '400 days' WHERE id = $1`, [id]); }
  await store.createConversation(pro.id, { title: 'recent' });
  assert.ok((await store.expire()).retentionDeleted >= 1);
  assert.deepEqual((await store.list(pro.id)).map(x => x.title), ['recent']);
  assert.deepEqual((await store.list(max.id)).map(x => x.title), ['ancient']);
});

test('store: downgrade -> 30 days read-only -> locked data removed after the grace period', KEEP, async () => {
  const u = await makeUser(db); const subId = await paid(u.id, 'pro');
  const id = await store.createConversation(u.id, { title: 'Kept for now' });
  await store.appendMessage(u.id, id, { role: 'user', content: 'hello there' });
  await db.query(`UPDATE ai_subscriptions SET status = 'canceled' WHERE id = $1`, [subId]);
  await store.syncEntitlements(u.id);
  let access = await store.access(u.id);
  assert.deepEqual([access.allowed, access.readOnly], [true, true]);
  assert.equal((await store.get(u.id, id)).title, 'Kept for now');          // can still open
  await db.query(`UPDATE entitlements SET ended_at = now() - interval '45 days' WHERE user_id = $1`, [u.id]);
  access = await store.access(u.id);
  assert.equal(access.allowed, false);                                       // window closed
  assert.equal((await store.expire()).purged, 0);                            // data not purged yet
  assert.equal((await store.list(u.id)).length, 1);
  await db.query(`UPDATE entitlements SET ended_at = now() - interval '100 days' WHERE user_id = $1`, [u.id]);
  assert.equal((await store.expire()).purged, 1);
  assert.equal((await store.list(u.id)).length, 0);
});

test('store: resubscribing before the purge restores access and keeps the data', KEEP, async () => {
  const u = await makeUser(db); const subId = await paid(u.id, 'pro');
  await store.createConversation(u.id, { title: 'Back again' });
  await db.query(`UPDATE ai_subscriptions SET status = 'canceled' WHERE id = $1`, [subId]); await store.syncEntitlements(u.id);
  await db.query(`UPDATE entitlements SET ended_at = now() - interval '45 days' WHERE user_id = $1`, [u.id]);
  await db.query(`UPDATE ai_subscriptions SET status = 'active' WHERE id = $1`, [subId]); await store.syncEntitlements(u.id);
  const access = await store.access(u.id);
  assert.deepEqual([access.allowed, access.readOnly], [true, false]);
  assert.equal((await store.expire()).purged, 0);
  assert.equal((await store.list(u.id)).length, 1);
});

test('store: Business seat members get history; removing the seat takes it away', KEEP, async () => {
  const owner = await makeUser(db); const member = await makeUser(db);
  const subId = await paid(owner.id, 'business');
  const seat = await db.one('INSERT INTO ai_seats(subscription_id, email, user_id, role) VALUES ($1, $2, $3, $4) RETURNING id', [subId, member.email, member.id, 'member']);
  await store.syncEntitlements(member.id);
  assert.equal((await store.access(member.id)).allowed, true);
  await db.query('DELETE FROM ai_seats WHERE id = $1', [seat.id]);
  await store.syncEntitlements(member.id);
  const after = await store.access(member.id);                        // same as a downgrade: read-only for 30 days, no new saves
  assert.deepEqual([after.allowed, after.readOnly], [true, true]);
  assert.equal(rules.shouldSave(after, false), false);
});

test('store: Website plans and bundles carry history; Free plans carry none', KEEP, async () => {
  const add = async (u, plan) => { await db.query(`INSERT INTO plan_subscriptions(owner_user_id, plan_id, cycle, status) VALUES ($1, $2, 'annual', 'active')`, [u.id, plan]); await store.syncEntitlements(u.id); return store.access(u.id); };
  const a = await add(await makeUser(db), 'web_core');
  assert.deepEqual([a.allowed, a.retentionDays, a.fullTextSearch], [true, 365, false]);
  const b = await add(await makeUser(db), 'all_in_one');
  assert.deepEqual([b.retentionDays, b.fullTextSearch, b.bulkExport, b.memory], [null, true, true, true]);
  assert.equal((await add(await makeUser(db), 'web_free')).allowed, false);
});

test('store: legacy threads are copied once, encrypted, with Spaces and favorites', KEEP, async () => {
  const u = await makeUser(db);
  const t = await db.one(`INSERT INTO ai_threads(user_id, title, pinned, favorite, space) VALUES ($1, 'Old thread', true, true, 'Clients') RETURNING id`, [u.id]);
  await db.query(`INSERT INTO ai_messages(thread_id, role, content, sources) VALUES ($1, 'user', 'legacy question about drywall', '[]'), ($1, 'assistant', 'legacy answer', $2)`, [t.id, JSON.stringify([{ url: 'https://example.com/a', title: 'A' }])]);
  assert.equal(await store.importLegacy(), 1);
  assert.equal(await store.importLegacy(), 0);                    // second run does nothing
  const [conv] = await store.list(u.id);
  const full = await store.get(u.id, conv.id);
  assert.deepEqual([full.title, full.pinned, full.favorite, full.space.name], ['Old thread', true, true, 'Clients']);
  assert.deepEqual(full.messages.map(m => m.role), ['user', 'assistant']);
  assert.equal(full.messages[1].sources[0].url, 'https://example.com/a');
  assert.ok(!JSON.stringify(await db.query('SELECT * FROM messages WHERE conversation_id = $1', [conv.id])).includes('drywall'));
  await store.syncEntitlements(u.id);
});

test('store: teardown', KEEP, async () => { await db.close(); });
