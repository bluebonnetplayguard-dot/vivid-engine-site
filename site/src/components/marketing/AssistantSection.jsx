import { Bot, MessageSquare, UserRound } from 'lucide-react';
import { ADD_ONS, formatUsd } from '@/config/pricing';
export default function AssistantSection() {
  const option = ADD_ONS.find(item => item.id === 'ai-chat');
  return <section id="assistant" className="scroll-mt-24 px-4 py-16">
    <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2">
      <div><span className="mono">AI Assistant</span><h2 className="mt-3 font-heading text-3xl text-foreground">Helpful answers. A local team behind them.</h2><p className="mt-4 leading-relaxed text-muted-foreground">Ask Vivid about our websites, apps, POS, CRM and plans using the chat button. When you need a person, leave your details for a team follow-up.</p><a href="/quote" className="mk-btn mt-6">Discuss an AI assistant for my business</a></div>
      <div className="rounded-2xl border border-border bg-card p-7">
        <Bot className="mb-5 h-10 w-10 text-primary" aria-hidden="true" /><h3 className="font-heading text-xl">AI chat, tailored to your business</h3>
        <ul className="mt-5 space-y-4 text-sm text-muted-foreground"><li className="flex gap-3"><MessageSquare className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />Help visitors find answers about your services.</li><li className="flex gap-3"><UserRound className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />Capture contact details for human follow-up.</li></ul>
        <p className="mt-6 border-t border-border pt-5 text-sm text-muted-foreground">Included with Turnkey Care, or available as an optional {formatUsd(option.price)}/month add-on.</p>
      </div>
    </div>
  </section>;
}