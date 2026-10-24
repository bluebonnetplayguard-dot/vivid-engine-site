import { DbLike } from './prices';
import { Candidate } from './rules';

export interface AlertEvent { id: number; ts: Date; severity: string; kind: string; message: string }
// Sends one alert to the outside world (email, webhook) and says which channels it reached.
export type Notify = (a: AlertEvent, repeat: boolean) => Promise<string[]>;

export const CRITICAL_REPEAT_MS = 6 * 3600_000;

export class AlertCenter {
  constructor(private readonly db: DbLike, private readonly notify: Notify = async () => []) {}

  // The same dedupeKey raises one alert, however many times a rule runs (the unique index decides).
  async raise(c: Candidate): Promise<{ created: boolean; id: number | null }> {
    const row = await this.db.one(
      `INSERT INTO alerts(severity, kind, scope, scope_ref, message, value, threshold, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING RETURNING id, ts`,
      [c.severity, c.kind, c.scope, c.scopeRef, c.message.slice(0, 600), c.value ?? null, c.threshold ?? null, c.dedupeKey]);
    if (!row) return { created: false, id: null };
    await this.send(row.id, { id: row.id, ts: row.ts, severity: c.severity, kind: c.kind, message: c.message }, false);
    return { created: true, id: row.id };
  }

  private async send(id: number, ev: AlertEvent, repeat: boolean) {
    // Info alerts stay in the dashboard bell and the daily digest. Warnings and critical alerts also go out.
    if (ev.severity === 'info') return;
    let channels: string[] = [];
    try { channels = await this.notify(ev, repeat); } catch { channels = []; }
    await this.db.query(
      `UPDATE alerts SET notified_channels = (SELECT array(SELECT DISTINCT unnest(notified_channels || $2::text[]))), last_notified_at = now(), notify_count = notify_count + 1 WHERE id = $1`,
      [id, channels]);
  }

  // Critical alerts that nobody has acknowledged go out again every 6 hours.
  async renotifyCritical(repeatMs = CRITICAL_REPEAT_MS): Promise<number> {
    const rows = await this.db.query(
      `SELECT id, ts, severity, kind, message FROM alerts
        WHERE severity = 'critical' AND acknowledged_at IS NULL AND (last_notified_at IS NULL OR last_notified_at <= now() - ($1 || ' milliseconds')::interval)`, [String(repeatMs)]);
    for (const r of rows) await this.send(r.id, r, true);
    return rows.length;
  }

  async ack(id: number, by: string) {
    return this.db.one(`UPDATE alerts SET acknowledged_at = now(), acknowledged_by = $2 WHERE id = $1 AND acknowledged_at IS NULL RETURNING id`, [id, by]);
  }

  list(opts: { open?: boolean; limit?: number } = {}) {
    return this.db.query(
      `SELECT id, ts, severity, kind, scope, scope_ref, message, value, threshold, acknowledged_at, acknowledged_by, notified_channels, notify_count
         FROM alerts ${opts.open ? 'WHERE acknowledged_at IS NULL' : ''} ORDER BY ts DESC LIMIT $1`, [Math.min(opts.limit ?? 100, 500)]);
  }
  async openCounts(): Promise<{ info: number; warn: number; critical: number }> {
    const rows = await this.db.query(`SELECT severity, count(*)::int AS n FROM alerts WHERE acknowledged_at IS NULL GROUP BY severity`);
    const out = { info: 0, warn: 0, critical: 0 };
    for (const r of rows) (out as any)[r.severity] = r.n;
    return out;
  }
}

// Email and webhook channels. Neither ever throws; each reports whether it worked.
export function makeNotify(o: {
  sendMail: (to: string, subject: string, text: string) => Promise<boolean>;
  emailTo: string | undefined;
  webhookUrl?: string;
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  origin: string;
}): Notify {
  const f = o.fetchFn ?? fetch;
  return async (a, repeat) => {
    const channels: string[] = [];
    const tag = a.severity === 'critical' ? 'CRITICAL' : 'Warning';
    const subject = `[Vivid billing] ${tag}${repeat ? ' (reminder)' : ''}: ${a.kind.replace(/_/g, ' ')}`;
    const text = `${a.message}\n\nOpen the billing dashboard to acknowledge: ${o.origin}/admin/billing${a.severity === 'critical' ? '\nThis repeats every 6 hours until it is acknowledged.' : ''}`;
    if (o.emailTo && await o.sendMail(o.emailTo, subject, text)) channels.push('email');
    if (o.webhookUrl) {
      try {
        const res = await f(o.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `${subject}\n${a.message}`, content: `${subject}\n${a.message}` }), signal: AbortSignal.timeout(10_000) });
        if (res.ok) channels.push('webhook');
      } catch { /* a webhook outage must not hide the alert */ }
    }
    return channels;
  };
}
