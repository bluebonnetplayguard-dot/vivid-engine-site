import { Injectable, Logger } from '@nestjs/common';
import { AuthUser } from '../auth/guard';
import { config } from '../config';
import { Db } from '../db';
import { ApiError, badRequest, forbidden, notFound } from '../errors';
import { isEmail, str } from '../shared/guards';
import { FeatureLevel, LEVEL_RANK, VIDEO_TIER_RANK, VideoTier, videoTierById } from './video-plans';

// Vivid Video Studio: plans, limits, saved projects, brand kits, exports and Business seats.
// Editing and rendering happen in the browser; the AI features live in video-ai.ts.

const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'];
const ID_RE = /^[a-f0-9]{24}$/;
const ASPECTS = ['16:9', '9:16', '1:1', '4:5'];
const MAX_PROJECT_BYTES = 450_000;      // JSON body limit is 600 KB
const MAX_THUMB_CHARS = 120_000;
const MAX_LOGO_CHARS = 350_000;
const HEX = /^#[0-9a-f]{6}$/i;
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MONTH = `date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;

export type UsageKind = 'export' | 'transcribe' | 'tts' | 'storyboard';

export interface VideoEntitlement {
  tier: VideoTier;
  subscription: Record<string, any> | null;
  role: 'free' | 'owner' | 'member';
}

@Injectable()
export class VideoService {
  private readonly log = new Logger('VideoStudio');

  constructor(private readonly db: Db) {}

  // ---------- plans and limits ----------

  async entitlement(user: AuthUser): Promise<VideoEntitlement> {
    const own = await this.db.query(
      `SELECT * FROM video_subscriptions WHERE owner_user_id = $1 AND status = ANY($2) ORDER BY created_date DESC`, [user.id, ACTIVE_STATUSES]);
    const best = own.sort((a, b) => (VIDEO_TIER_RANK[b.tier] ?? 0) - (VIDEO_TIER_RANK[a.tier] ?? 0))[0];
    if (best) return { tier: videoTierById(best.tier), subscription: best, role: 'owner' };

    const seat = await this.db.one(
      `SELECT s.*, seat.id AS seat_id, seat.user_id AS seat_user_id,
              (SELECT count(*) FROM video_seats x WHERE x.subscription_id = s.id AND (x.created_date, x.id) <= (seat.created_date, seat.id))::int AS seat_rank
         FROM video_seats seat JOIN video_subscriptions s ON s.id = seat.subscription_id
        WHERE (seat.user_id = $1 OR lower(seat.email) = lower($2)) AND s.tier = 'business' AND s.status = ANY($3)
        ORDER BY seat.created_date LIMIT 1`, [user.id, user.email, ACTIVE_STATUSES]);
    if (seat && seat.seat_rank <= seat.seats) {
      if (!seat.seat_user_id) await this.db.query('UPDATE video_seats SET user_id = $1 WHERE id = $2', [user.id, seat.seat_id]);
      return { tier: videoTierById('business'), subscription: seat, role: 'member' };
    }
    return { tier: videoTierById('free'), subscription: null, role: 'free' };
  }

  private pooled(ent: VideoEntitlement) { return ent.tier.perSeat && !!ent.subscription; }

  // This month's use and limits. AI allowances are pooled across a Business team; exports are per person.
  async usage(user: AuthUser, ent: VideoEntitlement) {
    const pooled = this.pooled(ent);
    const seats = pooled ? Number(ent.subscription!.seats) : 1;
    const rows = await this.db.query<{ kind: string; total: string; mine: string }>(
      `SELECT kind, COALESCE(sum(amount), 0) AS total, COALESCE(sum(amount) FILTER (WHERE user_id = $2), 0) AS mine
         FROM video_usage WHERE ${pooled ? 'subscription_id' : 'user_id'} = $1 AND at >= ${MONTH} GROUP BY kind`,
      [pooled ? ent.subscription!.id : user.id, user.id]);
    const sum = (kind: UsageKind, own = false) => Number(rows.find(r => r.kind === kind)?.[own ? 'mine' : 'total'] ?? 0);
    const t = ent.tier;
    return {
      exports: { used: sum('export', true), limit: t.exportsPerMonth },
      captionMinutes: { used: Math.ceil(sum('transcribe') / 60), limit: t.captionMinutes * seats },
      storyboards: { used: sum('storyboard'), limit: t.storyboards * seats },
      ttsChars: { used: sum('tts'), limit: t.ttsChars * seats },
    };
  }

  // Throws a friendly 429 if this use would go over the month's allowance or the daily budget.
  async assertAllowance(user: AuthUser, ent: VideoEntitlement, kind: Exclude<UsageKind, 'export'>, amount: number) {
    const u = await this.usage(user, ent);
    const upgrade = ent.tier.id === 'studio' || ent.role === 'member' ? '' : ' Upgrade for more.';
    if (kind === 'transcribe' && u.captionMinutes.used + amount / 60 > u.captionMinutes.limit) {
      throw new ApiError(429, `This would go over your ${u.captionMinutes.limit} caption minutes for the month (${u.captionMinutes.used} used).${upgrade}`, { code: 'QUOTA' });
    }
    if (kind === 'storyboard' && u.storyboards.used + amount > u.storyboards.limit) {
      throw new ApiError(429, `You've used all ${u.storyboards.limit} AI script-to-video drafts for this month.${upgrade}`, { code: 'QUOTA' });
    }
    if (kind === 'tts' && u.ttsChars.used + amount > u.ttsChars.limit) {
      throw new ApiError(429, `This voiceover needs ${amount.toLocaleString('en-US')} characters, but only ${Math.max(0, u.ttsChars.limit - u.ttsChars.used).toLocaleString('en-US')} are left this month.${upgrade}`, { code: 'QUOTA' });
    }
    if (config.VIDEO_DAILY_BUDGET_USD > 0) {
      const row = await this.db.one<{ total: string }>(`SELECT COALESCE(sum(cost_usd), 0) AS total FROM video_usage WHERE at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`);
      if (Number(row?.total ?? 0) >= config.VIDEO_DAILY_BUDGET_USD) {
        this.log.warn('Daily Video Studio AI budget reached; AI features paused until midnight UTC.');
        throw new ApiError(503, 'AI features are taking a short break because of high demand. Please try again later today.', { code: 'BUDGET' });
      }
    }
  }

  async record(user: AuthUser, ent: VideoEntitlement, kind: UsageKind, amount: number, costUsd: number) {
    await this.db.query('INSERT INTO video_usage(user_id, subscription_id, tier, kind, amount, cost_usd) VALUES ($1, $2, $3, $4, $5, $6)',
      [user.id, ent.subscription?.id ?? null, ent.tier.id, kind, amount, costUsd.toFixed(5)]);
  }

  async status(user: AuthUser) {
    const ent = await this.entitlement(user);
    const sub = ent.subscription;
    const projects = await this.db.one<{ n: number }>('SELECT count(*)::int AS n FROM video_projects WHERE user_id = $1', [user.id]);
    return {
      tier: ent.tier,
      role: ent.role,
      usage: { ...(await this.usage(user, ent)), projects: { used: projects?.n ?? 0, limit: ent.tier.projects } },
      ai: { captions: !!config.OPENAI_API_KEY, voiceover: !!config.OPENAI_API_KEY, storyboard: !!(config.ANTHROPIC_API_KEY || config.OPENAI_API_KEY), stock: !!config.PEXELS_API_KEY },
      subscription: sub ? {
        status: sub.status, seats: Number(sub.seats), company_name: sub.company_name ?? null,
        current_period_end: sub.current_period_end ?? null, can_manage_billing: ent.role === 'owner' && !!sub.stripe_customer_id,
      } : null,
    };
  }

  // ---------- exports ----------

  // Called before the browser renders. Checks the plan allows this resolution, length and
  // effect level, counts the export, and says whether the watermark must be drawn.
  async startExport(user: AuthUser, body: any) {
    const ent = await this.entitlement(user);
    const t = ent.tier;
    const width = Math.floor(Number(body?.width)), height = Math.floor(Number(body?.height));
    const fps = Math.floor(Number(body?.fps)), duration = Number(body?.duration);
    const level = String(body?.level ?? 'basic') as FeatureLevel;
    if (![width, height, fps].every(n => Number.isFinite(n) && n > 0) || !Number.isFinite(duration) || duration <= 0) throw badRequest('Invalid export settings.');
    if (!(level in LEVEL_RANK)) throw badRequest('Invalid export settings.');
    if (Math.min(width, height) > t.maxHeight) throw new ApiError(403, `The ${t.name} plan exports up to ${t.maxHeight === 2160 ? '4K' : `${t.maxHeight}p`}.`, { code: 'PLAN_LIMIT' });
    if (fps > t.maxFps) throw new ApiError(403, `The ${t.name} plan exports up to ${t.maxFps} fps.`, { code: 'PLAN_LIMIT' });
    if (duration > t.maxDurationSec + 0.5) throw new ApiError(403, `The ${t.name} plan exports videos up to ${Math.round(t.maxDurationSec / 60)} minutes.`, { code: 'PLAN_LIMIT' });
    if (LEVEL_RANK[level] > LEVEL_RANK[t.effectLevel]) throw new ApiError(403, `This video uses ${level === 'pro' ? 'Pro' : 'Creator'} effects. Remove them or upgrade to export.`, { code: 'PLAN_LIMIT' });
    const u = await this.usage(user, ent);
    if (u.exports.used >= u.exports.limit) throw new ApiError(429, `You've used all ${u.exports.limit} exports for this month.${t.id === 'studio' ? '' : ' Upgrade for more.'}`, { code: 'QUOTA' });
    await this.record(user, ent, 'export', 1, 0);
    return { watermark: t.watermark, exportsLeft: u.exports.limit - u.exports.used - 1 };
  }

  // ---------- projects ----------

  listProjects(user: AuthUser) {
    return this.db.query('SELECT id, title, aspect, duration_sec, thumbnail, updated_date FROM video_projects WHERE user_id = $1 ORDER BY updated_date DESC LIMIT 500', [user.id]);
  }

  async getProject(user: AuthUser, id: string) {
    if (!ID_RE.test(id)) throw notFound('Project not found.');
    const row = await this.db.one('SELECT id, title, aspect, duration_sec, data, updated_date FROM video_projects WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!row) throw notFound('Project not found.');
    return row;
  }

  private cleanProject(body: any) {
    const title = str(body?.title, 120) || 'Untitled video';
    const aspect = ASPECTS.includes(body?.aspect) ? body.aspect : '16:9';
    const duration = Math.max(0, Math.min(36_000, Number(body?.duration) || 0));
    if (!body?.data || typeof body.data !== 'object' || Array.isArray(body.data)) throw badRequest('Project data is missing.');
    const json = JSON.stringify(body.data);
    if (json.length > MAX_PROJECT_BYTES) throw badRequest('This project is too large to save. Split it into smaller videos.');
    const thumbnail = typeof body?.thumbnail === 'string' && body.thumbnail.length <= MAX_THUMB_CHARS && IMAGE_DATA_URL.test(body.thumbnail) ? body.thumbnail : null;
    return { title, aspect, duration, json, thumbnail };
  }

  async createProject(user: AuthUser, body: any) {
    const ent = await this.entitlement(user);
    const count = await this.db.one<{ n: number }>('SELECT count(*)::int AS n FROM video_projects WHERE user_id = $1', [user.id]);
    if ((count?.n ?? 0) >= ent.tier.projects) {
      throw new ApiError(429, `The ${ent.tier.name} plan keeps up to ${ent.tier.projects} projects. Delete one or upgrade.`, { code: 'QUOTA' });
    }
    const p = this.cleanProject(body);
    return this.db.one('INSERT INTO video_projects(user_id, title, aspect, duration_sec, data, thumbnail) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, title, aspect, updated_date',
      [user.id, p.title, p.aspect, p.duration, p.json, p.thumbnail]);
  }

  async updateProject(user: AuthUser, id: string, body: any) {
    if (!ID_RE.test(id)) throw notFound('Project not found.');
    const p = this.cleanProject(body);
    const row = await this.db.one(
      `UPDATE video_projects SET title = $3, aspect = $4, duration_sec = $5, data = $6, thumbnail = COALESCE($7, thumbnail), updated_date = now()
        WHERE id = $1 AND user_id = $2 RETURNING id, title, aspect, updated_date`, [id, user.id, p.title, p.aspect, p.duration, p.json, p.thumbnail]);
    if (!row) throw notFound('Project not found.');
    return row;
  }

  async deleteProject(user: AuthUser, id: string) {
    if (!ID_RE.test(id)) throw notFound('Project not found.');
    const rows = await this.db.query('DELETE FROM video_projects WHERE id = $1 AND user_id = $2 RETURNING id', [id, user.id]);
    if (!rows.length) throw notFound('Project not found.');
    return { deleted: true };
  }

  // ---------- brand kits ----------

  async listBrandKits(user: AuthUser) {
    const ent = await this.entitlement(user);
    const teamId = this.pooled(ent) ? ent.subscription!.id : null;
    return this.db.query(
      `SELECT id, name, data, subscription_id IS NOT NULL AS shared, user_id = $1 AS mine, updated_date FROM video_brand_kits
        WHERE user_id = $1 OR ($2::text IS NOT NULL AND subscription_id = $2) ORDER BY updated_date DESC`, [user.id, teamId]);
  }

  private cleanKit(body: any) {
    const name = str(body?.name, 60) || 'My brand';
    const d = body?.data ?? {};
    const colors: Record<string, string> = {};
    for (const k of ['primary', 'secondary', 'accent', 'text', 'background']) colors[k] = HEX.test(d?.colors?.[k]) ? d.colors[k] : '#000000';
    const font = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9 ]{1,40}$/.test(v) ? v : 'Inter');
    const logo = typeof d?.logo === 'string' && d.logo ? d.logo : null;
    if (logo && (logo.length > MAX_LOGO_CHARS || !IMAGE_DATA_URL.test(logo))) throw badRequest('The logo must be a PNG, JPG or WebP under about 250 KB.');
    const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    return {
      name,
      json: JSON.stringify({
        colors, headingFont: font(d?.headingFont), bodyFont: font(d?.bodyFont), logo,
        logoPosition: positions.includes(d?.logoPosition) ? d.logoPosition : 'bottom-right', logoOnEveryVideo: !!d?.logoOnEveryVideo,
      }),
    };
  }

  async createBrandKit(user: AuthUser, body: any) {
    const ent = await this.entitlement(user);
    if (ent.tier.brandKits < 1) throw new ApiError(403, 'Brand kits come with the Creator plan and up.', { code: 'PLAN_LIMIT' });
    const teamId = this.pooled(ent) ? ent.subscription!.id : null;
    const count = await this.db.one<{ n: number }>(
      `SELECT count(*)::int AS n FROM video_brand_kits WHERE ${teamId ? 'subscription_id = $1' : 'user_id = $1 AND subscription_id IS NULL'}`, [teamId ?? user.id]);
    if ((count?.n ?? 0) >= ent.tier.brandKits) throw new ApiError(429, `The ${ent.tier.name} plan includes ${ent.tier.brandKits} brand kit${ent.tier.brandKits === 1 ? '' : 's'}.`, { code: 'QUOTA' });
    const k = this.cleanKit(body);
    return this.db.one('INSERT INTO video_brand_kits(user_id, subscription_id, name, data) VALUES ($1, $2, $3, $4) RETURNING id, name, data, subscription_id IS NOT NULL AS shared, true AS mine',
      [user.id, teamId, k.name, k.json]);
  }

  // The kit's creator, or the Business owner for team kits, can change or delete it.
  private async editableKit(user: AuthUser, id: string) {
    if (!ID_RE.test(id)) throw notFound('Brand kit not found.');
    const kit = await this.db.one(
      `SELECT k.id FROM video_brand_kits k LEFT JOIN video_subscriptions s ON s.id = k.subscription_id
        WHERE k.id = $1 AND (k.user_id = $2 OR s.owner_user_id = $2)`, [id, user.id]);
    if (!kit) throw notFound('Brand kit not found.');
  }

  async updateBrandKit(user: AuthUser, id: string, body: any) {
    await this.editableKit(user, id);
    const k = this.cleanKit(body);
    return this.db.one('UPDATE video_brand_kits SET name = $2, data = $3, updated_date = now() WHERE id = $1 RETURNING id, name, data, subscription_id IS NOT NULL AS shared, true AS mine', [id, k.name, k.json]);
  }

  async deleteBrandKit(user: AuthUser, id: string) {
    await this.editableKit(user, id);
    await this.db.query('DELETE FROM video_brand_kits WHERE id = $1', [id]);
    return { deleted: true };
  }

  // ---------- Business seats (owner only) ----------

  private async ownedBusiness(user: AuthUser) {
    const sub = await this.db.one(`SELECT * FROM video_subscriptions WHERE owner_user_id = $1 AND tier = 'business' AND status = ANY($2) ORDER BY created_date DESC LIMIT 1`, [user.id, ACTIVE_STATUSES]);
    if (!sub) throw forbidden('Only the owner of a Business plan can manage seats.');
    return sub;
  }

  async team(user: AuthUser) {
    const sub = await this.ownedBusiness(user);
    const members = await this.db.query(
      `SELECT seat.id, seat.email, seat.role, seat.user_id IS NOT NULL AS joined, seat.created_date,
              (SELECT count(*)::int FROM video_usage u WHERE u.subscription_id = $1 AND u.user_id = seat.user_id AND u.kind = 'export' AND u.at >= ${MONTH}) AS exports_this_month
         FROM video_seats seat WHERE seat.subscription_id = $1 ORDER BY seat.created_date, seat.id`, [sub.id]);
    return { seats: Number(sub.seats), company_name: sub.company_name, members };
  }

  async addMember(user: AuthUser, body: any) {
    const sub = await this.ownedBusiness(user);
    const email = String(body?.email ?? '').trim().toLowerCase();
    if (email.length > 150 || !isEmail(email)) throw badRequest('Enter a valid email address.');
    const used = await this.db.one<{ n: number }>('SELECT count(*)::int AS n FROM video_seats WHERE subscription_id = $1', [sub.id]);
    if ((used?.n ?? 0) >= Number(sub.seats)) throw badRequest(`All ${sub.seats} seats are in use. Add seats from Manage billing first.`);
    const existing = await this.db.one<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [email]);
    const row = await this.db.one(
      `INSERT INTO video_seats(subscription_id, email, user_id) VALUES ($1, $2, $3) ON CONFLICT (subscription_id, email) DO NOTHING RETURNING id`,
      [sub.id, email, existing?.id ?? null]);
    if (!row) throw badRequest('That person already has a seat.');
    return this.team(user);
  }

  async removeMember(user: AuthUser, seatId: string) {
    const sub = await this.ownedBusiness(user);
    if (!ID_RE.test(seatId)) throw notFound('Seat not found.');
    const rows = await this.db.query(`DELETE FROM video_seats WHERE id = $1 AND subscription_id = $2 AND role <> 'owner' RETURNING id`, [seatId, sub.id]);
    if (!rows.length) throw badRequest('That seat cannot be removed.');
    return this.team(user);
  }
}
