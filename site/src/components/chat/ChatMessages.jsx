import { Loader2 } from 'lucide-react';
import { GREETING, QUICK_ACTIONS } from '@/components/chat/chatStorage';
import ChatMessage from '@/components/chat/ChatMessage';

export default function ChatMessages({ mode, messages, busy, captured, error, send, scrollRef, isAdmin }) {
  return <div id="ve-chat-panel" ref={scrollRef} role={isAdmin ? 'tabpanel' : undefined} aria-labelledby={isAdmin ? `ve-tab-${mode}` : undefined} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-muted px-4 py-4" aria-live="polite" aria-relevant="additions text" aria-busy={busy}>
    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-background px-3.5 py-2.5 text-sm text-foreground shadow-xs">{GREETING[mode]}</div>
    {!messages.length && <div className="flex flex-wrap gap-2 pt-1">{QUICK_ACTIONS[mode].map(q => <button key={q} type="button" disabled={busy} onClick={() => send(q)} className="min-h-11 rounded-full border border-primary/30 bg-background px-3 py-1.5 text-left text-xs text-foreground hover:bg-primary/10 disabled:opacity-50">{q}</button>)}</div>}
    {messages.map((message, index) => <ChatMessage key={index} message={message} mode={mode} />)}
    {busy && <div className="flex w-fit items-center gap-2 rounded-2xl bg-background px-4 py-3 text-primary shadow-xs" role="status"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-xs text-muted-foreground">{mode === 'admin' ? 'Writing… longer pieces can take a minute' : 'Assistant is typing…'}</span></div>}
    {captured && mode === 'visitor' && <p className="rounded-xl border border-primary/30 p-3 text-xs text-foreground">Your request has been recorded for the team. They will follow up to arrange the details.</p>}
    {error && <p className="text-center text-xs text-destructive" role="alert">{error}</p>}
  </div>;
}