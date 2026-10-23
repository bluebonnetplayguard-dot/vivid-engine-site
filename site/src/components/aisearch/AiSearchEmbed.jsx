import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { ArrowUp, ArrowUpRight, Plus, Square } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { Engines, Sources, UPGRADE_CODES, applyEvent, mdLinks } from '@/components/aisearch/AnswerParts';
import '@/components/aisearch/ai-search.css';

const SUGGESTIONS = [
  'What should my landscaping website include?',
  'Plan a 5-page website for a family bakery',
  'Write SEO titles for an HVAC company in Beaumont',
  'Compare Shopify and Square Online for a small store',
];

// Vivid AI Search on the homepage: the whole conversation happens right here.
// Visitors who aren't signed in are sent to sign in and come straight back with their
// question asked (/?aiq=...#ai-search). "Open in AI Search" continues the same thread
// on the full page with history.
export default function AiSearchEmbed() {
  const { isAuthenticated, authChecked } = useAuth();
  const [params, setParams] = useSearchParams();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [threadId, setThreadId] = useState(null);
  const [me, setMe] = useState(null);
  const abortRef = useRef(null);
  const autoAsked = useRef(false);
  const inputRef = useRef(null);
  const threadRef = useRef(null);

  useEffect(() => {
    if (isAuthenticated) api.aiSearch.me().then(setMe).catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const patchLast = fn => setMessages(list => list.map((m, i) => (i === list.length - 1 ? { ...m, ...fn(m) } : m)));

  const ask = useCallback(async raw => {
    const question = raw.trim();
    if (!question || busy) return;
    if (!isAuthenticated) { api.auth.redirectToLogin(`/?aiq=${encodeURIComponent(question.slice(0, 1500))}#ai-search`); return; }
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setBusy(true);
    setMessages(list => [...list, { role: 'user', content: question }, { role: 'assistant', content: '', status: 'Starting…', engines: [], sources: [] }]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await api.aiSearch.ask({
        question, threadId, signal: controller.signal,
        onEvent: (type, data) => {
          if (type === 'thread') { setThreadId(data.id); return; }
          if (type === 'done') setMe(prev => (prev ? { ...prev, usage: data.usage } : prev));
          patchLast(m => applyEvent(type, data, m));
        },
      });
    } catch (e) {
      if (e?.name === 'AbortError') patchLast(m => ({ status: '', content: m.content || '_Stopped._' }));
      else patchLast(() => ({ status: '', error: { message: e?.message || 'Something went wrong.', code: e?.code } }));
    } finally {
      abortRef.current = null;
      setBusy(false);
      api.analytics.track({ eventName: 'home_ai_search_asked' });
    }
  }, [busy, isAuthenticated, threadId]);

  // Question carried back from sign-in (/?aiq=...).
  useEffect(() => {
    const q = params.get('aiq');
    if (!authChecked || autoAsked.current || !q) return;
    autoAsked.current = true;
    const next = new URLSearchParams(params); next.delete('aiq');
    setParams(next, { replace: true });
    if (isAuthenticated) { document.getElementById('ai-search')?.scrollIntoView({ block: 'start' }); ask(q); } else setInput(q);
  }, [authChecked, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => { if (busy) abortRef.current?.abort(); setMessages([]); setThreadId(null); setInput(''); inputRef.current?.focus(); };
  const onKeyDown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(input); } };
  const grow = e => { e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`; };
  const usage = me?.usage;
  const started = messages.length > 0;

  return <section id="ai-search" className="engine-section"><div className={`engine-wrap ais-promo ais-embed${started ? ' is-active' : ''}`}>
    <div className="ais-embed-intro">
      <span className="engine-caps">Vivid AI Search</span>
      <h2>Research anything. <span className="engine-blue">Plan your website.</span></h2>
      <p>Ask a question and get an answer from live web search, with sources. Plan pages, write copy and SEO, or get working code. Paid plans add second opinions from other AI engines.</p>
      {!started && <div className="ais-chips ais-embed-chips">{SUGGESTIONS.map(s => <button key={s} type="button" className="ais-chip" onClick={() => ask(s)}>{s}</button>)}</div>}
    </div>

    <div className="ais-embed-panel">
      {started && <div className="ais-embed-thread" ref={threadRef} aria-live="polite">
        {messages.map((m, i) => <div key={i} className="ais-msg">
          {m.role === 'user' ? <div className="ais-user">{m.content}</div> : <div className="ais-answer">
            <Engines engines={m.engines} />
            {m.status && <div className="ais-status" role="status"><span className="ais-dot" aria-hidden="true" />{m.status}</div>}
            {m.content && <ReactMarkdown components={mdLinks}>{m.content}</ReactMarkdown>}
            {m.error && <div className="ais-error" role="alert">{m.error.message}{UPGRADE_CODES.has(m.error.code) && <> <Link to="/ai-search/pricing">See plans</Link></>}</div>}
            <Sources sources={m.sources} />
          </div>}
        </div>)}
      </div>}

      <form className="ais-embed-form" onSubmit={e => { e.preventDefault(); ask(input); }} role="search" aria-label="Ask Vivid AI Search">
        <div className="ais-box">
          <label htmlFor="home-ais" className="sr-only">Ask Vivid AI Search</label>
          <textarea id="home-ais" ref={inputRef} rows={1} value={input} maxLength={4000}
            placeholder={started ? 'Ask a follow-up…' : 'Ask anything, or describe the website you want…'}
            onChange={e => { setInput(e.target.value); grow(e); }} onKeyDown={onKeyDown} />
          {busy
            ? <button type="button" className="ais-send ais-stop" onClick={() => abortRef.current?.abort()} aria-label="Stop answering"><Square size={16} /></button>
            : <button type="submit" className="ais-send" disabled={!input.trim()} aria-label="Ask"><ArrowUp size={20} /></button>}
        </div>
      </form>

      <div className="ais-embed-foot">
        {started
          ? <>
            <button type="button" className="ais-chip" onClick={reset}><Plus size={14} aria-hidden="true" /> New search</button>
            {threadId && <Link className="ais-chip" to={`/ai-search?thread=${encodeURIComponent(threadId)}`}>Open in AI Search <ArrowUpRight size={14} aria-hidden="true" /></Link>}
            <small>AI answers can be wrong. Check the sources for anything important.</small>
          </>
          : isAuthenticated && me
            ? <small>{me.tier.name} plan{usage && <> · {usage.today} of {usage.dailyLimit} questions today</>} · <Link to="/ai-search/account">Your plan</Link> · <Link to="/ai-search/pricing">Upgrade</Link></small>
            : <small>Free account: 5 questions a day. <Link to="/ai-search/pricing">See plans</Link></small>}
      </div>
    </div>
  </div></section>;
}
