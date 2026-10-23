// Which plans include saved conversation history. Change the lists here to move a feature between plans.
// The server is the real gate: it must refuse to save, list or open saved threads without the entitlement.
// The site reads `me.entitlements.history` from /ai-search/me when the server sends it, and falls back
// to this table by plan key otherwise.
export const HISTORY_ENTITLEMENTS = {
  // plan key: { retentionDays (null = until deleted), fullTextSearch, bulkExport, memory }
  search_pro: { retentionDays: 365, fullTextSearch: false, bulkExport: false, memory: false },
  search_max: { retentionDays: null, fullTextSearch: true, bulkExport: true, memory: true },
  all_in_one: { retentionDays: null, fullTextSearch: true, bulkExport: true, memory: true },
  website_paid: { retentionDays: 365, fullTextSearch: false, bulkExport: false, memory: false },
  app_builder_paid: { retentionDays: 365, fullTextSearch: false, bulkExport: false, memory: false },
  bundle: { retentionDays: 365, fullTextSearch: false, bulkExport: false, memory: false },
};

export const DOWNGRADE_READ_ONLY_DAYS = 30;
export const AUTO_DELETE_OPTIONS = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '12 months' },
  { days: null, label: 'Never' },
];

const planKey = me => String(me?.tier?.key || me?.tier?.id || me?.tier?.slug || me?.tier?.name || '')
  .toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');

// Returns { allowed, readOnly, retentionDays, fullTextSearch, bulkExport, memory }.
export function historyAccess(me) {
  const server = me?.entitlements?.history;
  if (server && typeof server === 'object') {
    return { allowed: !!server.allowed, readOnly: !!server.readOnly, retentionDays: server.retentionDays ?? 365,
      fullTextSearch: !!server.fullTextSearch, bulkExport: !!server.bulkExport, memory: !!server.memory };
  }
  const plan = HISTORY_ENTITLEMENTS[planKey(me)];
  if (!plan) return { allowed: false, readOnly: false, retentionDays: 0, fullTextSearch: false, bulkExport: false, memory: false };
  return { allowed: true, readOnly: false, ...plan };
}

export const retentionLabel = days => (days == null ? 'until you delete them' : days >= 365 ? '12 months' : `${days} days`);
