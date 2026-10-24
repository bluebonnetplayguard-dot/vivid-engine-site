import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import {
  ArrowUp, Square, Mic, Plus, X, VenetianMask, Copy, Share2, Bookmark, CornerDownRight, Code, Clapperboard, Flag, Info, Lock, Paperclip,
} from 'lucide-react';
import { api } from '@/api/client';
import { whatsappUrl } from '@/config/business';
import { VIVID_TEMPLATES, COMMUNITY_TEMPLATES } from '@/config/templates';
import { EXAMPLE_LISTINGS, PARTNER_DISCLOSURE } from '@/config/partners';
import {
  FollowUps, SENSITIVE, SIGNUP_CODES, Sources, Sponsored, UPGRADE_CODES, Via, WhyEngine, mdLinks, withCitationLinks,
} from '@/components/aisearch/AnswerParts';
import BuildCard from '@/components/build/BuildCard';
import StackCard from '@/components/stack/StackCard';
import '@/components/aisearch/ai-search.css';
import './home.css';

const ROTATE = ['Ask anything…', 'How do I fix a leaky faucet?', 'Best family restaurants in Katy?', 'Compare iPhone vs. Galaxy', 'Explain my electric bill', 'Build me a website for my bakery…'];
const MODES = [['search', 'Search'], ['build', 'Build'], ['create', 'Create'], ['biz', 'Business Help']];
const MODELS = [['auto', 'Auto'], ['perplexity', 'Perplexity'], ['claude', 'Claude'], ['gemini', 'Gemini'], ['combined', 'Combined']];
const MODEL_NOTE = { auto: 'Vivid Engine picks the best engine', perplexity: 'Live web search with citations', claude: 'Writing, code and building', gemini: 'Images, video and files', combined: 'Asks all three and merges them' };
const FOCUS = [['', 'All'], ['web', 'Web'], ['local', 'Local'], ['news', 'News'], ['shopping', 'Shopping'], ['images', 'Images'], ['videos', 'Videos'], ['academic', 'Academic'], ['business', 'Business']];
const DEPTHS = [['quick', 'Quick'], ['pro', 'Pro'], ['deep', 'Deep Research']];
const MODE_PLACEHOLDER = { stack: 'Ask about AI tools, e.g. “Do LlamaIndex and Qdrant work together?”', build: 'Describe the website, app or project to plan…', create: 'Describe the video, image or post you want…', biz: 'Ask a question about your business…' };
const MODE_CHIPS = {
  search: ['Explain this in simple terms', 'Compare two products', 'What’s happening in Houston today?', 'Plan a weekend trip', 'Help with homework', 'Fact-check a claim'],
  build: ['Plan a website for my bakery', 'Plan an app for my club', 'Design a 12x16 deck 30 inches high', 'Check an AI tool stack'],
  create: ['Write a 30-second promo video script', 'Ideas for a grand opening flyer', 'Write captions for 5 social posts', 'Logo ideas for a coffee truck'],
  biz: ['How do I get on Google Maps?', 'Write a price list for my services', 'Draft a follow-up text to a customer', 'Ideas to get more Google reviews'],
};
const PERSONAS = [['research', 'Answers & research'], ['school', 'School & learning'], ['shopping', 'Shopping & comparing'], ['local', 'Local help'], ['business', 'Running a business'], ['builder', 'Building a site or app']];
const FILE_TYPES = 'image/png,image/jpeg,image/webp,image/gif,application/pdf';
const MAX_FILE_BYTES = 300 * 1024;
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };
const session = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } } };
const track = (eventName, properties) => api.analytics?.track?.({ eventName, properties });

function useSpeech(onText) {
  const Rec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const [listening, setListening] = useState(false);
  const rec = useRef(null);
  if (!Rec) return null;
  const toggle = () => {
    if (listening) { rec.current?.stop(); return; }
    const r = new Rec(); rec.current = r;
    r.lang = document.documentElement.lang === 'es' ? 'es-US' : 'en-US'; r.interimResults = false;
    r.onresult = e => onText(Array.from(e.results).map(x => x[0].transcript).join(' '));
    r.onend = () => setListening(false); r.onerror = () => setListening(false);
    setListening(true); r.start();
  };
  return { listening, toggle };
}

