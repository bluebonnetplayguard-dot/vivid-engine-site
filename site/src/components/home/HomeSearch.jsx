import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import {
  ArrowUp, Square, Mic, Search, Sparkles, VenetianMask, Copy, Share2, Bookmark, CornerDownRight,
  Code, Clapperboard, Flag, Info, Lock,
} from 'lucide-react';
import { api } from '@/api/client';
import { whatsappUrl } from '@/config/business';
import { Engines, Sources, SENSITIVE, UPGRADE_CODES, mdLinks, whyThisEngine } from '@/components/aisearch/AnswerParts';
import BuildCard from '@/components/build/BuildCard';
import '@/components/aisearch/ai-search.css';
import './home.css';

const ROTATE = ['Ask anything…', 'How do I fix a leaky faucet?', 'Best family restaurants in Katy?', 'Compare iPhone vs. Galaxy', 'Explain my electric bill', 'Build me a website…'];
const MODE_PLACEHOLDER = { build: 'Describe what to design: a deck, a website, an app…', create: 'Describe the video or image you want…', biz: 'Ask a question about your business…' };
const MODE_CHIPS = {
  build: ['Design a 12x16 deck 30 inches high', 'Draw a 16x12 deck, joists 12 in o.c.', 'Build me a website for my bakery', 'Plan the pages for a new website'],
  create: ['Write a 30-second promo video script', 'Ideas for a grand opening flyer', 'Write captions for 5 social posts', 'Logo ideas for a coffee truck'],
  biz: ['How do I get on Google Maps?', 'Write a price list for my services', 'Draft a follow-up text to a customer', 'Ideas to get more Google reviews'],
};
const PERSONA_CHIPS = {
  general: ['Explain this in simple terms', 'Compare two products', 'Plan a weekend trip', 'Help with homework', 'What’s happening in Houston today?', 'Summarize an article for me'],
  research: ['Explain this in simple terms', 'Pros and cons of electric cars', 'What’s happening in Houston today?', 'Fact-check a claim', 'Summarize an article for me', 'Compare two products'],
  school: ['Help with homework', 'Explain photosynthesis simply', 'Quiz me on the Civil War', 'Check my essay outline', 'Solve a math problem step by step', 'Explain this in simple terms'],
  shopping: ['Compare iPhone vs. Galaxy', 'Best budget air fryer?', 'Is this a good deal?', 'Find a gift under $50', 'Compare two products', 'Read the reviews for me'],
  local: ['What’s happening in Houston today?', 'Best family restaurants in Katy?', 'How do I find a good plumber?', 'Things to do in Beaumont this weekend', 'Plan a weekend trip', 'Explain my electric bill'],
  business: ['How do I get on Google Maps?', 'Write a price list', 'Draft a customer email', 'Ideas to get more reviews', 'Compare two products', 'Explain this in simple terms'],
  builder: ['Build me a website…', 'Plan an app for my club', 'Compare website builders', 'Write a homepage headline', 'Explain this in simple terms', 'Plan a weekend trip'],
};
const PERSONAS = [['research', 'Answers & research'], ['school', 'School & learning'], ['shopping', 'Shopping & comparing'], ['local', 'Local help'], ['business', 'Running a business'], ['builder', 'Building a site or app']];
const MODEL_NOTE = { auto: 'Vivid Engine picks the best engine', claude: 'Writing, code and building', perplexity: 'Live web search with citations', gemini: 'Images, video and files', combined: 'Compares and merges all three' };
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };
const session = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } } };

function useSpeech(onText) {
  const Rec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const [listening, setListening] = useState(false);
  const rec = useRef(null);
  if (!Rec) return null;
  const toggle = () => {
    if (listening) { rec.current?.stop(); return; }
    const r = new Rec(); rec.current = r;
    r.lang = document.documentElement.lang || 'en-US'; r.interimResults = false;
    r.onresult = e => onText(Array.from(e.results).map(x => x[0].transcript).join(' '));
    r.onend = () => setListening(false); r.onerror = () => setListening(false);
    setListening(true); r.start();
  };
  return { listening, toggle };
}

