// Approval gate + roles + audit log. Writes are proposed with a plain preview and applied only on approval.
// There is no auto-approve mode.
import type { Ctx, Role, TakeoffProvider, WriteMethod } from './provider.ts';

const CAN_WRITE: Record<Role, boolean> = { owner: true, estimator: true, viewer: false };
export interface Pending { id: string; companyId: string; requestedBy: string; provider: string; method: WriteMethod; args: unknown[]; summary: string; status: 'pending' | 'approved' | 'rejected' | 'failed'; result?: unknown; error?: string }
export interface AuditRow { companyId: string; userId: string; action: string; target?: string; detail?: unknown; at: string }

export function summarize(method: WriteMethod, args: unknown[]): string {
  const n = (a: unknown) => (Array.isArray(a) ? a.length : 1);
  switch (method) {
    case 'createProject': return `Create project "${(args[0] as any)?.name}"`;
    case 'updateProject': return `Update project ${args[0]}: ${Object.keys(args[1] as object).join(', ')}`;
    case 'createTakeoff': return `Create takeoff "${(args[0] as any)?.name}"`;
    case 'editTakeoffs': return `Update ${n(args[0])} takeoff${n(args[0]) === 1 ? '' : 's'}`;
    case 'importLibraryItems': return `Import ${n(args[0])} library item${n(args[0]) === 1 ? '' : 's'}`;
    case 'copyToLibrary': return `Copy ${n(args[0])} takeoff${n(args[0]) === 1 ? '' : 's'} into the library`;
    case 'tagLibraryItems': return `Tag ${n(args[0])} item${n(args[0]) === 1 ? '' : 's'} with ${(args[1] as string[]).join(', ')}`;
    case 'importCompanyLabels': return `Import ${n(args[0])} company label${n(args[0]) === 1 ? '' : 's'}`;
  }
}

export class ApprovalGate {
  pending: Pending[] = [];
  audit: AuditRow[] = [];
  private seq = 0;
  private providers: Record<string, TakeoffProvider>;
  constructor(providers: Record<string, TakeoffProvider>) { this.providers = providers; }

  private log(ctx: Ctx, action: string, target?: string, detail?: unknown) {
    this.audit.push({ companyId: ctx.companyId, userId: ctx.userId, action, target, detail, at: new Date().toISOString() });
  }

  propose(ctx: Ctx, provider: string, method: WriteMethod, ...args: unknown[]): Pending {
    if (!CAN_WRITE[ctx.role]) throw new Error('Your role can view but not change takeoffs.');
    const p = this.providers[provider];
    if (!p) throw new Error(`Unknown provider ${provider}`);
    if (!p.enabled()) throw new Error(`${provider} is not switched on.`);
    const change: Pending = { id: `chg${++this.seq}`, companyId: ctx.companyId, requestedBy: ctx.userId, provider, method, args, summary: summarize(method, args), status: 'pending' };
    this.pending.push(change);
    this.log(ctx, 'propose', change.id, { method, summary: change.summary });
    return change;
  }

  private find(ctx: Ctx, changeId: string) {
    const c = this.pending.find(x => x.id === changeId && x.companyId === ctx.companyId);
    if (!c) throw new Error('Change not found.');
    if (c.status !== 'pending') throw new Error(`That change was already ${c.status}.`);
    return c;
  }

  async approve(ctx: Ctx, changeId: string) {
    if (!CAN_WRITE[ctx.role]) throw new Error('Your role can view but not approve changes.');
    const c = this.find(ctx, changeId);
    try {
      c.result = await (this.providers[c.provider] as any)[c.method](ctx, ...c.args);
      c.status = 'approved';
      this.log(ctx, 'approve', c.id, { method: c.method, summary: c.summary });
    } catch (e) {
      c.status = 'failed'; c.error = (e as Error).message;
      this.log(ctx, 'failed', c.id, { method: c.method, error: c.error });
      throw e;
    }
    return c;
  }

  reject(ctx: Ctx, changeId: string) {
    const c = this.find(ctx, changeId);
    c.status = 'rejected';
    this.log(ctx, 'reject', c.id, { method: c.method });
    return c;
  }
}
