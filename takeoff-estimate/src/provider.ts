// One interface for every takeoff platform. VividProvider is ours and always on; StackProvider uses only
// STACK's published Developer Reference and stays off until STACK certifies the integration.
export interface Ctx { companyId: string; userId: string; role: Role }
export type Role = 'owner' | 'estimator' | 'viewer';
export interface Project { id: string; name: string; client?: string; address?: string; bidDate?: string; status: string }
export interface Takeoff { id: string; projectId: string; name: string; kind: string; color: string; quantity: number; unit: string }
export interface LibraryItem { id: string; name: string; unit: string; materialCost: number; laborHoursPerUnit: number; laborRate: number; wastePct: number; tags: string[] }

export interface TakeoffProvider {
  readonly id: 'vivid' | 'stack';
  enabled(): boolean;
  // reads (run immediately)
  findProjects(ctx: Ctx, q?: string): Promise<Project[]>;
  getProject(ctx: Ctx, id: string): Promise<Project | null>;
  listPlans(ctx: Ctx, projectId: string): Promise<unknown[]>;
  findTakeoffs(ctx: Ctx, projectId: string): Promise<Takeoff[]>;
  findLibraryItems(ctx: Ctx, q?: string): Promise<LibraryItem[]>;
  findEstimates(ctx: Ctx, projectId: string): Promise<unknown[]>;
  getEstimateWorksheet(ctx: Ctx, estimateId: string): Promise<unknown>;
  queryEstimateAnalytics(ctx: Ctx, query: unknown): Promise<unknown>;
  getCompanyOptions(ctx: Ctx): Promise<unknown>;
  searchResources(ctx: Ctx, q: string): Promise<unknown[]>;
  // writes (only ever called by the approval gate, after the user approves)
  createProject(ctx: Ctx, p: Omit<Project, 'id' | 'status'>): Promise<Project>;
  updateProject(ctx: Ctx, id: string, patch: Partial<Project>): Promise<Project>;
  createTakeoff(ctx: Ctx, t: Omit<Takeoff, 'id'>): Promise<Takeoff>;
  editTakeoffs(ctx: Ctx, edits: Array<{ id: string; patch: Partial<Takeoff> }>): Promise<Takeoff[]>;
  importLibraryItems(ctx: Ctx, items: Omit<LibraryItem, 'id'>[]): Promise<LibraryItem[]>;
  copyToLibrary(ctx: Ctx, takeoffIds: string[]): Promise<LibraryItem[]>;
  tagLibraryItems(ctx: Ctx, ids: string[], tags: string[]): Promise<LibraryItem[]>;
  importCompanyLabels(ctx: Ctx, labels: string[]): Promise<void>;
}
export const WRITE_METHODS = ['createProject', 'updateProject', 'createTakeoff', 'editTakeoffs', 'importLibraryItems', 'copyToLibrary', 'tagLibraryItems', 'importCompanyLabels'] as const;
export type WriteMethod = typeof WRITE_METHODS[number];

let n = 0; const id = () => `v${(++n).toString(36).padStart(6, '0')}`;

