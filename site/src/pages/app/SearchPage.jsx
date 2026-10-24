import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import SEO from '@/components/seo/SEO';
import HomeSearch from '@/components/home/HomeSearch';
import useAskThread from '@/components/home/useAskThread';
import { usePageShell } from '@/components/shell/ShellContext';

// /search: the answer page. Same experience as the home page, plus opening a saved conversation by link
// (/search?thread=<id>). Answer pages stay out of search engines.
export default function SearchPage() {
  const shell = usePageShell(null);
  const account = shell?.account;
  const t = useAskThread(account);
  const [params] = useSearchParams();
  const opened = useRef(null);
  const thread = params.get('thread');
  useEffect(() => {
    if (!thread || opened.current === thread || !account?.authChecked) return;
    opened.current = thread;
    t.openThread(thread);
  }, [thread, account?.authChecked]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastQuestion = [...t.messages].reverse().find(m => m.role === 'user')?.content;
  usePageShell({
    activeThreadId: t.threadId, onOpenThread: t.openThread, onNewSearch: t.reset,
    whatsappMessage: lastQuestion ? `Hi Vivid Engine, I have a question about this answer: "${lastQuestion.slice(0, 200)}"` : undefined,
  });
  return <main className="vh-stage">
    <SEO path="/search" title="Vivid AI Search" description="Ask anything and get answers with numbered sources from Perplexity, Claude and Gemini." noindex />
    <HomeSearch t={t} account={account} />
  </main>;
}
