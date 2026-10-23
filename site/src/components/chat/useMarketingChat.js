import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { loadChat, saveChat } from '@/components/chat/chatStorage';
import invokePublicFunction from '@/lib/invokePublicFunction';

export default function useMarketingChat({ userId, isAdmin }) {
  const key = `ve-chat-v1:${userId || 'visitor'}`;
  const [initial] = useState(() => loadChat(key, isAdmin));
  const [open, setOpen] = useState(false);
  const [mode, updateMode] = useState(initial.mode);
  const [threads, setThreads] = useState(initial.threads);
  const [sessionId, setSessionId] = useState(initial.sessionId);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [captured, setCaptured] = useState(false);
  const busyRef = useRef(false), inputRef = useRef(null), scrollRef = useRef(null), triggerRef = useRef(null);
  const queryClient = useQueryClient();
  const messages = threads[mode];
  useEffect(() => saveChat(key, { mode, threads, sessionId }), [key, mode, threads, sessionId]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, busy, open]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open, mode]);
  const close = () => { setOpen(false); setTimeout(() => triggerRef.current?.focus(), 0); };
  const setMode = next => { if (!busyRef.current && (next === 'visitor' || isAdmin)) { updateMode(next); setInput(''); setError(''); } };
  const reset = () => { if (!busyRef.current) { setThreads(t => ({ ...t, [mode]: [] })); setError(''); setCaptured(false); setInput(''); if (mode === 'visitor') setSessionId(crypto.randomUUID()); } };
  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || busyRef.current || (mode === 'admin' && !isAdmin)) return;
    if (content.length > (mode === 'admin' ? 4000 : 1000)) { setError('Please shorten your message.'); return; }
    const activeMode = mode, next = [...messages, { role: 'user', content }].slice(-49);
    busyRef.current = true; setBusy(true); setError(''); setInput('');
    setThreads(t => ({ ...t, [activeMode]: next }));
    try {
      const result = activeMode === 'admin'
        ? await api.functions.invoke('marketingAgent', { mode: 'admin', messages: next.slice(-12).map(m => ({ role: m.role, content: m.content.slice(0, 4000) })) })
        : await invokePublicFunction('chatAssistant', { sessionId, message: content });
      const data = result.data;
      if (data?.error || typeof data?.reply !== 'string') throw new Error(data?.error || 'The assistant returned an empty response. Please try again.');
      setThreads(t => ({ ...t, [activeMode]: [...next, { role: 'assistant', content: data.reply, drafts: data.savedDrafts || 0 }] }));
      if (data.escalated) setCaptured(true);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Something went wrong. Please try again.');
      setThreads(t => ({ ...t, [activeMode]: next.slice(0, -1) }));
      setInput(content);
    } finally {
      if (activeMode === 'admin') queryClient.invalidateQueries({ queryKey: ['marketing-drafts'] });
      busyRef.current = false; setBusy(false);
    }
  }
  return { open, setOpen, mode, setMode, messages, busy, error, captured, input, setInput, inputRef, scrollRef, triggerRef, send, reset, close };
}