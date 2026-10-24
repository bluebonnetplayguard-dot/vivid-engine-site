import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AuthUser } from '../auth/guard';
import { config, isProd } from '../config';
import { Db } from '../db';
import { ApiError } from '../errors';
import { str } from '../shared/guards';
import { cipherFromEnv } from './crypto';
import { HistoryError, HistoryStore } from './store';
import { HistoryAccess, NO_HISTORY, canExport, publicAccess } from './rules';

// Saved conversation history for paid plans. All rules live in ./rules, all storage in ./store;
// this is the thin Nest layer: it turns store errors into API errors and runs the nightly job.
@Injectable()
export class HistoryService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('History');
  readonly store: HistoryStore | null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly db: Db) {
    const cipher = cipherFromEnv(config, isProd);
    this.store = cipher ? new HistoryStore(db, cipher) : null;
    if (!cipher) this.log.error('HISTORY_ENCRYPTION_KEY is not set: saved history is switched off until it is (nothing is stored unencrypted).');
    else if (!config.HISTORY_ENCRYPTION_KEY) this.log.warn('HISTORY_ENCRYPTION_KEY is not set: using a temporary key, so saved history will not survive a restart.');
  }

  get enabled() { return !!this.store; }

  onModuleInit() {
    if (!this.store) return;
    const run = () => this.nightly().catch(e => this.log.warn(`History housekeeping failed: ${e.message}`));
    setTimeout(run, 45_000).unref();
    this.timer = setInterval(run, 6 * 3600_000);   // expiry is idempotent, so running it every few hours is the same as nightly
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async nightly() {
    if (!this.store) return;
    const imported = await this.store.importLegacy(500);
    const users = await this.store.syncAllEntitlements();
    const r = await this.store.expire();
    if (imported || r.autoDeleted || r.retentionDeleted || r.purged) {
      this.log.log(`Housekeeping: copied ${imported} earlier conversation(s), removed ${r.autoDeleted} auto-deleted, ${r.retentionDeleted} past retention, ${r.purged} locked; refreshed ${users} account(s).`);
    }
  }

  // Runs a store call and turns its errors into API errors.
  private async run<T>(fn: (s: HistoryStore) => Promise<T>): Promise<T> {
    if (!this.store) throw new ApiError(503, 'Saved conversations are not available right now.', { code: 'HISTORY_OFF' });
    try { return await fn(this.store); }
    catch (e) {
      if (e instanceof HistoryError) throw new ApiError(e.status, e.message, e.code ? { code: e.code } : {});
      throw e;
    }
  }

  // ---------- access ----------

  async access(user: AuthUser): Promise<HistoryAccess> {
    if (!this.store) return NO_HISTORY;
    return this.store.access(user.id);
  }
  async publicState(user: AuthUser) {
    const access = await this.access(user);
    const settings = this.store && access.allowed ? await this.store.settings(user.id) : { memory_enabled: false, default_auto_delete_days: null };
    return { ...publicAccess(access), enabled: this.enabled, memoryEnabled: settings.memory_enabled && access.memory && !access.readOnly, defaultAutoDeleteDays: settings.default_auto_delete_days };
  }
  async refreshEntitlements(userId: string) { if (this.store) await this.store.syncEntitlements(userId).catch(e => this.log.warn(`Entitlement refresh failed: ${e.message}`)); }

  private async need(user: AuthUser, write = false): Promise<HistoryAccess> {
    const a = await this.access(user);
    if (!a.allowed) throw new ApiError(403, 'Saved conversations come with a paid plan.', { code: 'PLAN_REQUIRED' });
    if (write && a.readOnly) throw new ApiError(403, `Your plan has ended, so saved conversations are read-only until ${a.readOnlyUntil?.slice(0, 10)}. Renew to keep adding to them.`, { code: 'READ_ONLY' });
    return a;
  }

  // ---------- used while answering ----------

  open(user: AuthUser, title: string, mode: string, planId: string | null) { return this.run(s => s.createConversation(user.id, { title, mode, planId })); }
  addMessage(user: AuthUser, conversationId: string, m: Parameters<HistoryStore['appendMessage']>[2]) { return this.run(s => s.appendMessage(user.id, conversationId, m)); }
  async recentTurns(user: AuthUser, conversationId: string, turns: number): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
    const c = await this.run(s => s.get(user.id, conversationId));
    return c.messages.slice(-turns).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })).filter(m => m.content.trim());
  }
  title(user: AuthUser, conversationId: string) { return this.run(async s => (await s.get(user.id, conversationId)).title); }
  async memory(user: AuthUser, question: string, conversationId: string | null): Promise<string[]> {
    if (!this.store) return [];
    const a = await this.access(user);
    const settings = await this.store.settings(user.id);
    if (!a.allowed || a.readOnly || !a.memory || !settings.memory_enabled) return [];
    return this.store.memorySnippets(user.id, question, conversationId).catch(() => []);
  }

  // ---------- the API ----------

  async list(user: AuthUser, query: { q?: string; space?: string; favorites?: string } = {}) {
    const a = await this.access(user);
    if (!a.allowed) return [];
    return this.run(s => s.list(user.id, { q: str(query.q, 200) || undefined, spaceId: str(query.space, 24) || undefined, favorites: query.favorites === 'true', fullText: a.fullTextSearch }));
  }
  async get(user: AuthUser, id: string) {
    const a = await this.need(user);
    const c = await this.run(s => s.get(user.id, id));
    return { ...c, readOnly: a.readOnly };
  }
  async update(user: AuthUser, id: string, body: any) {
    await this.need(user, true);
    return this.run(async s => {
      const patch: Parameters<HistoryStore['update']>[2] = {};
      if (body?.title !== undefined) patch.title = String(body.title);
      if (body?.pinned !== undefined) patch.pinned = body.pinned === true;
      if (body?.spaceId !== undefined) patch.spaceId = body.spaceId === null || body.spaceId === '' ? null : String(body.spaceId);
      if (body?.autoDeleteDays !== undefined) patch.autoDeleteDays = body.autoDeleteDays;
      if (body?.favorite !== undefined) await s.setFavorite(user.id, id, body.favorite === true);
      if (Object.keys(patch).length) return s.update(user.id, id, patch);
      if (body?.favorite === undefined) throw new HistoryError('Nothing to change.');
      return s.get(user.id, id);
    });
  }
  // Deleting is always allowed, whatever the plan: it is the person's own data.
  remove(user: AuthUser, id: string) { return this.run(s => s.remove(user.id, id)); }
  removeAll(user: AuthUser) { return this.run(s => s.removeAll(user.id)); }

  async exportAll(user: AuthUser) {
    const a = await this.need(user);
    if (!canExport(a)) throw new ApiError(403, 'Export comes with Search Max and All-In-One.', { code: 'PLAN_REQUIRED' });
    return this.run(s => s.exportAll(user.id));
  }

  async spaces(user: AuthUser) { await this.need(user); return this.run(s => s.spaces(user.id)); }
  async createSpace(user: AuthUser, name: unknown) { await this.need(user, true); return this.run(s => s.createSpace(user.id, String(name ?? ''))); }
  async renameSpace(user: AuthUser, id: string, name: unknown) { await this.need(user, true); return this.run(s => s.renameSpace(user.id, id, String(name ?? ''))); }
  async deleteSpace(user: AuthUser, id: string) { return this.run(s => s.deleteSpace(user.id, id)); }

  async updateSettings(user: AuthUser, body: any) {
    const a = await this.need(user, true);
    return this.run(s => s.updateSettings(user.id, { memoryEnabled: body?.memoryEnabled, defaultAutoDeleteDays: body?.defaultAutoDeleteDays }, a));
  }
}
