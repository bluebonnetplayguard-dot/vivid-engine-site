import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser } from '../auth/guard';
import { BillingMonitorService } from '../billing-monitor/billing-monitor.service';
import { Db } from '../db';
import { badRequest, notFound } from '../errors';
import { EstimatingService } from '../estimating/estimating.service';
import { EstimateResult } from '../estimating';
import { buildProposal, phasesOf } from './builder';
import { ProposalAi } from './proposal-ai';
import { ProposalOptions } from './types';

const ID_RE = /^[a-f0-9]{24}$/;
const text = (max: number) => z.string().trim().max(max);
const Party = z.object({ name: text(120), phone: text(40).optional(), email: text(160).optional(), address: text(240).optional(), license: text(80).optional() }).strict();
const OptionsInput = z.object({
  company: Party,
  customer: Party.partial({ name: true }).default({ name: '' }),
  projectAddress: text(240).optional(),
  validDays: z.number().int().min(1).max(365).default(30),
  includeAlternates: z.boolean().default(true),
  showLineItems: z.boolean().default(true),
  tone: z.enum(['friendly', 'formal']).default('friendly'),
  terms: text(4000).optional(),
  useAi: z.boolean().default(true),
}).strict();

@Injectable()
export class ProposalService {
  readonly ai: ProposalAi;
  constructor(private readonly db: Db, private readonly estimates: EstimatingService, billing: BillingMonitorService) { this.ai = new ProposalAi(billing); }

  // POST /api/projects/:id/estimates/:version/proposal
  async generate(user: AuthUser, projectId: string, version: string, body: unknown) {
    const est = await this.estimates.get(user, projectId, version);   // ownership, feature flag, 404s
    const parsed = OptionsInput.safeParse(body ?? {});
    if (!parsed.success) throw badRequest(`Proposal options: ${parsed.error.issues.slice(0, 3).map(i => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ')}`, { code: 'OPTIONS_INVALID' });
    const { useAi, ...rest } = parsed.data;
    const options: ProposalOptions = { ...rest, customer: { name: rest.customer.name ?? '', ...rest.customer } };
    if (!options.company.name) throw badRequest('Add your company name for the proposal.', { code: 'OPTIONS_INVALID' });
    const result = est.result as EstimateResult;
    const project = await this.db.one<{ name: string }>('SELECT name FROM studio_projects WHERE id = $1', [projectId]);

    let wording = null;
    if (useAi && this.ai.configured()) {
      wording = await this.ai.write({
        userId: user.id, projectName: project!.name, designTitle: result.design.title, customerName: options.customer.name || undefined, tone: options.tone,
        scope: phasesOf(result).map(p => ({ phase: p.title, items: p.lines.map(l => l.description) })),
        alternates: options.includeAlternates ? result.alternates.map(a => a.title) : [],
      });
    }
    const proposal = buildProposal({ estimate: result, estimateVersion: est.version, projectName: project!.name, options, wording: wording ?? undefined, wordingEngine: wording ? 'claude' : 'template' });
    if (useAi && !this.ai.configured()) proposal.notices.push('AI wording is off (no ANTHROPIC_API_KEY on the server); standard wording was used.');
    else if (useAi && !wording) proposal.notices.push('AI wording was unavailable just now; standard wording was used.');
    if (est.stale) proposal.notices.unshift('The design was saved after this estimate. Create a new estimate to price the latest design.');

    const row = await this.db.one<{ id: string; created_date: string }>(`INSERT INTO proposal_exports(project_id, estimate_id, estimate_version, user_id, wording, total, options, proposal)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, created_date`, [projectId, est.id, est.version, user.id, proposal.wording, proposal.total, options, proposal]);
    return { id: row!.id, created_date: row!.created_date, estimateVersion: est.version, proposal };
  }

  async list(user: AuthUser, projectId: string) {
    await this.estimates.list(user, projectId);   // ownership + flag
    const rows = await this.db.query(`SELECT id, estimate_version, wording, total, created_date, options->'customer'->>'name' AS customer FROM proposal_exports WHERE project_id = $1 ORDER BY created_date DESC LIMIT 200`, [projectId]);
    return rows.map((r: any) => ({ ...r, total: Number(r.total) }));
  }

  async get(user: AuthUser, projectId: string, proposalId: string) {
    await this.estimates.list(user, projectId);
    if (!ID_RE.test(proposalId)) throw notFound('Proposal not found.');
    const row: any = await this.db.one('SELECT id, estimate_version, wording, total, options, proposal, created_date FROM proposal_exports WHERE id = $1 AND project_id = $2', [proposalId, projectId]);
    if (!row) throw notFound('Proposal not found.');
    return { ...row, total: Number(row.total) };
  }
}
