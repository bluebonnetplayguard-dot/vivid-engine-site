import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { ArrowUp, Lock, Plus, Square, Trash2 } from 'lucide-react';
import { Engines, Sources, UPGRADE_CODES, mdLinks, answerEventHandler } from '@/components/aisearch/AnswerParts';
import { historyAccess, retentionLabel } from '@/config/plans';
import { api } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';
import EngineNav from '@/components/engine/EngineNav';
import '@/components/engine/engine.css';
import '@/components/aisearch/ai-search.css';

const SUGGESTIONS = [
  'Plan a 5-page website for a family bakery',
  'What should a plumber’s homepage include to get more calls?',
  'Compare Shopify and Square Online for a small store',
  'Write SEO titles and descriptions for an HVAC company',
];
export default function AiSearch() {
  const { isAuthenticated, authChecked } = useAuth();
  const [params, setParams] = useSearchParams();
  const [threads, setThreads] = useState([]);
  const [threadId, setThreadId] = useState(params.get('thread'));
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState(null);
  const abortRef = useRef(null);
  const autoAsked = useRef(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const access = historyAccess(me);
  const canSeeHistory = access.allowed || access.readOnly;
  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    const profile = await api.aiSearch.me().catch(() => null);
    setMe(profile);
    // Saved history is a paid-plan feature; the server enforces it too.
    const a = historyAccess(profile);
    if (a.allowed || a.readOnly) api.aiSearch.threads().then(setThreads).catch(() => {});
    else setThreads([]);
  }, [isAuthenticated]);
  useEffect(() => { refresh(); }, [refresh]);

  const openThread = useCallback(async id => {
    if (busy) return;
    setThreadId(id);
    setParams(id ? { thread: id } : {}, { replace: true });
    if (!id) { setMessages([]); return; }
    try {
      const t = await api.aiSearch.thread(id);
      setMessages(t.messages.map(m => ({ role: m.role, content: m.content, sources: m.sources, engines: m.contributors })));
    } catch { setMessages([]); setThreadId(null); }
  }, [busy, setParams]);

  // Open the conversation named in the URL once signed in.
  useEffect(() => {
    if (isAuthenticated && threadId && !messages.length && !busy) openThread(threadId);
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  const patchLast = fn => setMessages(list => list.map((m, i) => (i === list.length - 1 ? { ...m, ...fn(m) } : m)));

  const ask = useCallback(async raw => {
    const question = raw.trim();
    if (!question || busy) return;
    if (!isAuthenticated) { api.auth.redirectToLogin(`/ai-search?q=${encodeURIComponent(question.slice(0, 1500))}`); return; }
    setInput('');
    setBusy(true);
    setMessages(list => [...list, { role: 'user', content: question }, { role: 'assistant', content: '', status: 'Starting…', engines: [], sources: [] }]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await api.aiSearch.ask({
        question, threadId, signal: controller.signal,
        history: messages.filter(m => !m.error && !m.status && m.content).slice(-12).map(m => ({ role: m.role, content: m.content })),
        onEvent: answerEventHandler(patchLast, {
          onThread: id => { setThreadId(id); setParams({ thread: id }, { replace: true }); },
          onDone: data => setMe(prev => (prev ? { ...prev, usage: data.usage } : prev)),
        }),
      });
    } catch (e) {
      if (e?.name === 'AbortError') patchLast(m => ({ status: '', content: m.content || '_Stopped._' }));
      else patchLast(() => ({ status: '', error: { message: e?.message || 'Something went wrong.', code: e?.code } }));
    } finally {
      abortRef.current = null;
      setBusy(false);
      refresh();
      inputRef.current?.focus();
    }
  }, [busy, isAuthenticated, threadId, setParams, refresh, messages]);

  // A question passed in the link (from the homepage box or after signing in).
  useEffect(() => {
    const q = params.get('q');
    if (!authChecked || autoAsked.current || !q) return;
    autoAsked.current = true;
    setParams(threadId ? { thread: threadId } : {}, { replace: true });
    if (isAuthenticated) ask(q); else setInput(q);
  }, [authChecked, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeThread = async id => {
    if (!window.confirm('Delete this conversation?')) return;
    await api.aiSearch.deleteThread(id).catch(() => {});
    if (id === threadId) openThread(null);
    refresh();
  };

  const onKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(input); }
  };
  const grow = e => { e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`; };
  const usage = me?.usage;

  return <div className="engine-site">
    <PageMeta {...PAGE_META.aiSearch} />
    <EngineNav />
    <div className="ais-page">
      {isAuthenticated && <aside className="ais-side" aria-label="Your conversations">
        <button type="button" className="ais-new" onClick={() => openThread(null)} disabled={busy}><Plus size={16} aria-hidden="true" />New search</button>
        {me && !canSeeHistory && <div className="ais-locked">
          <b><Lock size={14} aria-hidden="true" />Save your conversations with any paid plan</b>
          <span>Free conversations work while open but aren’t kept after you leave.</span>
          <Link to="/ai-search/pricing">Upgrade</Link>
        </div>}
        {access.readOnly && <p className="ais-ro">Your plan ended. This history is read-only for 30 days. <Link to="/ai-search/pricing">Upgrade to restore it</Link>.</p>}
        {access.allowed && <p className="ais-ro">Saved {retentionLabel(access.retentionDays)}.</p>}
        {threads.length > 0 && <h2>Recent</h2>}
        {threads.map(t => <div key={t.id} className={`ais-thread${t.id === threadId ? ' is-active' : ''}`}>
          <button type="button" className="ais-thread-open" onClick={() => openThread(t.id)} title={t.title}>{t.title}</button>
          {!access.readOnly && <button type="button" className="ais-del" onClick={() => removeThread(t.id)} aria-label={`Delete ${t.title}`}><Trash2 size={14} /></button>}
        </div>)}
      </aside>}
      <main className="ais-main">
        <div className="ais-scroll">
          {!messages.length && <section className="ais-hero">
            <span className="engine-caps">Vivid AI Search</span>
            <h1>Ask anything. <span className="engine-blue">Build anything.</span></h1>
            <p>Research with live web search and sources, or plan your website: pages, copy, SEO and code. Paid plans add second opinions from other AI engines.</p>
            <div className="ais-chips">{SUGGESTIONS.map(s => <button key={s} type="button" className="ais-chip" onClick={() => ask(s)}>{s}</button>)}</div>
            <div className="ais-plan">
              {isAuthenticated && me ? <>
                <span className="ais-badge">{me.tier.name} · {me.tier.modelLabel}</span>
                {usage && <span>{usage.today} of {usage.dailyLimit} today · {usage.month} of {usage.monthlyLimit} this month</span>}
                <Link to="/ai-search/account">Your plan</Link>
              </> : authChecked && <span>Free account: 5 questions a day. <Link to="/login?returnTo=%2Fai-search">Sign in</Link> or <Link to="/register">create an account</Link>.</span>}
              <Link to="/ai-search/pricing">Plans &amp; pricing</Link>
            </div>
          </section>}
          {messages.map((m, i) => <div key={i} className="ais-msg">
            {m.role === 'user' ? <div className="ais-user">{m.content}</div> : <div className="ais-answer" aria-live={i === messages.length - 1 ? 'polite' : undefined}>
              <Engines engines={m.engines} />
              {m.status && <div className="ais-status" role="status"><span className="ais-dot" aria-hidden="true" />{m.status}</div>}
              {m.content && <ReactMarkdown components={mdLinks}>{m.content}</ReactMarkdown>}
              {m.error && <div className="ais-error" role="alert">{m.error.message}{UPGRADE_CODES.has(m.error.code) && <> <Link to="/ai-search/pricing">See plans</Link></>}</div>}
              <Sources sources={m.sources} />
            </div>}
          </div>)}
          <div ref={bottomRef} />
        </div>
        <form className="ais-composer" onSubmit={e => { e.preventDefault(); ask(input); }}>
          <div className="ais-box">
            <label htmlFor="ais-q" className="sr-only">Ask Vivid AI Search</label>
            <textarea id="ais-q" ref={inputRef} rows={1} value={input} maxLength={4000} disabled={access.readOnly && !!threadId} placeholder={access.readOnly && threadId ? 'Read-only. Upgrade to keep this conversation going.' : messages.length ? 'Ask a follow-up…' : 'Ask anything…'}
              onChange={e => { setInput(e.target.value); grow(e); }} onKeyDown={onKeyDown} />
            {busy
              ? <button type="button" className="ais-send ais-stop" onClick={() => abortRef.current?.abort()} aria-label="Stop answering"><Square size={16} /></button>
              : <button type="submit" className="ais-send" disabled={!input.trim()} aria-label="Ask"><ArrowUp size={20} /></button>}
          </div>
          <p className="ais-note">AI answers can be wrong. Check the sources for anything important.</p>
        </form>
      </main>
    </div>
  </div>;
}
