import { createContext, useContext, useEffect } from 'react';

// Lets a page inside the shared shell tell the shell about itself (the WhatsApp message for this page, what
// "New search" should do, which saved conversation is open) without rendering its own frame.
export const ShellContext = createContext(null);

export const useInShell = () => !!useContext(ShellContext);

export function usePageShell(options) {
  const ctx = useContext(ShellContext);
  const deps = options ? [options.whatsappMessage, options.activeThreadId, options.onNewSearch, options.onOpenThread, options.hideBreadcrumbs] : [];
  useEffect(() => {
    if (!ctx || !options) return undefined;
    ctx.setPage(options);
    return () => ctx.setPage(null);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return ctx;
}
