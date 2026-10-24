// AI router rules (spec 2I): Auto routing, retry then fallback, Combined, plan limits, credit ledger, margin guard.
// All with fake engines, so no key or network is needed. Ledger tests need TEST_DATABASE_URL like history.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { openTestDb, makeUser, skipDb } from './helpers/db.mjs';

const require = createRequire(import.meta.url);
const dist = process.env.VE_DIST || new URL('../dist/', import.meta.url).pathname;
const { AiRouter } = require(dist + 'ai-router/router.js');
const { classifyIntent, fallbackOrder } = require(dist + 'ai-router/classify.js');
const { normalizeCitations, mergeCitations, renumberByUse } = require(dist + 'ai-router/citations.js');
const policy = require(dist + 'ai-router/policy.js');
const credits = require(dist + 'ai-router/credits.js');
const { ProviderError, RouterError } = require(dist + 'ai-router/types.js');
const catalog = require(dist + 'shared/pricing-catalog.js');

// ---------- fakes ----------
const cite = (n, url = `https://example.com/${n}`) => ({ n, url, title: `Source ${n}`, cited: true });
function fake(id, o = {}) {
  const calls = [];
  const adapter = {
    id, calls, configured: () => o.configured !== false,
    async run(req, hooks) {
      calls.push(req);
      const step = o.script ? o.script.shift() : undefined;
      if (step instanceof Error) throw step;
      if (typeof step === 'function') return step(req, hooks);
      const answer = o.answer ?? `${id} answer [1]`;
      hooks?.onDelta?.(answer);
      return {
        answer, citations: o.citations ?? [cite(1, `https://${id}.example/a`)], searchQueries: [`${id} query`],
        usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, searches: 1 }, cost: o.cost ?? 0.01, costStatus: 'known', provider: id, model: o.model ?? `${id}-model`,
      };
    },
  };
  return adapter;
}
const make = (over = {}, opts = {}) => {
  const adapters = { perplexity: fake('perplexity', over.perplexity), claude: fake('claude', over.claude), gemini: fake('gemini', over.gemini) };
  const router = new AiRouter({ adapters: Object.values(adapters), sleep: async () => {}, ...opts });
  return { router, ...adapters };
};
const ask = (o = {}) => ({ question: 'what is the latest news about Houston permits', history: [], mode: 'search', engine: 'auto', depth: 'quick', planId: 'search_pro', ...o });
const err = (id, status, message = 'boom', started = false) => new ProviderError(message, id, status, started);

// ---------- Auto ----------
test('auto: live-web questions go to Perplexity, writing and code to Claude, pictures to Gemini', () => {
  assert.equal(classifyIntent({ question: 'latest roofing permit rules in Katy', mode: 'search' }).engine, 'perplexity');
  assert.equal(classifyIntent({ question: 'write a python function that parses a csv', mode: 'search' }).engine, 'claude');
  assert.equal(classifyIntent({ question: 'draft a proposal outline for a warehouse', mode: 'search' }).engine, 'claude');
  assert.equal(classifyIntent({ question: 'what is in this', mode: 'search', attachments: [{ mime: 'image/png', data: 'x' }] }).engine, 'gemini');
  assert.equal(classifyIntent({ question: 'roof ideas', mode: 'search', focus: 'images' }).engine, 'gemini');
  assert.equal(classifyIntent({ question: 'landing page for a plumber', mode: 'build' }).engine, 'claude');
  assert.equal(classifyIntent({ question: 'how does concrete cure', mode: 'search' }).engine, 'perplexity');   // default is the live web
  for (const e of ['perplexity', 'claude', 'gemini']) assert.ok(!fallbackOrder(e).includes(e) && fallbackOrder(e).length === 2);
});
test('auto: every choice comes with a plain-language reason', () => {
  for (const q of ['latest news', 'write an email', 'photo of a roof', 'hello there', 'x'.repeat(700)]) assert.match(classifyIntent({ question: q, mode: 'search' }).why, /\w{4,}/);
});

