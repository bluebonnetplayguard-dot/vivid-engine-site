import { MessageCircle } from 'lucide-react';
import useMarketingChat from '@/components/chat/useMarketingChat';
import ChatHeader from '@/components/chat/ChatHeader';
import ChatMessages from '@/components/chat/ChatMessages';
import ChatComposer from '@/components/chat/ChatComposer';

export default function ChatWindow({ userId, isAdmin, portal }) {
  const chat = useMarketingChat({ userId, isAdmin });
  return <div className="marketing-chat font-body text-foreground">
    {!chat.open && <button ref={chat.triggerRef} type="button" onClick={() => chat.setOpen(true)} className={`fixed right-5 z-60 flex h-14 w-14 items-center justify-center rounded-full bg-linear-to-br from-primary to-accent text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-ring/40 ${portal ? 'bottom-[calc(5.25rem+env(safe-area-inset-bottom))] md:bottom-5' : 'bottom-[calc(1.25rem+env(safe-area-inset-bottom))]'}`} aria-label="Open chat" aria-haspopup="dialog"><MessageCircle size={26} /></button>}
    {chat.open && <div role="dialog" aria-labelledby="ve-chat-title" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); chat.close(); } }} className={`fixed inset-x-3 bottom-3 top-[max(1rem,env(safe-area-inset-top))] z-60 flex flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl sm:inset-auto sm:bottom-5 sm:right-5 sm:top-auto ${chat.mode === 'admin' ? 'sm:h-[min(720px,85vh)] sm:w-[560px]' : 'sm:h-[min(600px,80vh)] sm:w-[380px]'}`}>
      <ChatHeader mode={chat.mode} isAdmin={isAdmin} setMode={chat.setMode} hasMessages={!!chat.messages.length} busy={chat.busy} reset={chat.reset} close={chat.close} />
      <ChatMessages mode={chat.mode} messages={chat.messages} busy={chat.busy} captured={chat.captured} error={chat.error} send={chat.send} scrollRef={chat.scrollRef} isAdmin={isAdmin} />
      <ChatComposer mode={chat.mode} input={chat.input} setInput={chat.setInput} busy={chat.busy} inputRef={chat.inputRef} send={chat.send} />
    </div>}
  </div>;
}