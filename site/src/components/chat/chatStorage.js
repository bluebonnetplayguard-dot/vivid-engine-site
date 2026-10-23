export const GREETING = {
  visitor: "Hi! I'm the Vivid Engine Solutions assistant. Questions about a new website, redesign, SEO or maintenance? Ask away.",
  admin: 'Marketing agent ready. Ask for social posts, a blog post, lead follow-ups or a campaign plan. Everything is saved as a draft for you to review.',
};
export const QUICK_ACTIONS = {
  visitor: ['What services do you offer?', 'Do you work with businesses in Lake Charles?', "I'd like a quote for a new website"],
  admin: ["Write this week's social posts: 1 each for Facebook, Instagram, LinkedIn and Google Business", 'Write an SEO blog post targeting "website design Lake Charles LA"', 'Draft follow-up emails for all new leads', "Plan next month's marketing campaign with a weekly content calendar"],
};
export function loadChat(key, isAdmin) {
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem(key)); } catch { saved = null; }
  const valid = (items) => Array.isArray(items) ? items.filter(m => ['user', 'assistant'].includes(m?.role) && typeof m.content === 'string').slice(-50) : [];
  return { mode: isAdmin && saved?.mode === 'admin' ? 'admin' : 'visitor', threads: { visitor: valid(saved?.threads?.visitor), admin: isAdmin ? valid(saved?.threads?.admin) : [] }, sessionId: /^[a-f0-9-]{36}$/.test(saved?.sessionId || '') ? saved.sessionId : crypto.randomUUID() };
}
export function saveChat(key, state) {
  try { sessionStorage.setItem(key, JSON.stringify(state)); } catch { /* Conversation remains available in memory when storage is blocked. */ }
}