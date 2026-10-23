import { DOWNGRADE_READ_ONLY_DAYS } from '../shared/pricing-catalog';
import { FieldCipher, termsOf } from './crypto';
import {
  EntitlementRow, HistoryAccess, NO_HISTORY, entitlementColumns, parseAutoDelete, purgeCutoff, resolveHistoryAccess,
} from './rules';

// Saved conversations, favorites, Spaces and entitlements, on the tables from migration 006.
// No framework in here: it takes anything with query/one/tx, so the same code runs in the API and in the tests.
// Every read and write is scoped to one user id, in SQL, so one person can never reach another's rows.

export interface DbLike {
  query<T = any>(text: string, params?: unknown[]): Promise<T[]>;
  one<T = any>(text: string, params?: unknown[]): Promise<T | null>;
}

export class HistoryError extends Error {
  constructor(message: string, readonly status: number = 400, readonly code?: string) { super(message); }
}

const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'];
const MAX_TITLE = 120;
const MAX_MESSAGE = 100_000;
const MAX_SPACE_NAME = 60;
const ID_RE = /^[a-f0-9]{24}$/;

export interface SavedSource { url: string; title: string; cited?: boolean }
export interface ConversationSummary { id: string; title: string; updated_date: string; created_date: string; pinned: boolean; favorite: boolean; space: { id: string; name: string } | null; auto_delete_days: number | null; mode: string }

export class HistoryStore {
  constructor(private readonly db: DbLike, private readonly cipher: FieldCipher) {}

  private enc(userId: string, field: string, value: string) { return this.cipher.encrypt(value, `${userId}:${field}`); }
  private dec(userId: string, field: string, token: string, fallback = '') { return this.cipher.tryDecrypt(token, `${userId}:${field}`, fallback); }
  private assertId(id: string, what = 'Conversation') { if (!ID_RE.test(String(id))) throw new HistoryError(`${what} not found.`, 404); }

  // ---------- entitlements ----------

  async entitlementRows(userId: string): Promise<EntitlementRow[]> {
    return this.db.query<EntitlementRow>(
      `SELECT plan_id, status, ended_at, retention_days, full_text_search, bulk_export, memory FROM entitlements WHERE user_id = $1 AND feature = 'history'`, [userId]);
  }

  async access(userId: string, now: Date = new Date()): Promise<HistoryAccess> {
    return resolveHistoryAccess(await this.entitlementRows(userId), now);
  }

  // Recomputes one person's history entitlements from their subscriptions. Call after any plan starts, changes or ends.
  async syncEntitlements(userId: string) {
    type Want = { source: string; source_id: string; plan_id: string; active: boolean; ended_at: string | null };
    const wants: Want[] = [];
    const own = await this.db.query<any>('SELECT id, tier, status, updated_date, canceled_date FROM ai_subscriptions WHERE owner_user_id = $1', [userId]);
    for (const s of own) wants.push({ source: 'ai_subscription', source_id: s.id, plan_id: s.tier, active: ACTIVE_STATUSES.includes(s.status), ended_at: s.canceled_date ?? s.updated_date });
    // A seat on someone else's Business plan.
    const seats = await this.db.query<any>(
      `SELECT s.id, s.tier, s.status, s.updated_date FROM ai_seats seat JOIN ai_subscriptions s ON s.id = seat.subscription_id
        WHERE seat.user_id = $1 AND s.owner_user_id <> $1`, [userId]);
    for (const s of seats) wants.push({ source: 'ai_subscription', source_id: `${s.id}:${userId}`, plan_id: s.tier, active: ACTIVE_STATUSES.includes(s.status), ended_at: s.updated_date });
    const plans = await this.db.query<any>('SELECT id, plan_id, status, updated_date, canceled_date FROM plan_subscriptions WHERE owner_user_id = $1', [userId]);
    for (const p of plans) wants.push({ source: 'plan_subscription', source_id: p.id, plan_id: p.plan_id, active: ACTIVE_STATUSES.includes(p.status), ended_at: p.canceled_date ?? p.updated_date });

    const seen = new Set<string>();
    for (const w of wants) {
      const cols = entitlementColumns(w.plan_id);
      if (!cols) continue;
      seen.add(`${w.source}|${w.source_id}`);
      await this.db.query(
        `INSERT INTO entitlements(user_id, feature, plan_id, source, source_id, retention_days, full_text_search, bulk_export, memory, status, ended_at)
         VALUES ($1, 'history', $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (source, source_id, feature) DO UPDATE SET plan_id = EXCLUDED.plan_id, retention_days = EXCLUDED.retention_days,
           full_text_search = EXCLUDED.full_text_search, bulk_export = EXCLUDED.bulk_export, memory = EXCLUDED.memory,
           status = EXCLUDED.status, ended_at = CASE WHEN EXCLUDED.status = 'active' THEN NULL ELSE COALESCE(entitlements.ended_at, EXCLUDED.ended_at) END,
           updated_date = now()`,
        [userId, w.plan_id, w.source, w.source_id, cols.retention_days, cols.full_text_search, cols.bulk_export, cols.memory,
          w.active ? 'active' : 'ended', w.active ? null : (w.ended_at ?? new Date().toISOString())]);
    }
    // Anything we used to grant from a subscription that no longer exists ends now.
    const existing = await this.db.query<any>(`SELECT source, source_id FROM entitlements WHERE user_id = $1 AND source <> 'admin' AND status = 'active'`, [userId]);
    for (const e of existing) {
      if (!seen.has(`${e.source}|${e.source_id}`)) await this.db.query(`UPDATE entitlements SET status = 'ended', ended_at = now(), updated_date = now() WHERE user_id = $1 AND source = $2 AND source_id = $3`, [userId, e.source, e.source_id]);
    }
  }

