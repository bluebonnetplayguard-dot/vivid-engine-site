import { Link } from 'react-router-dom';
import { RotateCcw, X } from 'lucide-react';
import { Image } from '@/components/ui/image';


export default function ChatHeader({ mode, isAdmin, setMode, hasMessages, busy, reset, close }) {
  return <>
    <div className="flex items-center gap-3 bg-foreground px-4 py-3 text-background">
      <Image src="/logo-160.webp" alt="Vivid Engine Solutions logo" className="h-9 w-9 shrink-0 rounded-full" fittingType="fit" />
      <div className="min-w-0 flex-1 leading-tight"><p id="ve-chat-title" className="font-semibold">Vivid Engine Solutions</p><p className="text-xs text-primary">{mode === 'admin' ? 'Marketing agent' : 'Usually replies instantly'}</p></div>
      {hasMessages && <button type="button" onClick={reset} disabled={busy} className="flex min-h-11 min-w-11 items-center justify-center rounded hover:bg-background/10 disabled:opacity-40" aria-label="Start a new conversation"><RotateCcw size={18} /></button>}
      <button type="button" onClick={close} className="flex min-h-11 min-w-11 items-center justify-center rounded hover:bg-background/10" aria-label="Close chat"><X size={20} /></button>
    </div>
    {isAdmin && <>
      <div className="flex border-b border-border text-sm" role="tablist" aria-label="Chat mode">
        {['visitor', 'admin'].map(m => <button key={m} type="button" role="tab" id={`ve-tab-${m}`} aria-controls="ve-chat-panel" aria-selected={mode === m} disabled={busy} onClick={() => setMode(m)} className={`min-h-11 flex-1 py-2 font-medium disabled:opacity-50 ${mode === m ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{m === 'visitor' ? 'Visitor view' : 'Marketing'}</button>)}
      </div>
      {mode === 'admin' && <Link className="border-b border-border px-4 py-2 text-xs text-primary underline" to="/admin/marketing-drafts">Open Marketing Drafts · nothing is sent or published automatically</Link>}
    </>}
  </>;
}