// ---------- one result shape ----------
test('router: every engine returns the same shape', async () => {
  for (const engine of ['perplexity', 'claude', 'gemini']) {
    const { router } = make();
    const r = await router.route(ask({ engine }));
    assert.deepEqual(Object.keys(r).filter(k => ['answer', 'citations', 'searchQueries', 'usage', 'cost', 'provider'].includes(k)).sort(), ['answer', 'citations', 'cost', 'provider', 'searchQueries', 'usage']);
    assert.equal(r.provider, engine); assert.equal(r.fallbackFrom, null); assert.match(r.why, new RegExp(`chose ${engine}`, 'i'));
  }
});
test('router: auto uses the classifier and says why', async () => {
  const { router, perplexity, claude } = make();
  const r = await router.route(ask());
  assert.equal(r.provider, 'perplexity'); assert.equal(perplexity.calls.length, 1); assert.equal(claude.calls.length, 0);
  assert.match(r.why, /current information/);
});
test('router: plan decides the Claude model by depth', async () => {
  const { router, claude } = make();
  await router.route(ask({ engine: 'claude', depth: 'quick', planId: 'search_pro' }));
  await router.route(ask({ engine: 'claude', depth: 'pro', planId: 'search_pro' }));
  await router.route(ask({ engine: 'claude', depth: 'deep', planId: 'search_max' }));
  await router.route(ask({ engine: 'claude', depth: 'quick', planId: 'search_free' }));
  assert.deepEqual(claude.calls.map(c => c.model), ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5']);
});
test('router: [web:3] style markers are rewritten to [3] and dangling markers are dropped', async () => {
  const { router } = make({ claude: { answer: 'Rates rose [web:1] and fell [web:1, web:2][9].', citations: [cite(1), cite(2)] } });
  const r = await router.route(ask({ engine: 'claude' }));
  assert.equal(r.answer, 'Rates rose [1] and fell [1][2].');
});

// ---------- retry, fallback, billing ----------
test('retry: a temporary failure is retried once on the same engine', async () => {
  const { router, perplexity } = make({ perplexity: { script: [err('perplexity', 503)] } });
  const r = await router.route(ask({ engine: 'perplexity' }));
  assert.equal(perplexity.calls.length, 2); assert.equal(r.provider, 'perplexity'); assert.equal(r.attempts.filter(a => !a.ok).length, 1); assert.equal(r.fallbackFrom, null);
});
test('fallback: two failures move to the next engine and the reason says so', async () => {
  const { router, perplexity, claude } = make({ perplexity: { script: [err('perplexity', 500), err('perplexity', 500)] } });
  const r = await router.route(ask({ engine: 'perplexity' }));
  assert.equal(perplexity.calls.length, 2); assert.equal(claude.calls.length, 1);
  assert.equal(r.provider, 'claude'); assert.equal(r.fallbackFrom, 'perplexity'); assert.match(r.why, /Perplexity could not answer, so Claude did/);
});
test('fallback: a bad request (400) is not retried', async () => {
  const { router, perplexity, claude } = make({ perplexity: { script: [err('perplexity', 400, 'bad request')] } });
  await router.route(ask({ engine: 'perplexity' }));
  assert.equal(perplexity.calls.length, 1); assert.equal(claude.calls.length, 1);
});
test('billing error: no retry, fallback right away, engine skipped afterwards, alert hook fires', async () => {
  const { router, perplexity, claude } = make({ perplexity: { script: [err('perplexity', 402, 'insufficient credit')] } });
  const alerts = []; router.onBillingError = (e, m) => alerts.push([e, m]);
  const r1 = await router.route(ask({ engine: 'perplexity' }));
  assert.equal(perplexity.calls.length, 1); assert.equal(r1.provider, 'claude'); assert.equal(alerts.length, 1); assert.equal(alerts[0][0], 'perplexity');
  const r2 = await router.route(ask({ engine: 'perplexity' }));                 // not even tried this time
  assert.equal(perplexity.calls.length, 1); assert.equal(r2.provider, 'claude'); assert.match(r2.why, /unavailable right now/);
  assert.equal(router.status().find(s => s.id === 'perplexity').available, false);
});
test('billing error: an engine comes back after the pause', async () => {
  let t = 0;
  const { router, perplexity } = make({ perplexity: { script: [err('perplexity', 401, 'invalid api key')] } }, { now: () => t });
  await router.route(ask({ engine: 'perplexity' }));
  t += 11 * 60_000;
  const r = await router.route(ask({ engine: 'perplexity' }));
  assert.equal(r.provider, 'perplexity'); assert.equal(perplexity.calls.length, 2);
});
test('streaming: once text has been shown, a failure ends the answer instead of switching engines', async () => {
  const { router, claude } = make({ perplexity: { script: [(req, hooks) => { hooks.onDelta('Half an ans'); throw err('perplexity', 500, 'dropped'); }] } });
  await assert.rejects(router.route(ask({ engine: 'perplexity' }), { onDelta() {} }), e => e.provider === 'perplexity');
  assert.equal(claude.calls.length, 0);
});
test('unconfigured engines are replaced; nothing configured is a clear 503', async () => {
  const { router, claude } = make({ perplexity: { configured: false } });
  const r = await router.route(ask({ engine: 'perplexity' }));
  assert.equal(r.provider, 'claude'); assert.equal(claude.calls.length, 1);
  const none = make({ perplexity: { configured: false }, claude: { configured: false }, gemini: { configured: false } }).router;
  await assert.rejects(none.route(ask()), e => e instanceof RouterError && e.status === 503);
});
test('abort: a cancelled request is not retried', async () => {
  const ac = new AbortController();
  const { router, perplexity } = make({ perplexity: { script: [(req) => { ac.abort(); throw err('perplexity', 500); }] } });
  await assert.rejects(router.route(ask({ engine: 'perplexity', signal: ac.signal })));
  assert.equal(perplexity.calls.length, 1);
});

// ---------- plan limits ----------
test('plans: Free cannot use Combined or deeper than Quick; Pro cannot use Deep Research; Max can', async () => {
  const { router } = make();
  await assert.rejects(router.route(ask({ engine: 'combined', planId: 'search_free' })), e => e.code === 'COMBINED_NOT_ALLOWED' && e.status === 403);
  await assert.rejects(router.route(ask({ engine: 'combined', planId: 'free' })), e => e.code === 'COMBINED_NOT_ALLOWED');
  await assert.rejects(router.route(ask({ depth: 'pro', planId: 'search_free' })), e => e.code === 'DEPTH_NOT_ALLOWED');
  await assert.rejects(router.route(ask({ depth: 'deep', planId: 'search_pro' })), e => e.code === 'DEPTH_NOT_ALLOWED');
  assert.ok(await router.route(ask({ depth: 'deep', planId: 'search_max' })));
  assert.ok(await router.route(ask({ engine: 'combined', planId: 'search_pro' })));
  assert.ok(await router.route(ask({ engine: 'combined', planId: 'all_in_one', depth: 'deep' })));
});
test('plans: legacy tiers keep working and bundles map to their search plan', () => {
  assert.equal(policy.policyFor('starter').searchPlan, 'search_pro'); assert.equal(policy.policyFor('max').searchPlan, 'search_max');
  assert.equal(policy.policyFor('all_in_one').searchPlan, 'search_max'); assert.equal(policy.policyFor('bundle_launch').searchPlan, 'search_pro');
  assert.equal(policy.policyFor('bundle_builder').searchPlan, 'search_free');   // no search plan inside
  assert.equal(policy.policyFor(undefined).searchPlan, 'search_free'); assert.equal(policy.policyFor('nonsense').searchPlan, 'search_free');
});

// ---------- Combined ----------
test('combined: three engines in parallel, one merged answer with unified numbered sources and summed cost', async () => {
  // Claude is one of the three engines AND the one that writes the merged answer, so it is called twice.
  const claudeScript = [undefined, (req, hooks) => {
    assert.match(req.question, /<engine_answers>/); assert.match(req.question, /\[1\] Source 1 - https:\/\/perplexity\.example\/a/);
    assert.equal(req.history.length, 0);
    hooks.onDelta('Merged: A says X [2], B says Y [1].');
    return { answer: 'Merged: A says X [2], B says Y [1].', citations: [], searchQueries: [], usage: { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, searches: 0 }, cost: 0.02, costStatus: 'known', provider: 'claude', model: 'claude-sonnet-5-5' };
  }];
  const { router } = make({
    perplexity: { citations: [cite(1, 'https://perplexity.example/a')], cost: 0.01 },
    gemini: { citations: [cite(1, 'https://gemini.example/a'), cite(2, 'https://perplexity.example/a/')], cost: 0.04 },
    claude: { script: claudeScript, cost: 0.03 },
  });
  const deltas = []; const statuses = [];
  const r = await router.route(ask({ engine: 'combined' }), { onDelta: t => deltas.push(t), onStatus: s => statuses.push(s) });
  assert.deepEqual([...r.routedTo].sort(), ['claude', 'gemini', 'perplexity']);
  assert.equal(r.citations.length, 3);   // duplicate URL (trailing slash) merged
  assert.equal(r.citations[0].n, 1);
  assert.deepEqual(r.citations.map(c => c.cited), [true, true, false]);   // the merged answer cites two of the three; the third stays listed, uncited
  assert.equal(r.answer.includes('[2]') && r.answer.includes('[1]'), true);
  assert.ok(Math.abs(r.cost - (0.01 + 0.03 + 0.04 + 0.02)) < 1e-9);
  assert.equal(r.usage.inputTokens, 100 * 3 + 10); assert.equal(r.perEngine.length, 4);
  assert.deepEqual(deltas, ['Merged: A says X [2], B says Y [1].']);      // only the merged answer is streamed
  assert.match(r.why, /Combined asked Perplexity, Claude, Gemini/);
});
test('combined: one engine failing still gives an answer; all failing is an error; one answering is shown as is', async () => {
  const two = make({ gemini: { script: [err('gemini', 400), err('gemini', 400)] } });
  const r = await two.router.route(ask({ engine: 'combined' }));
  assert.deepEqual([...r.routedTo].sort(), ['claude', 'perplexity']); assert.match(r.why, /\(2 answered\)/);
  const one = make({ gemini: { script: [err('gemini', 400)] }, perplexity: { script: [err('perplexity', 400)] } });
  const r1 = await one.router.route(ask({ engine: 'combined' }));
  assert.deepEqual(r1.routedTo, ['claude']); assert.match(r1.why, /only Claude could answer/);
  const all = make({ gemini: { script: [err('gemini', 400)] }, perplexity: { script: [err('perplexity', 400)] }, claude: { script: [err('claude', 400)] } });
  await assert.rejects(all.router.route(ask({ engine: 'combined' })));
});
test('combined: if the writer fails before speaking, the strongest single answer is shown', async () => {
  const { router } = make({ claude: { script: [err('claude', 400), err('claude', 400)] }, perplexity: { citations: [cite(1), cite(2), cite(3)] } });
  // claude is also one of the three engines: its own first run fails, then the writer run fails
  const r = await router.route(ask({ engine: 'combined' }));
  assert.ok(r.answer.length > 0);
});

// ---------- citations ----------
test('citations: normalizing, merging and renumbering by first use', () => {
  assert.equal(normalizeCitations('A [web:2] B 【3†x】 C [source 1; source 2]', 3).text, 'A [2] B [3] C [1][2]');
  assert.deepEqual(normalizeCitations('A [2] [9]', 2).used, [2]);
  const m = mergeCitations([[cite(1, 'https://a.com/x#top'), cite(2, 'https://b.com')], [cite(1, 'https://b.com/'), cite(2, 'https://c.com')]]);
  assert.deepEqual(m.citations.map(c => c.url), ['https://a.com/x#top', 'https://b.com', 'https://c.com']);
  assert.deepEqual([...m.maps[1]], [[1, 2], [2, 3]]);
  const r = renumberByUse('See [3] and [1].', m.citations);
  assert.equal(r.text, 'See [1] and [2].'); assert.deepEqual(r.citations.map(c => [c.n, c.cited, c.url]), [[1, true, 'https://c.com'], [2, true, 'https://a.com/x#top'], [3, false, 'https://b.com']]);
});

// ---------- credits and the margin guard ----------
test('credits: allowance levels and the once-only 80% / 100% crossings', () => {
  assert.equal(credits.allowance(10, 7.99).level, 'ok'); assert.equal(credits.allowance(10, 8).level, 'warn'); assert.equal(credits.allowance(10, 10).level, 'limit');
  assert.deepEqual(credits.crossed(7, 8.1, 10), ['warn80']); assert.deepEqual(credits.crossed(8.1, 9, 10), []);
  assert.deepEqual(credits.crossed(9.9, 10.2, 10), ['limit100']); assert.deepEqual(credits.crossed(7, 10.5, 10), ['warn80', 'limit100']);
  assert.equal(credits.creditsOf(0.0004), 1); assert.equal(credits.creditsOf(1.5), 1500); assert.equal(credits.creditsOf(0), 0);
});
test('credits: a question that would pass the monthly cap is refused (account and platform)', () => {
  credits.assertWithinCap(1, 0.5, 5);
  assert.throws(() => credits.assertWithinCap(5, 0.01, 5), e => e.code === 'CREDITS_EXHAUSTED' && /resets on the 1st/.test(e.message));
  assert.throws(() => credits.assertWithinCap(4.99, 0.4, 5), e => e.code === 'CREDITS_EXHAUSTED' && /Quick depth/.test(e.message));
  assert.throws(() => credits.assertWithinCap(500, 1, 500, 'platform'), e => e.code === 'PLATFORM_CAP' && e.status === 503);
});
test('margin guard: every paid plan caps cost at no more than price / 2.5; free plans have a small fixed allowance', () => {
  const paid = [...catalog.SEARCH_PLANS, ...catalog.BUNDLES].filter(p => p.id !== 'search_free');
  for (const p of paid) {
    const pol = policy.policyFor(p.id);
    if (p.id.startsWith('bundle_builder')) continue;                         // no search inside
    const cap = policy.monthlyCapUsd(pol);
    assert.ok(cap > 0, p.id);
    assert.ok(credits.marginCheck(pol.priceMonthlyUsd, cap, 2.5).ok, `${p.id}: ${pol.priceMonthlyUsd} vs cap ${cap}`);
  }
  for (const id of ['starter', 'plus', 'pro', 'max', 'business']) { const pol = policy.policyFor(id); assert.ok(credits.marginCheck(pol.priceMonthlyUsd, policy.monthlyCapUsd(pol), 2.5).ok, id); }
  assert.equal(policy.monthlyCapUsd(policy.policyFor('search_free')), policy.FREE_ALLOWANCE_USD);
  assert.equal(policy.monthlyCapUsd(policy.policyFor('search_pro')), 6.26);       // $15.66 / 2.5, rounded down
  assert.equal(policy.monthlyCapUsd(policy.policyFor('search_max')), 65.73);      // $164.33 / 2.5, rounded down
});
test('margin guard: anything priced below the multiplier times its cost is flagged', () => {
  assert.equal(credits.marginCheck(15.66, 6.26, 2.5).ok, true);
  const bad = credits.marginCheck(15.66, 7, 2.5);
  assert.equal(bad.ok, false); assert.equal(bad.requiredPriceUsd, 17.5);
  assert.equal(credits.marginCheck(10, 0, 2.5).ok, true);
});

// ---------- ledger, against a real database ----------
let db, ledger;
const KEEP = { skip: skipDb };
test('ledger: setup', KEEP, async () => { db = await openTestDb(); ledger = new credits.CreditLedger(db); });
const entry = (userId, costUsd, extra = {}) => ({ userId, planId: 'search_pro', provider: 'claude', model: 'm', costUsd, costStatus: 'known', ...extra });
test('ledger: spend adds up per month and per account, and shows before/after', KEEP, async () => {
  const a = await makeUser(db), b = await makeUser(db);
  assert.equal(await ledger.spent({ userId: a.id }), 0);
  const r1 = await ledger.record(entry(a.id, 1.25)); assert.deepEqual([r1.before, r1.after], [0, 1.25]);
  const r2 = await ledger.record(entry(a.id, 0.5)); assert.deepEqual([r2.before, r2.after], [1.25, 1.75]);
  await ledger.record(entry(b.id, 9));
  assert.equal(await ledger.spent({ userId: a.id }), 1.75);
  await ledger.record(entry(a.id, 3), new Date(Date.now() - 40 * 86_400_000));   // an older month does not count
  assert.equal(await ledger.spent({ userId: a.id }), 1.75);
  assert.ok(await ledger.platformSpent() >= 10.75);
});
test('ledger: Business seats share one pool', KEEP, async () => {
  const owner = await makeUser(db), member = await makeUser(db);
  const sub = await db.one(`INSERT INTO ai_subscriptions(owner_user_id, tier, status, seats) VALUES ($1, 'business', 'active', 2) RETURNING id`, [owner.id]);
  await ledger.record(entry(owner.id, 2, { subscriptionId: sub.id })); await ledger.record(entry(member.id, 3, { subscriptionId: sub.id }));
  assert.equal(await ledger.spent({ userId: member.id, subscriptionId: sub.id }), 5);
  assert.equal(await ledger.spent({ userId: member.id }), 0);
});
test('ledger: the 80% and 100% notices fire once a month; margin flags are one per account per month', KEEP, async () => {
  const u = await makeUser(db);
  assert.equal(await ledger.firstNotice(u.id, 'warn80'), true); assert.equal(await ledger.firstNotice(u.id, 'warn80'), false);
  assert.equal(await ledger.firstNotice(u.id, 'limit100'), true); assert.equal(await ledger.firstNotice(u.id, 'warn80', '2020-01'), true);
  assert.equal(await ledger.flagMargin({ userId: u.id, planId: 'search_pro', priceUsd: 15.66, costUsd: 7, multiplier: 2.5 }), true);
  await ledger.flagMargin({ userId: u.id, planId: 'search_pro', priceUsd: 15.66, costUsd: 8, multiplier: 2.5 });
  const rows = await db.query('SELECT cost_usd FROM ai_margin_flags WHERE user_id = $1', [u.id]);
  assert.equal(rows.length, 1); assert.equal(Number(rows[0].cost_usd), 8);
});
test('ledger: pending costs are recorded as pending, not silently zero', KEEP, async () => {
  const u = await makeUser(db);
  await ledger.record(entry(u.id, 0, { costStatus: 'pending' }));
  assert.equal((await db.one(`SELECT cost_status FROM ai_credit_ledger WHERE user_id = $1`, [u.id])).cost_status, 'pending');
});
test('ledger: teardown', KEEP, async () => { await db.close(); });

test('userTurn: preferences go in plainly, before the question; earlier notes stay marked as data', () => {
  const { userTurn } = require(dist + 'ai-router/adapters/common.js');
  const t = userTurn({ question: 'Best tacos?', preferences: ['Answer in Spanish.'], extraContext: '<note>x</note>' }, new Date('2026-10-23T12:00:00Z'));
  assert.match(t, /^Today's date: 2026-10-23\nAnswer in Spanish\.\n\nBest tacos\?/);
  assert.match(t, /<earlier_conversations>\n<note>x<\/note>\n<\/earlier_conversations>$/);
});
