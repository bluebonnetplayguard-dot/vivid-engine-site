import { createContext, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { TAB_ROOT_PATHS, tabRootFor } from '@/components/navigation/navConfig';

const NavigationMotion = createContext({ mode: 'fade', animateEntry: false });

export default function NavigationMotionProvider({ children }) {
  const location = useLocation(), navType = useNavigationType();
  const reduce = useReducedMotion();
  const previous = useRef(location.pathname), initialKey = useRef(location.key);
  // This provider survives public/portal/admin shell switches, including tab POPs.
  const mode = useMemo(() => {
    const from = tabRootFor(previous.current, TAB_ROOT_PATHS), to = tabRootFor(location.pathname, TAB_ROOT_PATHS);
    return reduce || (from && to && from !== to) || navType === 'REPLACE' ? 'fade' : navType === 'POP' ? 'pop' : 'push';
  }, [location.key, location.pathname, navType, reduce]);
  useLayoutEffect(() => { previous.current = location.pathname; }, [location.pathname]);
  return <NavigationMotion.Provider value={{ mode, animateEntry: location.key !== initialKey.current }}>{children}</NavigationMotion.Provider>;
}

export function useNavigationMotion() {
  return useContext(NavigationMotion);
}