const readFile = file => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve({ name: file.name.slice(0, 80), mime: file.type, data: String(r.result).split(',')[1] || '' });
  r.onerror = () => reject(r.error); r.readAsDataURL(file);
});

function Chips({ label, options, value, onChange, small }) {
  return <div className={`vh-seg${small ? ' is-small' : ''}`} role="radiogroup" aria-label={label}>
    {options.map(([v, l]) => <button key={v || 'all'} type="button" role="radio" aria-checked={value === v} className={value === v ? 'is-on' : ''} onClick={() => onChange(v)}>{l}</button>)}
  </div>;
}

function Composer({ t, account, compact, placeholder, autoFocus, onToast, seed }) {
  const [input, setInput] = useState('');
  const ref = useRef(null);
  const fileRef = useRef(null);
  const speech = useSpeech(text => setInput(v => (v ? `${v} ${text}` : text)));
  const paid = account.access?.allowed;
  const submit = e => { e?.preventDefault(); if (!input.trim() || t.busy) return; t.ask(input); setInput(''); if (ref.current) ref.current.style.height = 'auto'; };
  const grow = e => { e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`; };
  useEffect(() => { if (autoFocus) ref.current?.focus({ preventScroll: true }); }, [autoFocus]);
  // A template fills the box (it is not sent until the person edits and presses send).
  useEffect(() => { if (seed?.text) { setInput(seed.text); ref.current?.focus(); } }, [seed?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickFiles = async e => {
    const list = [...(e.target.files || [])]; e.target.value = '';
    if (!account.isAuthenticated) { onToast('Sign in to attach files.'); return; }
    const total = [...t.attachments.map(a => a.size || 0), ...list.map(f => f.size)].reduce((s, n) => s + n, 0);
    if (t.attachments.length + list.length > 3) { onToast('Up to 3 files per question.'); return; }
    if (total > MAX_FILE_BYTES) { onToast('Files need to be under about 300 KB in total.'); return; }
    try { const read = await Promise.all(list.map(readFile)); t.setAttachments(a => [...a, ...read.map((r, i) => ({ ...r, size: list[i].size }))]); }
    catch { onToast('That file could not be read.'); }
  };
  return <form className={`vh-box${t.privateMode ? ' is-private' : ''}${compact ? ' is-compact' : ''}`} onSubmit={submit} role="search" aria-label="Ask Vivid Engine">
    {t.privateMode && <p className="vh-privnote"><VenetianMask size={15} aria-hidden="true" />Private mode: this conversation won’t be saved, even on your plan.</p>}
    {!compact && <div className="vh-row">
      <Chips label="Mode" options={MODES} value={t.mode === 'stack' ? 'build' : t.mode} onChange={v => t.setMode(v)} />
      <label className="vh-pick" title={MODEL_NOTE[t.model]}><span className="sr-only">AI engine</span>
        <select value={t.model} onChange={e => t.setModel(e.target.value)} aria-label="AI engine">{MODELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </label>
    </div>}
    <label htmlFor={compact ? 'vh-follow' : 'vh-q'} className="sr-only">{compact ? 'Ask a follow-up' : 'Ask anything'}</label>
    <textarea id={compact ? 'vh-follow' : 'vh-q'} ref={ref} rows={compact ? 1 : 2} value={input} maxLength={4000} placeholder={placeholder}
      onChange={e => { setInput(e.target.value); grow(e); }}
      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e); }} />
    {t.attachments.length > 0 && <ul className="vh-files" aria-label="Attached files">{t.attachments.map((f, i) => <li key={f.name + i}><Paperclip size={13} aria-hidden="true" />{f.name}
      <button type="button" aria-label={`Remove ${f.name}`} onClick={() => t.setAttachments(a => a.filter((_, j) => j !== i))}><X size={13} /></button></li>)}</ul>}
    <div className="vh-tools">
      <button type="button" className="vh-icon" aria-label="Attach a file (images or PDF)" title="Attach images or a PDF" onClick={() => fileRef.current?.click()}><Plus size={18} /></button>
      <input ref={fileRef} type="file" accept={FILE_TYPES} multiple hidden onChange={pickFiles} />
      <span className="vh-spacer" />
      {paid && <button type="button" className="vh-icon" aria-pressed={t.privateMode} aria-label="Private mode" title="Private mode: never saved" onClick={() => t.setPrivateMode(p => !p)}><VenetianMask size={18} /></button>}
      {speech && <button type="button" className="vh-icon" aria-pressed={speech.listening} aria-label={speech.listening ? 'Stop voice input' : 'Voice input'} onClick={speech.toggle}><Mic size={18} /></button>}
      {t.busy
        ? <button type="button" className="vh-send" onClick={t.stop} aria-label="Stop answering"><Square size={15} /></button>
        : <button type="submit" className={`vh-send${input.trim() ? ' is-ready' : ''}`} disabled={!input.trim()} aria-label={t.mode === 'search' ? 'Search' : 'Send'}><ArrowUp size={19} /></button>}
    </div>
  </form>;
}

function Answer({ m, t, account, isLast, onToast, showUnsaved }) {
  const paid = account.access?.allowed;
  const shareLink = paid && t.threadId && !t.privateMode && typeof window !== 'undefined' ? `${window.location.origin}/search?thread=${encodeURIComponent(t.threadId)}` : null;
  const share = async () => {
    const text = shareLink || `${m.question}\n\n${m.content}`;
    try { await navigator.clipboard.writeText(text); onToast(shareLink ? 'Link copied. Only you can open it while signed in.' : 'Answer copied. Saved links come with paid plans.'); } catch { onToast('Select the answer text to copy it'); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(m.content); onToast('Answer copied'); } catch { onToast('Select the answer text to copy it'); } };
  const report = () => { track('answer_report', { threadId: t.threadId || null }); onToast('Thanks. This answer was flagged for review.'); };
  const done = !m.status && (m.content || m.error);
  const waMsg = `Hi Vivid Engine, I have a question about this answer: "${(m.question || '').slice(0, 200)}"`;
  return <div className="ais-answer" aria-live={isLast ? 'polite' : undefined}>
    <Via m={m} />
    {m.status && <div className="ais-status" role="status"><span className="ais-dot" aria-hidden="true" />{m.status}</div>}
    {SENSITIVE.test(m.question || '') && m.content && <p className="vh-advice"><Info size={16} aria-hidden="true" />This isn’t professional advice. Check with a qualified professional before acting on it.</p>}
    {m.content && <ReactMarkdown components={mdLinks}>{withCitationLinks(m.content, m.sources)}</ReactMarkdown>}
    {m.error && <div className="ais-error" role="alert">{m.error.message}
      {UPGRADE_CODES.has(m.error.code) && <> <Link to="/pricing/search">See plans</Link></>}
      {SIGNUP_CODES.has(m.error.code) && <> <Link to="/register">Create a free account</Link> or <Link to={`/login?returnTo=${encodeURIComponent(`/?aiq=${encodeURIComponent((m.question || '').slice(0, 1500))}`)}`}>sign in</Link>.</>}
    </div>}
    <Sources sources={m.sources} />
    {done && m.content && <>
      <WhyEngine m={m} />
      <p className="vh-disclaimer">AI can make mistakes. Check important info.</p>
      <div className="vh-acts">
        <button type="button" onClick={copy}><Copy size={15} aria-hidden="true" />Copy</button>
        <button type="button" onClick={share}><Share2 size={15} aria-hidden="true" />Share</button>
        {paid && !t.privateMode && t.threadId
          ? <Link to={`/search?thread=${encodeURIComponent(t.threadId)}`}><Bookmark size={15} aria-hidden="true" />Saved</Link>
          : <Link to="/pricing/search" title="Save your conversations with any paid plan"><Bookmark size={15} aria-hidden="true" />Save</Link>}
        <button type="button" onClick={() => document.getElementById('vh-follow')?.focus()}><CornerDownRight size={15} aria-hidden="true" />Follow-up</button>
        <Link className="is-quiet" to={`/build?brief=${encodeURIComponent((m.question || '').slice(0, 300))}`}><Code size={15} aria-hidden="true" />Build from this</Link>
        <Link className="is-quiet" to={`/create/video?brief=${encodeURIComponent((m.question || '').slice(0, 300))}`}><Clapperboard size={15} aria-hidden="true" />Make a video</Link>
        <a className="is-wa" href={whatsappUrl(waMsg)} target="_blank" rel="noopener noreferrer" onClick={() => track('whatsapp_click', { placement: 'answer' })}>WhatsApp us</a>
        <button type="button" className="vh-report" onClick={report}><Flag size={14} aria-hidden="true" />Report</button>
      </div>
      <FollowUps m={m} onAsk={t.ask} disabled={t.busy} />
      <Sponsored m={m} />
      {showUnsaved && <p className="vh-unsaved"><Lock size={14} aria-hidden="true" />This conversation won’t be saved. <Link to="/pricing/search">Save your conversations with any paid plan</Link></p>}
    </>}
  </div>;
}

function HomeTabs({ t, account, onUse }) {
  const [tab, setTab] = useState('vivid');
  const canSee = account.access?.allowed || account.access?.readOnly;
  const tabs = [['recent', 'Recent'], ['community', 'Community Templates'], ['vivid', 'Vivid Engine Templates'], ['local', 'Local Businesses']];
  const use = tpl => { t.setMode(tpl.mode === 'business' ? 'biz' : tpl.mode); onUse(tpl.prompt); };
  return <section className="vh-tabs" aria-label="Get started">
    <div className="vh-tablist" role="tablist">
      {tabs.map(([id, label]) => <button key={id} type="button" role="tab" id={`vh-tab-${id}`} aria-selected={tab === id} aria-controls={`vh-panel-${id}`} className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>{label}</button>)}
      <Link className="vh-tab-link" to="/templates">Browse all</Link>
    </div>
    <div role="tabpanel" id={`vh-panel-${tab}`} aria-labelledby={`vh-tab-${tab}`} className="vh-tabpanel">
      {tab === 'recent' && (canSee
        ? (account.threads?.length ? <ul className="vh-cards">{account.threads.slice(0, 6).map(x => <li key={x.id}><button type="button" onClick={() => t.openThread(x.id)}><b>{x.title}</b><small>{new Date(x.updated_date || x.created_date).toLocaleDateString()}</small></button></li>)}</ul> : <p className="vh-empty">Your saved conversations will appear here.</p>)
        : <p className="vh-empty"><Lock size={14} aria-hidden="true" /> Save your conversations with any paid plan. <Link to="/pricing/search">See plans</Link></p>)}
      {tab === 'community' && (COMMUNITY_TEMPLATES.length
        ? <ul className="vh-cards">{COMMUNITY_TEMPLATES.slice(0, 6).map(x => <li key={x.id}><button type="button" onClick={() => use(x)}><b>{x.title}</b><small>{x.category}</small></button></li>)}</ul>
        : <p className="vh-empty">Community templates open soon. Until then, try ours.</p>)}
      {tab === 'vivid' && <ul className="vh-cards">{VIVID_TEMPLATES.slice(0, 6).map(x => <li key={x.id}><button type="button" onClick={() => use(x)}><b>{x.title}</b><small>{x.category}</small></button></li>)}</ul>}
      {tab === 'local' && <>
        <ul className="vh-cards">{EXAMPLE_LISTINGS.map(x => <li key={x.id}><div className="vh-card-static"><span className="vh-partner-tag">Vivid Engine Partner · Example</span><b>{x.name}</b><small>{x.tagline} · {x.city}</small></div></li>)}</ul>
        <p className="vh-empty">{PARTNER_DISCLOSURE} <Link to="/partners">Become a partner</Link>.</p>
      </>}
    </div>
  </section>;
}

// Search-first home: one heading, the ask box, then the conversation in place once someone asks.
export default function HomeSearch({ t, account }) {
  const { isAuthenticated, access = {}, me, user } = account;
  const firstName = (user?.full_name || user?.name || '').trim().split(/\s+/)[0];
  const [ph, setPh] = useState(0);
  const [toast, setToast] = useState('');
  const [welcomed, setWelcomed] = useState(() => !!store.get('ve-welcomed'));
  const [unsavedIndex, setUnsavedIndex] = useState(null);
  const [seed, setSeed] = useState(null);
  const [params, setParams] = useSearchParams();
  const bottomRef = useRef(null);
  const empty = t.messages.length === 0;
  const answers = t.messages.filter(m => m.role === 'assistant');
  const lastApplied = t.messages.reduce((acc, m, i) => (m.kind === 'build' && m.applied ? i : acc), -1);

  useEffect(() => { const id = setInterval(() => setPh(i => (i + 1) % ROTATE.length), 3200); return () => clearInterval(id); }, []);
  // Links can open the box in a mode (/?mode=build) or with a template filled in (/?tpl=price-list).
  useEffect(() => {
    const mode = params.get('mode'); const tpl = VIVID_TEMPLATES.find(x => x.id === params.get('tpl'));
    if (!mode && !tpl) return;
    if (['search', 'build', 'create', 'biz', 'stack'].includes(mode)) t.setMode(mode);
    if (tpl) { t.setMode(tpl.mode === 'business' ? 'biz' : tpl.mode); setSeed({ text: tpl.prompt, n: Date.now() }); }
    params.delete('mode'); params.delete('tpl'); setParams(params, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!toast) return undefined; const id = setTimeout(() => setToast(''), 2800); return () => clearTimeout(id); }, [toast]);
  useEffect(() => { if (!empty) bottomRef.current?.scrollIntoView({ block: 'end' }); }, [t.messages.length, empty]);
  useEffect(() => { if (empty) setUnsavedIndex(null); }, [empty]);
  // The "won't be saved" note shows once per browser session, on the first finished answer.
  useEffect(() => {
    if ((access.allowed && !t.privateMode) || session.get('ve-unsaved-note')) return;
    const i = t.messages.findIndex(m => m.role === 'assistant' && m.content && !m.status);
    if (i >= 0) { session.set('ve-unsaved-note', '1'); setUnsavedIndex(i); }
  }, [t.messages, access.allowed, t.privateMode]);

  const chips = MODE_CHIPS[t.mode] || MODE_CHIPS.search;
  const placeholder = t.mode === 'search' ? ROTATE[ph] : MODE_PLACEHOLDER[t.mode];
  const pickChip = c => { if (c === 'Check an AI tool stack') { t.setMode('stack'); document.getElementById('vh-q')?.focus(); return; } t.ask(c.replace(/…$/, '')); };
  const dismissWelcome = persona => { if (persona) { store.set('ve-persona', persona); setToast('Thanks. Your starter ideas are updated.'); } store.set('ve-welcomed', '1'); setWelcomed(true); };

  if (empty) return <section className="vh-hero" aria-labelledby="vh-title">
    <div className="vh-logo" aria-hidden="true"><img src="/logo-400.webp" alt="" width="120" height="120" /></div>
    {isAuthenticated
      ? <h1 id="vh-title" className="vh-h1">Hi{firstName ? ` ${firstName}` : ''}. <span className="engine-blue">What can Vivid Engine do for you today?</span></h1>
      : <><h1 id="vh-title" className="vh-h1">Vivid Engine: <span className="engine-blue">AI Search and Build</span> for Greater Houston, SE Texas &amp; SW Louisiana</h1>
          <p className="vh-sub">Answers with sources from Perplexity, Claude and Gemini, plus websites, apps and video from the same place. Built and supported by a local team.</p></>}
    <Composer t={t} account={account} placeholder={placeholder} onToast={setToast} seed={seed} />
    <div className="vh-chips" aria-label="Ideas to try">{chips.map(c => <button key={c} type="button" className="ais-chip" onClick={() => pickChip(c)}>{c}</button>)}</div>
    <p className="vh-plan">
      {isAuthenticated && me?.tier ? <>
        <span className="ais-badge">{me.tier.name}</span>
        {me.usage && <span>{me.usage.today} of {me.usage.dailyLimit} today</span>}
        {access.allowed ? <span>History on</span> : <Link to="/pricing/search">Save your conversations with any paid plan</Link>}
      </> : <span>{isAuthenticated ? 'Free account: 5 questions a day.' : 'Try a few searches free, no account needed.'} <Link to="/pricing/search">See plans</Link></span>}
    </p>
    <HomeTabs t={t} account={account} onUse={text => setSeed({ text, n: Date.now() })} />
    {toast && <div className="vh-toast" role="status">{toast}</div>}
  </section>;

  return <section className="vh-thread" aria-label="Conversation">
    <div className="vh-thead">
      <button type="button" className="vh-back" onClick={t.reset}>← New search</button>
      {t.privateMode && <span className="vh-tag is-private"><VenetianMask size={14} aria-hidden="true" />Private, not saved</span>}
      {access.readOnly && <span className="vh-tag">Read-only history</span>}
    </div>
    {t.messages.map((m, i) => <div key={i} className="ais-msg">
      {m.role === 'user'
        ? (i === 0 ? <h1 className="vh-q">{m.content}</h1> : <h2 className="vh-q is-follow">{m.content}</h2>)
        : m.kind === 'stack'
          ? <StackCard m={m} />
        : m.kind === 'build'
          ? <BuildCard m={m} pending={!!m.pending} canUndo={t.canUndo && m.applied && i === lastApplied} onApply={() => t.applyPending(i)} onDiscard={() => t.discardPending(i)} onUndo={t.undoBuild} />
          : m.kind === 'note'
            ? <p className="vb-note">{m.content}</p>
            : <Answer m={m} t={t} account={account} isLast={i === t.messages.length - 1} onToast={setToast} showUnsaved={i === unsavedIndex} />}
      {/* The welcome card shows once, inline after the first answer, for signed-in people. Skip is remembered. */}
      {isAuthenticated && !welcomed && m.role === 'assistant' && m === answers.find(a => a.content && !a.status) && <div className="vh-welcome" role="region" aria-label="Personalize">
        <b>Welcome to Vivid Engine. What brings you here?</b>
        <p>Optional. It only tailors your starter ideas. Every feature stays open to you.</p>
        <div>{PERSONAS.map(([k, l]) => <button key={k} type="button" onClick={() => dismissWelcome(k)}>{l}</button>)}<button type="button" className="is-skip" onClick={() => dismissWelcome(null)}>Skip</button></div>
      </div>}
    </div>)}
    <div ref={bottomRef} />
    <div className="vh-follow">
      <div className="vh-controls">
        <Chips small label="Focus" options={FOCUS} value={t.focus} onChange={t.setFocus} />
        <label className="vh-pick"><span className="sr-only">Depth</span>
          <select value={t.depth} onChange={e => t.setDepth(e.target.value)} aria-label="Depth">{DEPTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
      </div>
      <Composer t={t} account={account} compact placeholder={t.mode === 'build' ? 'Change the plan, e.g. “add a booking page”…' : 'Ask a follow-up…'} autoFocus={false} onToast={setToast} />
    </div>
    {toast && <div className="vh-toast" role="status">{toast}</div>}
  </section>;
}
