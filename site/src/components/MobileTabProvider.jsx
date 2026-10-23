import { createContext, useContext, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

const MobileTabs = createContext(null);
const roots = ['/portal', '/admin/chat', '/admin/pos', '/settings'];
const tabFor = pathname => roots.find(root => pathname === root || pathname.startsWith(root + '/'));

export default function MobileTabProvider({ children }) {
  const location = useLocation(), navigate = useNavigate(), action = useNavigationType();
  const { user } = useAuth();
  // Memory only: do not persist private URLs or router state across accounts.
  const memory = useRef({ userId: user?.id, tabs: {}, keys: {} });
  useLayoutEffect(() => {
    if (memory.current.userId !== user?.id) memory.current = { userId: user?.id, tabs: {}, keys: {} };
    const { tabs, keys } = memory.current;
    const index = window.history.state?.idx;
    if (action === 'PUSH') Object.keys(keys).forEach(key => { if (Number(key) >= index) delete keys[key]; });
    if (typeof index === 'number') keys[index] = location.key;
    const tab = tabFor(location.pathname);
    if (tab) tabs[tab] = { location, index };
  }, [location, action, user?.id]);
  const select = (event, root) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (tabFor(location.pathname) === root) {
      delete memory.current.tabs[root];
      navigate(root, { replace: true, state: null });
      return;
    }
    const saved = memory.current.tabs[root], index = window.history.state?.idx;
    // Traverse real history when possible, preserving nested stacks and location state.
    if (saved && typeof index === 'number' && typeof saved.index === 'number' && saved.index !== index && memory.current.keys[saved.index] === saved.location.key) {
      navigate(saved.index - index);
    } else if (saved) {
      const { pathname, search, hash, state } = saved.location;
      navigate({ pathname, search, hash }, { state });
    } else navigate(root);
  };
  return <MobileTabs.Provider value={select}>{children}</MobileTabs.Provider>;
}

export function useMobileTabNavigation() {
  return useContext(MobileTabs);
}