function Composer({ t, account, compact, placeholder, autoFocus }) {
  const [input, setInput] = useState('');
  const ref = useRef(null);
  const speech = useSpeech(text => setInput(v => (v ? `${v} ${text}` : text)));
  const paid = account.access?.allowed;
  const submit = e => { e?.preventDefault(); if (!input.trim() || t.busy) return; t.ask(input); setInput(''); if (ref.current) ref.current.style.height = 'auto'; };
  const grow = e => { e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`; };
  useEffect(() => { if (autoFocus) ref.current?.focus({ preventScroll: true }); }, [autoFocus]);
  return <form className={`vh-box${t.privateMode ? ' is-private' : ''}${compact ? ' is-compact' : ''}`} onSubmit={submit} role="search" aria-label="Ask Vivid Engine">
    {t.privateMode && <p className="vh-privnote"><VenetianMask size={15} aria-hidden="true" />Private mode: this conversation won’t be saved, even on your plan.</p>}
    <label htmlFor={compact ? 'vh-follow' : 'vh-q'} className="sr-only">{compact ? 'Ask a follow-up' : 'Ask anything'}</label>
    <textarea id={compact ? 'vh-follow' : 'vh-q'} ref={ref} rows={compact ? 1 : 2} value={input} maxLength={4000} placeholder={placeholder}
      onChange={e => { setInput(e.target.value); grow(e); }}
      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e); }} />
    <div className="vh-tools">
      {!compact && <>
        <label className={`vh-pick${t.mode !== 'search' ? ' is-on' : ''}`}><Search size={15} aria-hidden="true" /><span className="sr-only">Mode</span>
          <select value={t.mode} onChange={e => t.setMode(e.target.value)}><option value="search">Search</option><option value="build">Build</option><option value="create">Create</option><option value="biz">Business</option></select>
        </label>
        <label className="vh-pick" title={MODEL_NOTE[t.model]}><Sparkles size={15} aria-hidden="true" /><span className="sr-only">AI model</span>
          <select value={t.model} onChange={e => t.setModel(e.target.value)}><option value="auto">Auto</option><option value="claude">Claude</option><option value="perplexity">Perplexity</option><option value="gemini">Gemini</option><option value="combined">Combined</option></select>
        </label>
      </>}
      <span className="vh-spacer" />
      {paid && !compact && <button type="button" className="vh-icon" aria-pressed={t.privateMode} aria-label="Private mode" title="Private mode: never saved" onClick={() => t.setPrivateMode(p => !p)}><VenetianMask size={18} /></button>}
      {speech && <button type="button" className="vh-icon" aria-pressed={speech.listening} aria-label={speech.listening ? 'Stop voice input' : 'Voice input'} onClick={speech.toggle}><Mic size={18} /></button>}
      {t.busy
        ? <button type="button" className="vh-send" onClick={t.stop} aria-label="Stop answering"><Square size={15} /></button>
        : <button type="submit" className="vh-send" disabled={!input.trim()} aria-label={t.mode === 'search' ? 'Search' : 'Send'}><ArrowUp size={19} /></button>}
    </div>
  </form>;
}

function Answer({ m, t, account, isLast, onCopy, showUnsaved }) {
  const paid = account.access?.allowed;
  const shareLink = paid && t.threadId && !t.privateMode ? `${window.location.origin}/ai-search?thread=${encodeURIComponent(t.threadId)}` : null;
  const share = async () => {
    const text = shareLink || `${m.question}\n\n${m.content}`;
    try { await navigator.clipboard.writeText(text); onCopy(shareLink ? 'Share link copied' : 'Answer copied. Saved links come with paid plans.'); } catch { onCopy('Select the answer text to copy it'); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(m.content); onCopy('Answer copied'); } catch { onCopy('Select the answer text to copy it'); } };
  const report = () => { api.analytics?.track?.({ eventName: 'answer_report', properties: { threadId: t.threadId || null } }); onCopy('Thanks. This answer was flagged for review.'); };
  const done = !m.status && (m.content || m.error);
  return <div className="ais-answer" aria-live={isLast ? 'polite' : undefined}>
    <Engines engines={m.engines} />
    {m.status && <div className="ais-status" role="status"><span className="ais-dot" aria-hidden="true" />{m.status}</div>}
    {SENSITIVE.test(m.question || '') && m.content && <p className="vh-advice"><Info size={16} aria-hidden="true" />This isn’t professional advice. Check with a qualified professional before acting on it.</p>}
    {m.content && <ReactMarkdown components={mdLinks}>{m.content}</ReactMarkdown>}
    {m.error && <div className="ais-error" role="alert">{m.error.message}{UPGRADE_CODES.has(m.error.code) && <> <Link to="/ai-search/pricing">See plans</Link></>}</div>}
    <Sources sources={m.sources} />
    {done && m.content && <>
      <p className="vh-why"><Sparkles size={14} aria-hidden="true" /><span><b>Why this engine?</b> {whyThisEngine(m)}</span></p>
      <div className="vh-acts">
        <button type="button" onClick={copy}><Copy size={15} aria-hidden="true" />Copy</button>
        <button type="button" onClick={share}><Share2 size={15} aria-hidden="true" />Share</button>
        {paid && !t.privateMode && t.threadId
          ? <Link to={`/ai-search?thread=${encodeURIComponent(t.threadId)}`}><Bookmark size={15} aria-hidden="true" />Saved</Link>
          : <Link to="/ai-search/pricing" title="Saved history comes with paid plans"><Bookmark size={15} aria-hidden="true" />Save</Link>}
        <button type="button" onClick={() => document.getElementById('vh-follow')?.focus()}><CornerDownRight size={15} aria-hidden="true" />Follow-up</button>
        <Link className="is-quiet" to={`/start?brief=${encodeURIComponent((m.question || '').slice(0, 300))}`}><Code size={15} aria-hidden="true" />Build from this</Link>
        <Link className="is-quiet" to="/video"><Clapperboard size={15} aria-hidden="true" />Make a video</Link>
        <a className="is-wa" href={whatsappUrl(`Hi Vivid Engine, I have a question about this answer: "${(m.question || '').slice(0, 200)}"`)} target="_blank" rel="noopener noreferrer">WhatsApp us</a>
        <button type="button" className="vh-report" onClick={report}><Flag size={14} aria-hidden="true" />Report</button>
      </div>
      {showUnsaved && <p className="vh-unsaved"><Lock size={14} aria-hidden="true" />This conversation won’t be saved. <Link to="/ai-search/pricing">Upgrade to keep your history</Link></p>}
    </>}
  </div>;
}

// Search-first home: big ask box when empty, the conversation in place once someone asks.
export default function HomeSearch({ t, account }) {
  const { isAuthenticated, access = {}, me, user } = account;
  const firstName = (user?.full_name || user?.name || '').trim().split(/\s+/)[0];
  const [ph, setPh] = useState(0);
  const [toast, setToast] = useState('');
  const [persona, setPersona] = useState(() => store.get('ve-persona') || 'general');
  const [welcomed, setWelcomed] = useState(() => !!store.get('ve-welcomed'));
  const [unsavedIndex, setUnsavedIndex] = useState(null);
  const bottomRef = useRef(null);
  const empty = t.messages.length === 0;
  const answers = t.messages.filter(m => m.role === 'assistant');
  const lastApplied = t.messages.reduce((acc, m, i) => (m.kind === 'build' && m.applied ? i : acc), -1);

  useEffect(() => {
    const id = setInterval(() => setPh(i => (i + 1) % ROTATE.length), 3200);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { if (!toast) return undefined; const id = setTimeout(() => setToast(''), 2800); return () => clearTimeout(id); }, [toast]);
  useEffect(() => { if (!empty) bottomRef.current?.scrollIntoView({ block: 'end' }); }, [t.messages.length, empty]);
  useEffect(() => { if (empty) setUnsavedIndex(null); }, [empty]);
  // Show the "won't be saved" note once per browser session, on the first finished answer.
  useEffect(() => {
    if (access.allowed || session.get('ve-unsaved-note')) return;
    const i = t.messages.findIndex(m => m.role === 'assistant' && m.content && !m.status);
    if (i >= 0) { session.set('ve-unsaved-note', '1'); setUnsavedIndex(i); }
  }, [t.messages, access.allowed, unsavedIndex]);

  const chips = t.mode === 'search' ? PERSONA_CHIPS[persona] || PERSONA_CHIPS.general : MODE_CHIPS[t.mode];
  const placeholder = t.mode === 'search' ? ROTATE[ph] : MODE_PLACEHOLDER[t.mode];
  const pickPersona = key => { if (key) { setPersona(key); store.set('ve-persona', key); setToast('Thanks. Your starter ideas are updated.'); } store.set('ve-welcomed', '1'); setWelcomed(true); };

  if (empty) return <section className="vh-hero" aria-labelledby="vh-title">
    <div className="vh-logo" aria-hidden="true"><img src="/logo-400.webp" alt="" width="120" height="120" /></div>
    {isAuthenticated
      ? <h1 id="vh-title" className="vh-h1">Hi{firstName ? ` ${firstName}` : ''}.<br /><span className="engine-blue">What do you want to know?</span></h1>
      : <><h1 id="vh-title" className="vh-h1">Vivid Engine: <span className="engine-blue">Ask Anything. Get <span className="vh-nb">Real Answers.</span></span> Then Build It.</h1>
          <p className="vh-sub">AI search powered by Perplexity, Claude and Gemini, plus websites, apps and video from the same place. Locally built in Greater Houston, SE Texas &amp; SW Louisiana.</p></>}
    <Composer t={t} account={account} placeholder={placeholder} />
    <div className="vh-chips" aria-label="Ideas to try">{chips.map(c => <button key={c} type="button" className="ais-chip" onClick={() => t.ask(c.replace(/…$/, ''))}>{c}</button>)}</div>
    <p className="vh-plan">
      {isAuthenticated && me?.tier ? <>
        <span className="ais-badge">{me.tier.name}</span>
        {me.usage && <span>{me.usage.today} of {me.usage.dailyLimit} today</span>}
        {access.allowed ? <span>History on</span> : <Link to="/ai-search/pricing">Save your history with a paid plan</Link>}
      </> : <span>Free account: 5 questions a day. <Link to="/ai-search/pricing">See plans</Link></span>}
    </p>
  </section>;

  return <section className="vh-thread" aria-label="Conversation">
    <div className="vh-thead">
      <button type="button" className="vh-back" onClick={t.reset}>← New search</button>
      {t.privateMode && <span className="vh-tag is-private"><VenetianMask size={14} aria-hidden="true" />Private, not saved</span>}
      {access.readOnly && <span className="vh-tag">Read-only history</span>}
    </div>
    {isAuthenticated && !welcomed && answers.some(m => m.content && !m.status) && <div className="vh-welcome" role="region" aria-label="Personalize">
      <b>What brings you here?</b>
      <p>Optional. It only tailors your starter ideas. Every feature stays open to you.</p>
      <div>{PERSONAS.map(([k, l]) => <button key={k} type="button" onClick={() => pickPersona(k)}>{l}</button>)}<button type="button" className="is-skip" onClick={() => pickPersona(null)}>Skip</button></div>
    </div>}
    {t.messages.map((m, i) => <div key={i} className="ais-msg">
      {m.role === 'user'
        ? (i === 0 ? <h1 className="vh-q">{m.content}</h1> : <h2 className="vh-q is-follow">{m.content}</h2>)
        : m.kind === 'build'
          ? <BuildCard m={m} pending={!!m.pending} canUndo={t.canUndo && m.applied && i === lastApplied} onApply={() => t.applyPending(i)} onDiscard={() => t.discardPending(i)} onUndo={t.undoBuild} />
          : m.kind === 'note'
            ? <p className="vb-note">{m.content}</p>
            : <Answer m={m} t={t} account={account} isLast={i === t.messages.length - 1} onCopy={setToast} showUnsaved={i === unsavedIndex} />}
    </div>)}
    <div ref={bottomRef} />
    <div className="vh-follow"><Composer t={t} account={account} compact placeholder={t.mode === 'build' ? 'Change the model, e.g. “make it 16 ft wide” or “joists at 12 in”…' : 'Ask a follow-up…'} autoFocus={false} /></div>
    {toast && <div className="vh-toast" role="status">{toast}</div>}
  </section>;
}
