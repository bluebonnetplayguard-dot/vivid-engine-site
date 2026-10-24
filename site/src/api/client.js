// Vivid Engine API client: talks to the app's own backend at /api.
//   api.auth.*        sign-in, sign-up, sessions
//   api.entities.X.*  list / filter / get / create / update / delete / aggregate / subscribe
//   api.functions.invoke(name, payload)
//   api.analytics.track({ eventName, properties })
//
// Auth: a short-lived access token is kept in memory only. The long-lived
// refresh token is an httpOnly cookie the browser sends to /api/auth, so
// scripts on the page can never read it.

const API = '/api';

export class ApiError extends Error {
  constructor(status, data) {
    super((data && data.error) || `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.code = data && data.code;
    this.response = { status, data }; // matches the axios-style checks already in the pages
  }
}

let accessToken = null;
let refreshing = null;
let signedOutUntil = 0; // after a failed refresh, skip retrying for a minute (anonymous visitors)

async function refreshSession() {
  // Single-flight: concurrent 401s share one refresh request.
  refreshing ||= fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'same-origin' })
    .then(async res => {
      if (!res.ok) { accessToken = null; signedOutUntil = Date.now() + 60_000; return false; }
      const body = await res.json();
      accessToken = body.access_token;
      return true;
    })
    .catch(() => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

async function request(method, path, { body, query, retry = true } = {}) {
  const url = new URL(API + path, window.location.origin);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, { error: 'Could not reach the server. Check your connection and try again.' });
  }

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshSession()) return request(method, path, { body, query, retry: false });
  }
  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

async function ensureToken() {
  if (accessToken) return true;
  if (Date.now() < signedOutUntil) return false;
  return refreshSession();
}

// ---------- auth ----------

const auth = {
  async me() {
    if (!(await ensureToken())) throw new ApiError(401, { error: 'Sign in to continue.', code: 'AUTH_REQUIRED' });
    return request('GET', '/auth/me');
  },
  async isAuthenticated() {
    return ensureToken();
  },
  async loginViaEmailPassword(email, password) {
    const res = await request('POST', '/auth/login', { body: { email, password } });
    accessToken = res.access_token;
    return res;
  },
  async register({ email, password }) {
    return request('POST', '/auth/register', { body: { email, password } });
  },
  async verifyOtp({ email, otpCode }) {
    const res = await request('POST', '/auth/verify-otp', { body: { email, otpCode } });
    accessToken = res.access_token;
    return res;
  },
  resendOtp(email) {
    return request('POST', '/auth/resend-otp', { body: { email } });
  },
  setToken(token) {
    accessToken = token || null;
  },
  resetPasswordRequest(email) {
    return request('POST', '/auth/reset-password-request', { body: { email } });
  },
  resetPassword({ resetToken, newPassword }) {
    return request('POST', '/auth/reset-password', { body: { resetToken, newPassword } });
  },
  updateMe(data) {
    return request('PATCH', '/auth/me', { body: data });
  },
  async logout(redirectUrl) {
    try { await request('POST', '/auth/logout'); } catch { /* signing out locally is enough */ }
    accessToken = null;
    closeEvents();
    if (redirectUrl) window.location.href = redirectUrl;
  },
  redirectToLogin(returnUrl = window.location.href) {
    const u = new URL(returnUrl, window.location.origin);
    window.location.href = `/login?returnTo=${encodeURIComponent(u.pathname + u.search)}`;
  },
  // Google sign-in runs on the server; it lands back on returnTo with a session cookie.
  async loginWithProvider(provider, returnTo = '/') {
    if (provider !== 'google') throw new ApiError(400, { error: `Sign-in with ${provider} is not available.` });
    window.location.href = `${API}/auth/google?returnTo=${encodeURIComponent(returnTo)}`;
  },
};

// ---------- entities ----------

function collection(name) {
  const base = `/entities/${encodeURIComponent(name)}`;
  return {
    // list(sort?, limit?, skip?) -> array
    list(sort, limit, skip) {
      return request('GET', base, { query: { sort, limit, skip } });
    },
    // filter(query, sort?, limit?, skip?) -> array
    // filter(query, { sort, limit, cursor })  -> { items, has_more, next_cursor }
    filter(query = {}, sortOrOptions, limit, skip) {
      if (sortOrOptions && typeof sortOrOptions === 'object') {
        const { sort, limit: l, cursor } = sortOrOptions;
        return request('GET', base, { query: { q: query, sort, limit: l, cursor, page: 1 } });
      }
      return request('GET', base, { query: { q: query, sort: sortOrOptions, limit, skip } });
    },
    get(id) {
      return request('GET', `${base}/${encodeURIComponent(id)}`);
    },
    create(data) {
      return request('POST', base, { body: data });
    },
    update(id, data) {
      return request('PATCH', `${base}/${encodeURIComponent(id)}`, { body: data });
    },
    delete(id) {
      return request('DELETE', `${base}/${encodeURIComponent(id)}`);
    },
    // aggregate({ query, groupBy }) -> { rows: [{ ...groupFields, count }] }
    aggregate({ query, groupBy } = {}) {
      return request('POST', `${base}/aggregate`, { body: { query, groupBy } });
    },
    // subscribe(cb) -> unsubscribe. cb receives { type: 'create'|'update'|'delete', id, data }.
    subscribe(callback) {
      return subscribe(name, callback);
    },
  };
}

const entities = new Proxy({}, {
  get(cache, name) {
    if (typeof name !== 'string') return undefined;
    return (cache[name] ||= collection(name));
  },
});

// ---------- live updates (one shared server-sent-events stream) ----------

const listeners = new Map(); // entity -> Set<callback>
let stream = null;           // AbortController for the open stream
let retryDelay = 1000;

function subscribe(entity, callback) {
  if (!listeners.has(entity)) listeners.set(entity, new Set());
  listeners.get(entity).add(callback);
  openEvents();
  return () => {
    listeners.get(entity)?.delete(callback);
    if ([...listeners.values()].every(set => set.size === 0)) closeEvents();
  };
}

function dispatch(event) {
  for (const cb of listeners.get(event.entity) || []) {
    try { cb({ type: event.type, id: event.id, data: event.data }); } catch (e) { console.error(e); }
  }
}

function closeEvents() {
  stream?.abort();
  stream = null;
}

async function openEvents() {
  if (stream) return;
  const controller = new AbortController();
  stream = controller;
  try {
    if (!(await ensureToken())) { stream = null; return; }
    const res = await fetch(`${API}/events`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'text/event-stream' }, signal: controller.signal });
    if (res.status === 401 && (await refreshSession())) throw new Error('retry');
    if (!res.ok || !res.body) throw new Error(`events ${res.status}`);
    retryDelay = 1000;
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let split;
      while ((split = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const type = /^event: (.*)$/m.exec(chunk)?.[1];
        const data = chunk.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
        if (type === 'change' && data) { try { dispatch(JSON.parse(data)); } catch { /* ignore malformed */ } }
      }
    }
    throw new Error('stream ended');
  } catch {
    if (controller.signal.aborted) return;
    stream = null;
    // Reconnect with backoff while anyone is still listening. Access tokens expire,
    // so each reconnect goes through ensureToken/refresh again.
    if ([...listeners.values()].some(set => set.size > 0)) {
      setTimeout(openEvents, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30000);
    }
  }
}

// ---------- functions & analytics ----------

const functions = {
  // Same contract as before: resolves to { data }, throws ApiError (with .status/.data/.response) on failure.
  async invoke(name, payload = {}) {
    await ensureToken(); // signed-in callers attach their token; public functions work without one
    const data = await request('POST', `/functions/${encodeURIComponent(name)}`, { body: payload });
    return { data };
  },
};

// Counts visits and clicks only after the visitor allows analytics (see components/shell/CookieConsent.jsx).
const analytics = {
  track({ eventName, properties } = {}) {
    let allowed = false;
    try { allowed = localStorage.getItem('ve-cookie-consent') === 'all'; } catch { /* storage blocked: treat as not allowed */ }
    if (!allowed) return;
    request('POST', '/analytics/track', { body: { eventName, properties } }).catch(() => {});
  },
};

// ---------- Vivid AI Search ----------

// Reads a server-sent-events body and calls onEvent(type, data) for each event.
async function readEvents(res, onEvent) {
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let split;
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const type = /^event: (.*)$/m.exec(chunk)?.[1];
      const data = chunk.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
      if (type && data) { try { onEvent(type, JSON.parse(data)); } catch { /* ignore malformed */ } }
    }
  }
}

const aiSearch = {
  plans: () => request('GET', '/ai-search/plans'),
  me: () => request('GET', '/ai-search/me'),
  threads: (query = {}) => request('GET', `/ai-search/threads${Object.keys(query).length ? `?${new URLSearchParams(query)}` : ''}`),
  // { title?, pinned?, favorite?, space?, autoDeleteDays? } (paid plans; the server refuses otherwise)
  updateThread: (id, patch) => request('PATCH', `/ai-search/threads/${encodeURIComponent(id)}`, { body: patch }),
  spaces: () => request('GET', '/ai-search/spaces'),
  exportAll: () => request('GET', '/ai-search/export'),
  thread: id => request('GET', `/ai-search/threads/${encodeURIComponent(id)}`),
  deleteThread: id => request('DELETE', `/ai-search/threads/${encodeURIComponent(id)}`),
  checkout: body => request('POST', '/ai-search/checkout', { body }),
  billingPortal: () => request('POST', '/ai-search/billing-portal', { body: {} }),
  team: () => request('GET', '/ai-search/team'),
  addMember: email => request('POST', '/ai-search/team', { body: { email } }),
  removeMember: id => request('DELETE', `/ai-search/team/${encodeURIComponent(id)}`),
  // Streams an answer as server-sent events. onEvent(type, data) receives: thread | unsaved, routing, status,
  // sources, delta, answer, usage_warning, followups, done | error. Works signed out too (a few guest searches a day).
  // mode: search|build|create|business  engine: auto|perplexity|claude|gemini|combined  depth: quick|pro|deep
  // focus: web|local|news|shopping|images|videos|academic|business  attachments: [{ mime, data(base64), name }]
  // private: never save  safeResults: standard|strict|off  lang: en|es
  // history: recent turns for conversations the server doesn't save (guests, free plans, private mode).
  async ask({ question, threadId, signal, onEvent, mode, engine, depth, focus, attachments, private: isPrivate, safeResults, lang, history }) {
    await ensureToken();
    const send = () => fetch(`${API}/ai-search/ask`, {
      method: 'POST', credentials: 'same-origin', signal,
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ question, threadId: threadId || undefined, mode, engine, depth, focus, attachments: attachments?.length ? attachments : undefined, private: isPrivate || undefined, safeResults, lang, history: threadId ? undefined : history }),
    });
    let res;
    try {
      res = await send();
      if (res.status === 401 && (await refreshSession())) res = await send();
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      throw new ApiError(0, { error: 'Could not reach the server. Check your connection and try again.' });
    }
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
      throw new ApiError(res.status, data);
    }
    await readEvents(res, onEvent);
  },
};

// Signed-in request for non-JSON bodies or responses (audio, media files). Returns the Response.
async function authedFetch(path, init = {}) {
  await ensureToken();
  const send = () => fetch(API + path, { credentials: 'same-origin', ...init, headers: { ...init.headers, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) } });
  let res;
  try {
    res = await send();
    if (res.status === 401 && (await refreshSession())) res = await send();
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    throw new ApiError(0, { error: 'Could not reach the server. Check your connection and try again.' });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
    throw new ApiError(res.status, data);
  }
  return res;
}

const video = {
  plans: () => request('GET', '/video/plans'),
  me: () => request('GET', '/video/me'),
  projects: () => request('GET', '/video/projects'),
  project: id => request('GET', `/video/projects/${encodeURIComponent(id)}`),
  createProject: body => request('POST', '/video/projects', { body }),
  saveProject: (id, body) => request('PUT', `/video/projects/${encodeURIComponent(id)}`, { body }),
  deleteProject: id => request('DELETE', `/video/projects/${encodeURIComponent(id)}`),
  brandKits: () => request('GET', '/video/brand-kits'),
  createBrandKit: body => request('POST', '/video/brand-kits', { body }),
  saveBrandKit: (id, body) => request('PUT', `/video/brand-kits/${encodeURIComponent(id)}`, { body }),
  deleteBrandKit: id => request('DELETE', `/video/brand-kits/${encodeURIComponent(id)}`),
  startExport: body => request('POST', '/video/exports', { body }),
  storyboard: body => request('POST', '/video/storyboard', { body }),
  stockSearch: query => request('GET', '/video/stock/search', { query }),
  checkout: body => request('POST', '/video/checkout', { body }),
  billingPortal: () => request('POST', '/video/billing-portal', { body: {} }),
  team: () => request('GET', '/video/team'),
  addMember: email => request('POST', '/video/team', { body: { email } }),
  removeMember: id => request('DELETE', `/video/team/${encodeURIComponent(id)}`),
  // A 16-bit WAV piece of up to 30 s -> { words, segments, language, seconds }
  async transcribe(wav, language, signal) {
    const res = await authedFetch(`/video/transcribe${language ? `?language=${encodeURIComponent(language)}` : ''}`, { method: 'POST', body: wav, headers: { 'Content-Type': 'audio/wav' }, signal });
    return res.json();
  },
  // AI voiceover -> MP3 Blob
  async tts({ text, voice, style }, signal) {
    const res = await authedFetch('/video/tts', { method: 'POST', body: JSON.stringify({ text, voice, style }), headers: { 'Content-Type': 'application/json' }, signal });
    return new Blob([await res.arrayBuffer()], { type: 'audio/mpeg' });
  },
  // Downloads a stock file through our relay -> Blob. onProgress(fraction) when the size is known.
  async stockFile(url, { signal, onProgress } = {}) {
    const res = await authedFetch(`/video/stock/file?url=${encodeURIComponent(url)}`, { signal });
    const type = (res.headers.get('content-type') || '').split(';')[0];
    const total = Number(res.headers.get('content-length') || 0);
    if (!res.body || !total || !onProgress) return new Blob([await res.arrayBuffer()], { type });
    const reader = res.body.getReader();
    const parts = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value); got += value.length; onProgress(got / total);
    }
    return new Blob(parts, { type });
  },
};

// Vivid Build Studio in the AI search (Build mode).
const buildStudio = {
  // { message, spec?, history? } -> { reply, question?, spec, summary, changes, viewer, validation, notice, usedPlanner }
  turn: body => request('POST', '/build-studio/turn', { body }),
  // To-scale PDF sheet -> Blob
  async sheet({ spec, scale, paper }) {
    const res = await authedFetch('/build-studio/sheet', { method: 'POST', body: JSON.stringify({ spec, scale, paper }), headers: { 'Content-Type': 'application/json' } });
    return new Blob([await res.arrayBuffer()], { type: 'application/pdf' });
  },
};

const stackAdvisor = {
  // { message } -> { reply, edge?, stack?, results?, question? }  (evidence-based; never states a link without evidence)
  ask: body => request('POST', '/stack-advisor/ask', { body }),
  search: (q, filters = {}) => request('GET', `/stack-advisor/search?${new URLSearchParams({ q, ...filters })}`),
};

// Square payments. Prices are computed on the server; the browser only sends a token.
const payments = {
  config: () => request('GET', '/payments/config'),
  quote: body => request('POST', '/payments/quote', { body }),
  charge: body => request('POST', '/payments/charge', { body }),
  subscribe: body => request('POST', '/payments/subscribe', { body }),
  cancel: kind => request('POST', `/payments/subscriptions/${encodeURIComponent(kind)}/cancel`, { body: {} }),
  updateCard: (kind, body) => request('POST', `/payments/subscriptions/${encodeURIComponent(kind)}/card`, { body }),
  sendInvoice: id => request('POST', `/payments/invoices/${encodeURIComponent(id)}/send`, { body: {} }),
};

// Saved conversations (paid plans). Deleting always works, whatever the plan.
const history = {
  me: () => request('GET', '/history/me'),
  settings: body => request('PATCH', '/history/settings', { body }),
  list: (query = {}) => request('GET', '/history/conversations', { query }),
  get: id => request('GET', `/history/conversations/${encodeURIComponent(id)}`),
  update: (id, body) => request('PATCH', `/history/conversations/${encodeURIComponent(id)}`, { body }),
  remove: id => request('DELETE', `/history/conversations/${encodeURIComponent(id)}`),
  removeAll: () => request('DELETE', '/history/conversations', { query: { confirm: 'all' } }),
  exportAll: () => request('GET', '/history/export'),
};

// Admin only: the Billing Monitor (what each AI call cost, provider balances, budgets, alerts).
const billing = {
  summary: () => request('GET', '/admin/billing/summary'),
  breakdown: (dim, period) => request('GET', `/admin/billing/by-${dim}`, { query: { period } }),
  providers: () => request('GET', '/admin/billing/providers'),
  optimize: () => request('GET', '/admin/billing/optimize'),
  alerts: (open = false) => request('GET', '/admin/billing/alerts', { query: open ? { open: 1 } : {} }),
  ackAlert: id => request('POST', `/admin/billing/alerts/${encodeURIComponent(id)}/ack`, { body: {} }),
  budgets: () => request('GET', '/admin/billing/budgets'),
  saveBudget: body => request('POST', '/admin/billing/budgets', { body }),
  patchBudget: (id, body) => request('PATCH', `/admin/billing/budgets/${encodeURIComponent(id)}`, { body }),
  prices: () => request('GET', '/admin/billing/prices'),
  addPrice: body => request('POST', '/admin/billing/prices', { body }),
  confirmPrice: (id, confirmed = true) => request('PATCH', `/admin/billing/prices/${encodeURIComponent(id)}`, { body: { confirmed } }),
  unthrottle: userId => request('DELETE', `/admin/billing/throttles/${encodeURIComponent(userId)}`),
};

export const api = { auth, entities, functions, analytics, aiSearch, history, video, buildStudio, stackAdvisor, payments, billing };
export default api;
