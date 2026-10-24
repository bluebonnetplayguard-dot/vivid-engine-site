import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import { answerEventHandler } from '@/components/aisearch/AnswerParts';
import { SAFE_KEY } from '@/components/shell/AppShell';
import { useLang } from '@/lib/lang';
import { useNotify } from '@/components/shell/Notifications';

const readSafe = () => { try { return localStorage.getItem(SAFE_KEY) || 'standard'; } catch { return 'standard'; } };
// Search requests that are really asking for a design go to Build Studio.
const HAS_SIZE = /\d+\s*(?:'|ft|feet|in|")?\s*(?:x|×|by)\s*\d+/i;
const BUILD_WORDS = /\b(design|draw|drafting|blueprints?|framing|build me)\b[^.?!]{0,60}\b(decks?|pergolas?|sheds?|fences?|carports?|trusse?s?|swing sets?)\b/i;
// Needs a build word AND a size, so ordinary questions ("design ideas for walls") stay in Search.
export const BUILD_INTENT = { test: q => BUILD_WORDS.test(q) && HAS_SIZE.test(q) };

// One AI Search conversation on the home page: ask, stream, follow up, reset, reopen a saved thread.
export default function useAskThread(account) {
  const { isAuthenticated, authChecked, access, refresh, setMe } = account;
  const [params, setParams] = useSearchParams();
  const [messages, setMessages] = useState([]);
  const [threadId, setThreadId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [privateMode, setPrivateMode] = useState(false);
  const [mode, setMode] = useState('search');
  const [model, setModel] = useState('auto');
  const [depth, setDepth] = useState('quick');
  const [focus, setFocus] = useState('');
  const [attachments, setAttachments] = useState([]);
  const { lang } = useLang();
  const { notify } = useNotify();
  const abortRef = useRef(null);
  const autoAsked = useRef(false);
  // Build Studio: the applied model, earlier versions for undo. Changes wait for approval before they apply.
  const [buildSpec, setBuildSpec] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const buildGen = useRef(0);   // bumped on reset so a late reply can't revive an old model

  const patchLast = fn => setMessages(list => list.map((m, i) => (i === list.length - 1 ? { ...m, ...fn(m) } : m)));

  const patchAt = (index, fn) => setMessages(list => list.map((m, i) => (i === index ? { ...m, ...fn(m) } : m)));

  // Stack Advisor: one evidence-based answer per question (no streaming, no edits to apply).
  const askStack = useCallback(async question => {
    setBusy(true);
    const gen = buildGen.current;
    const idx = messages.length + 1;
    const patch = fn => { if (gen === buildGen.current) patchAt(idx, fn); };
    setMessages(list => [...list, { role: 'user', content: question }, { role: 'assistant', kind: 'stack', status: 'Checking the evidence…', question }]);
    try {
      const result = await api.stackAdvisor.ask({ message: question });
      patch(() => ({ status: '', result }));
    } catch (e) {
      patch(() => ({ status: '', error: { message: e?.status === 404 ? 'Stack Advisor isn’t switched on for this site yet.' : (e?.message || 'Something went wrong.'), code: e?.code } }));
    } finally {
      if (gen === buildGen.current) setBusy(false);
    }
  }, [messages]);

  const askBuild = useCallback(async question => {
    setBusy(true);
    const gen = buildGen.current;
    const idx = messages.length + 1;   // the assistant card appended below
    const patch = fn => { if (gen === buildGen.current) patchAt(idx, fn); };
    setMessages(list => [...list, { role: 'user', content: question }, { role: 'assistant', kind: 'build', status: buildSpec ? 'Working out the changes…' : 'Planning the model…', question }]);
    try {
      const history = messages.filter(m => m.role === 'user').slice(-4).map(m => ({ role: 'user', content: m.content }));
      const result = await api.buildStudio.turn({ message: question, spec: buildSpec, history });
      if (gen !== buildGen.current) return;
      if (!result?.viewer) { patch(() => ({ status: '', result })); return; }
      if (!buildSpec) { setBuildSpec(result.spec); patch(() => ({ status: '', result, applied: true })); }
      else patch(() => ({ status: '', result, pending: true }));
    } catch (e) {
      patch(() => ({ status: '', error: { message: e?.status === 404 ? 'Build Studio isn’t switched on for this site yet.' : (e?.message || 'Something went wrong.'), code: e?.code } }));
    } finally {
      if (gen === buildGen.current) setBusy(false);
    }
  }, [buildSpec, messages]);

  const applyPending = useCallback(index => {
    const m = messages[index];
    if (!m?.pending || busy) return;
    setUndoStack(stack => [...stack, buildSpec]);
    setBuildSpec(m.result.spec);
    setMessages(list => list.map((x, i) => (i === index ? { ...x, pending: false, applied: true } : x.pending ? { ...x, pending: false, discarded: true } : x)));
  }, [messages, buildSpec, busy]);

  const discardPending = useCallback(index => { if (!busy) patchAt(index, () => ({ pending: false, discarded: true })); }, [busy]);

  const undoBuild = useCallback(() => {
    if (!undoStack.length || busy) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(stack => stack.slice(0, -1));
    setBuildSpec(prev);
    setMessages(list => {
      let last = -1;
      list.forEach((m, i) => { if (m.kind === 'build' && m.applied) last = i; });
      const next = list.map((m, i) => (i === last ? { ...m, applied: false, undone: true } : m));
      return [...next, { role: 'assistant', kind: 'note', content: 'Undone. The model is back to the previous version.' }];
    });
  }, [undoStack, busy]);

  const ask = useCallback(async raw => {
    const question = raw.trim().slice(0, 4000);
    if (!question || busy) return;
    if (mode === 'stack') { await askStack(question); return; }
    // Designs with a size ("a 12x16 deck") go to Build Studio; everything else goes to the AI router.
    if ((mode === 'build' || mode === 'search') && BUILD_INTENT.test(question)) { await askBuild(question); return; }
    setBusy(true);
    const files = attachments;
    setAttachments([]);
    setMessages(list => [...list, { role: 'user', content: question, files: files.map(f => f.name) }, { role: 'assistant', content: '', status: 'Starting…', sources: [], question }]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await api.aiSearch.ask({
        question, threadId, signal: controller.signal,
        mode: mode === 'biz' ? 'business' : mode, engine: model, depth, focus: focus || undefined,
        attachments: isAuthenticated ? files.map(({ mime, data, name }) => ({ mime, data, name })) : undefined,
        private: privateMode, safeResults: readSafe(), lang,
        // Unsaved conversations carry their own context; saved ones are read from the server by threadId.
        history: messages.filter(m => !m.kind && !m.error && !m.status && m.content).slice(-12).map(m => ({ role: m.role, content: m.content })),
        onEvent: answerEventHandler(patchLast, {
          onThread: id => setThreadId(id),
          onDone: data => setMe?.(prev => (prev ? { ...prev, usage: data.usage?.guest ? prev.usage : data.usage, allowance: data.allowance ?? prev.allowance } : prev)),
          onUsageWarning: w => notify({ key: `usage-${w.level}`, title: w.message, link: '/pricing/search', level: w.level === 'limit100' ? 'critical' : 'warn' }),
        }),
      });
    } catch (e) {
      if (e?.name === 'AbortError') patchLast(m => ({ status: '', content: m.content || '_Stopped._' }));
      else patchLast(() => ({ status: '', error: { message: e?.message || 'Something went wrong.', code: e?.code } }));
    } finally {
      abortRef.current = null;
      setBusy(false);
      if (access?.allowed && !privateMode) refresh?.();
    }
  }, [busy, isAuthenticated, threadId, mode, model, depth, focus, attachments, lang, privateMode, access?.allowed, refresh, setMe, askBuild, askStack, messages, notify]);

  const stop = () => abortRef.current?.abort();

  const reset = useCallback(() => {
    if (busy) abortRef.current?.abort();
    buildGen.current += 1;
    setMessages([]); setThreadId(null); setBuildSpec(null); setUndoStack([]); setBusy(false);
  }, [busy]);

  const openThread = useCallback(async id => {
    if (busy || !id) return;
    try {
      const t = await api.aiSearch.thread(id);
      setThreadId(id);
      setMessages(t.messages.flatMap((m, i, all) => (m.role === 'user'
        ? [{ role: 'user', content: m.content }]
        : [{ role: 'assistant', content: m.content, sources: m.sources, meta: m.engine ? { provider: m.engine, engine: m.engine } : undefined, question: all[i - 1]?.content || '' }])));
      window.scrollTo({ top: 0 });
    } catch { /* thread gone or not allowed */ }
  }, [busy]);

  // A question in the link (/?aiq=... or /search?q=...), for example back from sign-in.
  useEffect(() => {
    const q = params.get('aiq') || params.get('q');
    if (!authChecked || autoAsked.current || !q) return;
    autoAsked.current = true;
    params.delete('aiq'); params.delete('q'); setParams(params, { replace: true });
    ask(q);
  }, [authChecked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Free and guest conversations aren't saved: warn before the tab closes with one open.
  useEffect(() => {
    const unsaved = messages.length > 0 && (!access?.allowed || privateMode);
    if (!unsaved) return undefined;
    const warn = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [messages.length, access?.allowed, privateMode]);

  return { messages, threadId, busy, ask, stop, reset, openThread, privateMode, setPrivateMode, mode, setMode, model, setModel,
    depth, setDepth, focus, setFocus, attachments, setAttachments,
    buildSpec, canUndo: undoStack.length > 0, applyPending, discardPending, undoBuild };
}
