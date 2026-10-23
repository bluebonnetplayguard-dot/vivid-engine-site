import { useLocation, useOutlet } from 'react-router-dom';
import PageTransition from '@/components/transitions/PageTransition';
import NavigationMotionProvider from '@/components/transitions/NavigationMotionProvider';
import MarketingChatWidget from '@/components/MarketingChatWidget';

export default function Layout() {
  const { pathname } = useLocation();
  const outlet = useOutlet();
  const hasPrivateShell = pathname === '/settings' || /^\/(portal|admin)(\/|$)/.test(pathname);
  // AI Search has its own assistant and a bottom search box the chat bubble would cover.
  const isAiSearch = /^\/ai-search(\/|$)/.test(pathname);
  // The video editor fills the screen; the chat bubble would cover its controls.
  const isEditor = pathname.startsWith('/video/edit/');
  return <NavigationMotionProvider>{hasPrivateShell || isEditor ? outlet : <PageTransition>{outlet}</PageTransition>}{!isAiSearch && !isEditor && <MarketingChatWidget />}</NavigationMotionProvider>;
}