  async syncAllEntitlements(): Promise<number> {
    const users = await this.db.query<{ id: string }>(
      `SELECT owner_user_id AS id FROM ai_subscriptions UNION SELECT owner_user_id FROM plan_subscriptions
       UNION SELECT user_id FROM ai_seats WHERE user_id IS NOT NULL UNION SELECT user_id FROM entitlements WHERE source <> 'admin'`);
    for (const u of users) await this.syncEntitlements(u.id);
    return users.length;
  }

  // ---------- conversations ----------

  async createConversation(userId: string, p: { title: string; mode?: string; planId?: string | null; spaceId?: string | null }): Promise<string> {
    const title = p.title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) || 'New conversation';
    const settings = await this.settings(userId);
    const row = await this.db.one<{ id: string }>(
      `INSERT INTO conversations(user_id, title_enc, mode, plan_id, space_id, auto_delete_days) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, this.enc(userId, 'title', title), p.mode || 'search', p.planId ?? null, p.spaceId ?? null, settings.default_auto_delete_days]);
    return row!.id;
  }

  async appendMessage(userId: string, conversationId: string, m: { role: 'user' | 'assistant'; content: string; engine?: string | null; sources?: SavedSource[] }): Promise<number> {
    this.assertId(conversationId);
    const owned = await this.db.one('SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2', [conversationId, userId]);
    if (!owned) throw new HistoryError('Conversation not found.', 404);
    const content = m.content.slice(0, MAX_MESSAGE);
    const terms = this.cipher.blindTerms(userId, content);
    const row = await this.db.one<{ id: string }>(
      `INSERT INTO messages(conversation_id, role, content_enc, engine, terms) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [conversationId, m.role, this.enc(userId, 'message', content), m.engine ?? null, terms]);
    const id = Number(row!.id);
    let position = 0;
    for (const s of (m.sources ?? []).slice(0, 40)) {
      position += 1;
      await this.db.query(
        `INSERT INTO conversation_sources(conversation_id, message_id, position, url_enc, title_enc, cited) VALUES ($1, $2, $3, $4, $5, $6)`,
        [conversationId, id, position, this.enc(userId, 'source', String(s.url).slice(0, 500)), this.enc(userId, 'source', String(s.title || s.url).slice(0, 200)), !!s.cited]);
    }
    await this.db.query('UPDATE conversations SET updated_date = now() WHERE id = $1', [conversationId]);
    return id;
  }

  async get(userId: string, id: string) {
    this.assertId(id);
    const c = await this.db.one<any>(
      `SELECT c.*, s.name_enc AS space_name_enc, EXISTS (SELECT 1 FROM favorites f WHERE f.conversation_id = c.id AND f.message_id IS NULL) AS favorite
         FROM conversations c LEFT JOIN spaces s ON s.id = c.space_id WHERE c.id = $1 AND c.user_id = $2`, [id, userId]);
    if (!c) throw new HistoryError('Conversation not found.', 404);
    const rows = await this.db.query<any>(
      `SELECT m.id, m.role, m.content_enc, m.engine, m.created_date,
              EXISTS (SELECT 1 FROM favorites f WHERE f.message_id = m.id) AS favorite
         FROM messages m WHERE m.conversation_id = $1 ORDER BY m.id`, [id]);
    const sources = await this.db.query<any>(`SELECT message_id, position, url_enc, title_enc, cited FROM conversation_sources WHERE conversation_id = $1 ORDER BY message_id, position`, [id]);
    const byMessage = new Map<string, any[]>();
    for (const s of sources) {
      const list = byMessage.get(String(s.message_id)) ?? [];
      list.push({ n: s.position, url: this.dec(userId, 'source', s.url_enc), title: this.dec(userId, 'source', s.title_enc), cited: s.cited });
      byMessage.set(String(s.message_id), list);
    }
    return {
      ...this.summary(userId, c),
      messages: rows.map(m => ({ id: Number(m.id), role: m.role, content: this.dec(userId, 'message', m.content_enc, '[This message could not be opened.]'), engine: m.engine, created_date: m.created_date, favorite: m.favorite, sources: byMessage.get(String(m.id)) ?? [] })),
    };
  }

  private summary(userId: string, c: any): ConversationSummary {
    return {
      id: c.id, title: this.dec(userId, 'title', c.title_enc, 'Untitled'), updated_date: c.updated_date, created_date: c.created_date,
      pinned: c.pinned, favorite: !!c.favorite, auto_delete_days: c.auto_delete_days, mode: c.mode,
      space: c.space_id ? { id: c.space_id, name: this.dec(userId, 'space', c.space_name_enc ?? '', '') } : null,
    };
  }

  // Newest first, pinned on top. q matches titles; with fullText it also matches every word of q inside message text
  // (whole words, through the blind index). favorites=true limits to starred conversations.
  async list(userId: string, o: { q?: string; spaceId?: string; favorites?: boolean; fullText?: boolean; limit?: number } = {}): Promise<ConversationSummary[]> {
    const params: unknown[] = [userId];
    const where = ['c.user_id = $1'];
    if (o.spaceId) { this.assertId(o.spaceId, 'Space'); params.push(o.spaceId); where.push(`c.space_id = $${params.length}`); }
    if (o.favorites) where.push('EXISTS (SELECT 1 FROM favorites f WHERE f.conversation_id = c.id)');
    const q = (o.q ?? '').trim().slice(0, 200);
    let textIds: Set<string> | null = null;
    if (q && o.fullText) {
      const terms = this.cipher.blindTerms(userId, q);
      if (terms.length) {
        const hits = await this.db.query<{ conversation_id: string }>(
          `SELECT DISTINCT m.conversation_id FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.user_id = $1 AND m.terms @> $2::text[]`, [userId, terms]);
        textIds = new Set(hits.map(h => h.conversation_id));
      }
    }
    const rows = await this.db.query<any>(
      `SELECT c.*, s.name_enc AS space_name_enc, EXISTS (SELECT 1 FROM favorites f WHERE f.conversation_id = c.id AND f.message_id IS NULL) AS favorite
         FROM conversations c LEFT JOIN spaces s ON s.id = c.space_id WHERE ${where.join(' AND ')}
        ORDER BY c.pinned DESC, c.updated_date DESC LIMIT ${q ? 1000 : Math.min(o.limit ?? 200, 500)}`, params);
    let out = rows.map(r => this.summary(userId, r));
    if (q) {
      const needle = q.toLowerCase();
      out = out.filter(c => c.title.toLowerCase().includes(needle) || textIds?.has(c.id));
    }
    return out.slice(0, o.limit ?? 200);
  }

  async update(userId: string, id: string, patch: { title?: string; pinned?: boolean; spaceId?: string | null; autoDeleteDays?: unknown }) {
    this.assertId(id);
    const sets: string[] = []; const params: unknown[] = [id, userId];
    const put = (col: string, v: unknown) => { params.push(v); sets.push(`${col} = $${params.length}`); };
    if (patch.title !== undefined) { const t = patch.title.trim().slice(0, MAX_TITLE); if (!t) throw new HistoryError('Give the conversation a name.'); put('title_enc', this.enc(userId, 'title', t)); }
    if (patch.pinned !== undefined) put('pinned', patch.pinned === true);
    if (patch.spaceId !== undefined) {
      if (patch.spaceId) { this.assertId(patch.spaceId, 'Space'); const own = await this.db.one('SELECT 1 FROM spaces WHERE id = $1 AND user_id = $2', [patch.spaceId, userId]); if (!own) throw new HistoryError('Space not found.', 404); }
      put('space_id', patch.spaceId || null);
    }
    if (patch.autoDeleteDays !== undefined) {
      try { put('auto_delete_days', parseAutoDelete(patch.autoDeleteDays)); } catch (e) { throw new HistoryError((e as Error).message); }
    }
    if (!sets.length) throw new HistoryError('Nothing to change.');
    const row = await this.db.one('UPDATE conversations SET ' + sets.join(', ') + ' WHERE id = $1 AND user_id = $2 RETURNING id', params);
    if (!row) throw new HistoryError('Conversation not found.', 404);
    return this.get(userId, id);
  }

  // Deleting is always allowed, whatever the plan: it is the person's own data.
  async remove(userId: string, id: string) {
    this.assertId(id);
    const rows = await this.db.query('DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
    if (!rows.length) throw new HistoryError('Conversation not found.', 404);
    return { deleted: 1 };
  }
  async removeAll(userId: string) {
    const rows = await this.db.query('DELETE FROM conversations WHERE user_id = $1 RETURNING id', [userId]);
    await this.db.query('DELETE FROM spaces WHERE user_id = $1', [userId]);
    return { deleted: rows.length };
  }

  // ---------- Spaces and favorites ----------

  async spaces(userId: string) {
    const rows = await this.db.query<any>(
      `SELECT s.id, s.name_enc, s.created_date, count(c.id)::int AS conversations FROM spaces s LEFT JOIN conversations c ON c.space_id = s.id WHERE s.user_id = $1 GROUP BY s.id ORDER BY s.created_date`, [userId]);
    return rows.map(r => ({ id: r.id, name: this.dec(userId, 'space', r.name_enc), conversations: r.conversations, created_date: r.created_date }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  async createSpace(userId: string, rawName: string) {
    const name = rawName.replace(/\s+/g, ' ').trim().slice(0, MAX_SPACE_NAME);
    if (!name) throw new HistoryError('Give the Space a name.');
    const hash = this.cipher.blind(userId, name.toLowerCase());
    const row = await this.db.one<{ id: string }>(
      `INSERT INTO spaces(user_id, name_enc, name_hash) VALUES ($1, $2, $3) ON CONFLICT (user_id, name_hash) DO NOTHING RETURNING id`, [userId, this.enc(userId, 'space', name), hash]);
    if (!row) throw new HistoryError('You already have a Space with that name.', 409);
    return { id: row.id, name, conversations: 0 };
  }
  async renameSpace(userId: string, id: string, rawName: string) {
    this.assertId(id, 'Space');
    const name = rawName.replace(/\s+/g, ' ').trim().slice(0, MAX_SPACE_NAME);
    if (!name) throw new HistoryError('Give the Space a name.');
    const clash = await this.db.one('SELECT 1 FROM spaces WHERE user_id = $1 AND name_hash = $2 AND id <> $3', [userId, this.cipher.blind(userId, name.toLowerCase()), id]);
    if (clash) throw new HistoryError('You already have a Space with that name.', 409);
    const row = await this.db.one('UPDATE spaces SET name_enc = $3, name_hash = $4, updated_date = now() WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId, this.enc(userId, 'space', name), this.cipher.blind(userId, name.toLowerCase())]);
    if (!row) throw new HistoryError('Space not found.', 404);
    return { id, name };
  }
  async deleteSpace(userId: string, id: string) {
    this.assertId(id, 'Space');
    const rows = await this.db.query('DELETE FROM spaces WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
    if (!rows.length) throw new HistoryError('Space not found.', 404);
    return { deleted: true };   // its conversations are kept, just no longer in a Space
  }

  async setFavorite(userId: string, conversationId: string, on: boolean, messageId: number | null = null) {
    this.assertId(conversationId);
    const own = await this.db.one('SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2', [conversationId, userId]);
    if (!own) throw new HistoryError('Conversation not found.', 404);
    if (messageId != null) {
      const inside = await this.db.one('SELECT 1 FROM messages WHERE id = $1 AND conversation_id = $2', [messageId, conversationId]);
      if (!inside) throw new HistoryError('Message not found.', 404);
    }
    if (on) await this.db.query('INSERT INTO favorites(user_id, conversation_id, message_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [userId, conversationId, messageId]);
    else await this.db.query('DELETE FROM favorites WHERE user_id = $1 AND conversation_id = $2 AND COALESCE(message_id, 0) = COALESCE($3::bigint, 0)', [userId, conversationId, messageId]);
    return { favorite: on };
  }

  // ---------- settings and memory ----------

  async settings(userId: string): Promise<{ memory_enabled: boolean; default_auto_delete_days: number | null }> {
    return (await this.db.one('SELECT memory_enabled, default_auto_delete_days FROM history_settings WHERE user_id = $1', [userId])) ?? { memory_enabled: false, default_auto_delete_days: null };
  }
  async updateSettings(userId: string, patch: { memoryEnabled?: boolean; defaultAutoDeleteDays?: unknown }, access: HistoryAccess) {
    const cur = await this.settings(userId);
    let memory = cur.memory_enabled; let days = cur.default_auto_delete_days;
    if (patch.memoryEnabled !== undefined) {
      if (patch.memoryEnabled === true && !(access.allowed && !access.readOnly && access.memory)) throw new HistoryError('Memory comes with Search Max and All-In-One.', 403, 'PLAN_REQUIRED');
      memory = patch.memoryEnabled === true;
    }
    if (patch.defaultAutoDeleteDays !== undefined) { try { days = parseAutoDelete(patch.defaultAutoDeleteDays); } catch (e) { throw new HistoryError((e as Error).message); } }
    await this.db.query(
      `INSERT INTO history_settings(user_id, memory_enabled, default_auto_delete_days) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET memory_enabled = EXCLUDED.memory_enabled, default_auto_delete_days = EXCLUDED.default_auto_delete_days, updated_date = now()`, [userId, memory, days]);
    return { memory_enabled: memory, default_auto_delete_days: days };
  }

  // Earlier messages that share the most words with this question (never from the conversation being answered).
  async memorySnippets(userId: string, question: string, excludeConversationId: string | null, limit = 3): Promise<string[]> {
    const terms = this.cipher.blindTerms(userId, question);
    if (!terms.length) return [];
    const rows = await this.db.query<any>(
      `SELECT m.content_enc, m.role, cardinality(ARRAY(SELECT unnest(m.terms) INTERSECT SELECT unnest($2::text[]))) AS overlap
         FROM messages m JOIN conversations c ON c.id = m.conversation_id
        WHERE c.user_id = $1 AND m.terms && $2::text[] AND ($3::text IS NULL OR c.id <> $3)
        ORDER BY overlap DESC, m.id DESC LIMIT $4`, [userId, terms, excludeConversationId, limit]);
    return rows.map(r => this.dec(userId, 'message', r.content_enc).replace(/\s+/g, ' ').slice(0, 600)).filter(Boolean);
  }

  // ---------- export ----------

  async exportAll(userId: string) {
    const list = await this.list(userId, { limit: 5000 });
    const conversations = [];
    for (const c of list) conversations.push(await this.get(userId, c.id));
    const spaces = await this.spaces(userId);
    return { exported_at: new Date().toISOString(), spaces, conversations };
  }

  // ---------- nightly housekeeping ----------

  async expire(now: Date = new Date()) {
    const out = { autoDeleted: 0, retentionDeleted: 0, purged: 0 };
    // 1. People's own auto-delete choice (pinned conversations are kept).
    out.autoDeleted = (await this.db.query(
      `DELETE FROM conversations WHERE auto_delete_days IS NOT NULL AND pinned = false AND updated_date < $1::timestamptz - make_interval(days => auto_delete_days) RETURNING id`, [now.toISOString()])).length;
    // 2. Plans that keep history for a fixed time (12 months): anything older goes.
    out.retentionDeleted = (await this.db.query(
      `DELETE FROM conversations c USING (
         SELECT user_id, max(retention_days) AS days FROM entitlements WHERE feature = 'history' AND status = 'active'
          GROUP BY user_id HAVING bool_and(retention_days IS NOT NULL)) r
        WHERE c.user_id = r.user_id AND c.updated_date < $1::timestamptz - make_interval(days => r.days) RETURNING c.id`, [now.toISOString()])).length;
    // 3. People whose plan ended long ago (past the 30-day read-only window plus the grace period) and did not come back.
    const cutoff = purgeCutoff(now).toISOString();
    out.purged = (await this.db.query(
      `DELETE FROM conversations c WHERE NOT EXISTS (SELECT 1 FROM entitlements e WHERE e.user_id = c.user_id AND e.feature = 'history' AND e.status = 'active')
          AND COALESCE((SELECT max(e.ended_at) FROM entitlements e WHERE e.user_id = c.user_id AND e.feature = 'history'), c.updated_date) < $1::timestamptz RETURNING c.id`, [cutoff])).length;
    await this.db.query(`DELETE FROM spaces s WHERE NOT EXISTS (SELECT 1 FROM conversations c WHERE c.space_id = s.id) AND NOT EXISTS (SELECT 1 FROM entitlements e WHERE e.user_id = s.user_id AND e.feature = 'history' AND (e.status = 'active' OR e.ended_at > $1::timestamptz))`, [cutoff]);
    return out;
  }

  // ---------- one-time copy of the earlier ai_threads / ai_messages tables ----------

  async importLegacy(batch = 100): Promise<number> {
    const threads = await this.db.query<any>(
      `SELECT t.* FROM ai_threads t WHERE NOT EXISTS (SELECT 1 FROM conversations c WHERE c.legacy_thread_id = t.id) ORDER BY t.created_date LIMIT $1`, [batch]);
    for (const t of threads) {
      let spaceId: string | null = null;
      if (t.space) {
        const found = await this.db.one<{ id: string }>('SELECT id FROM spaces WHERE user_id = $1 AND name_hash = $2', [t.user_id, this.cipher.blind(t.user_id, String(t.space).toLowerCase())]);
        spaceId = found?.id ?? (await this.createSpace(t.user_id, String(t.space))).id;
      }
      const conv = await this.db.one<{ id: string }>(
        `INSERT INTO conversations(user_id, title_enc, space_id, pinned, auto_delete_days, legacy_thread_id, created_date, updated_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [t.user_id, this.enc(t.user_id, 'title', String(t.title).slice(0, MAX_TITLE)), spaceId, !!t.pinned, t.auto_delete_days ?? null, t.id, t.created_date, t.updated_date]);
      const msgs = await this.db.query<any>('SELECT role, content, sources, created_date FROM ai_messages WHERE thread_id = $1 ORDER BY id', [t.id]);
      for (const m of msgs) {
        const id = await this.appendMessage(t.user_id, conv!.id, { role: m.role, content: m.content, sources: Array.isArray(m.sources) ? m.sources : [] });
        await this.db.query('UPDATE messages SET created_date = $2 WHERE id = $1', [id, m.created_date]);
      }
      await this.db.query('UPDATE conversations SET updated_date = $2 WHERE id = $1', [conv!.id, t.updated_date]);
      if (t.favorite) await this.setFavorite(t.user_id, conv!.id, true);
    }
    return threads.length;
  }
}

export { NO_HISTORY, DOWNGRADE_READ_ONLY_DAYS };