// In-memory reference implementation (the NestJS service backs the same methods with Postgres, scoped by company).
export class VividProvider implements TakeoffProvider {
  readonly id = 'vivid' as const;
  private data = new Map<string, { projects: Project[]; takeoffs: Takeoff[]; items: LibraryItem[]; labels: string[] }>();
  enabled() { return true; }
  private co(ctx: Ctx) { if (!this.data.has(ctx.companyId)) this.data.set(ctx.companyId, { projects: [], takeoffs: [], items: [], labels: [] }); return this.data.get(ctx.companyId)!; }
  async findProjects(ctx: Ctx, q = '') { return this.co(ctx).projects.filter(p => p.name.toLowerCase().includes(q.toLowerCase())); }
  async getProject(ctx: Ctx, pid: string) { return this.co(ctx).projects.find(p => p.id === pid) ?? null; }
  async listPlans() { return []; }
  async findTakeoffs(ctx: Ctx, pid: string) { return this.co(ctx).takeoffs.filter(t => t.projectId === pid); }
  async findLibraryItems(ctx: Ctx, q = '') { return this.co(ctx).items.filter(i => i.name.toLowerCase().includes(q.toLowerCase())); }
  async findEstimates() { return []; }
  async getEstimateWorksheet() { return null; }
  async queryEstimateAnalytics() { return {}; }
  async getCompanyOptions(ctx: Ctx) { return { labels: this.co(ctx).labels }; }
  async searchResources() { return []; }
  async createProject(ctx: Ctx, p: Omit<Project, 'id' | 'status'>) { const r = { ...p, id: id(), status: 'open' }; this.co(ctx).projects.push(r); return r; }
  async updateProject(ctx: Ctx, pid: string, patch: Partial<Project>) { const r = this.co(ctx).projects.find(p => p.id === pid); if (!r) throw new Error('Project not found'); Object.assign(r, patch, { id: r.id }); return r; }
  async createTakeoff(ctx: Ctx, t: Omit<Takeoff, 'id'>) { if (!(await this.getProject(ctx, t.projectId))) throw new Error('Project not found'); const r = { ...t, id: id() }; this.co(ctx).takeoffs.push(r); return r; }
  async editTakeoffs(ctx: Ctx, edits: Array<{ id: string; patch: Partial<Takeoff> }>) { const list = this.co(ctx).takeoffs; return edits.map(e => { const t = list.find(x => x.id === e.id); if (!t) throw new Error(`Takeoff ${e.id} not found`); return Object.assign(t, e.patch, { id: t.id, projectId: t.projectId }); }); }
  async importLibraryItems(ctx: Ctx, items: Omit<LibraryItem, 'id'>[]) { const r = items.map(i => ({ ...i, id: id() })); this.co(ctx).items.push(...r); return r; }
  async copyToLibrary(ctx: Ctx, ids: string[]) { const ts = this.co(ctx).takeoffs.filter(t => ids.includes(t.id)); return this.importLibraryItems(ctx, ts.map(t => ({ name: t.name, unit: t.unit, materialCost: 0, laborHoursPerUnit: 0, laborRate: 0, wastePct: 0, tags: ['from-takeoff'] }))); }
  async tagLibraryItems(ctx: Ctx, ids: string[], tags: string[]) { const r = this.co(ctx).items.filter(i => ids.includes(i.id)); r.forEach(i => { i.tags = [...new Set([...i.tags, ...tags])]; }); return r; }
  async importCompanyLabels(ctx: Ctx, labels: string[]) { const c = this.co(ctx); c.labels = [...new Set([...c.labels, ...labels])]; }
}

// Official STACK API. Disabled unless STACK_ENABLED=true and the client credentials are set (after certification).
export class StackProvider implements TakeoffProvider {
  readonly id = 'stack' as const;
  private env: Record<string, string | undefined>;
  constructor(env: Record<string, string | undefined> = {}) { this.env = env; }
  enabled() { return this.env.STACK_ENABLED === 'true' && !!this.env.STACK_CLIENT_ID && !!this.env.STACK_CLIENT_SECRET; }
  private off(): never { throw new Error('STACK integration is off until STACK certifies it (STACK_ENABLED=false).'); }
  findProjects() { return this.off(); } getProject() { return this.off(); } listPlans() { return this.off(); }
  findTakeoffs() { return this.off(); } findLibraryItems() { return this.off(); } findEstimates() { return this.off(); }
  getEstimateWorksheet() { return this.off(); } queryEstimateAnalytics() { return this.off(); } getCompanyOptions() { return this.off(); }
  searchResources() { return this.off(); } createProject() { return this.off(); } updateProject() { return this.off(); }
  createTakeoff() { return this.off(); } editTakeoffs() { return this.off(); } importLibraryItems() { return this.off(); }
  copyToLibrary() { return this.off(); } tagLibraryItems() { return this.off(); } importCompanyLabels() { return this.off(); }
}
