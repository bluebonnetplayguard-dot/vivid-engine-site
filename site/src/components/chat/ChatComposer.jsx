import { Send } from 'lucide-react';

export default function ChatComposer({ mode, input, setInput, busy, inputRef, send }) {
  return <form onSubmit={e => { e.preventDefault(); send(); }} className="flex items-end gap-2 border-t border-border bg-background p-3 safe-bottom">
    <label htmlFor="ve-chat-input" className="sr-only">Type your message</label>
    <textarea id="ve-chat-input" ref={inputRef} rows={1} value={input} maxLength={mode === 'admin' ? 4000 : 1000} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} placeholder={mode === 'admin' ? 'e.g. 3 Facebook posts about website maintenance' : 'Type your message…'} className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-hidden focus:ring-2 focus:ring-primary/20" />
    <button type="submit" disabled={busy || !input.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground disabled:opacity-40" aria-label="Send message"><Send size={18} /></button>
  </form>;
}