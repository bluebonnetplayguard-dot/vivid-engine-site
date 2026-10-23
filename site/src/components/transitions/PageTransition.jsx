import { useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigationMotion } from '@/components/transitions/NavigationMotionProvider';

const ease = [0.32, 0.72, 0, 1];
const variants = {
  initial: mode => mode === 'push' ? { x: '28%', opacity: 0 } : mode === 'pop' ? { x: '-12%', opacity: 0 } : { x: 0, opacity: 0 },
  animate: mode => ({ x: 0, opacity: 1, transition: mode === 'fade' ? { duration: 0.16 } : { duration: 0.28, ease } }),
  exit: mode => mode === 'push' ? { x: '-12%', opacity: 0, transition: { duration: 0.18, ease } } : mode === 'pop' ? { x: '28%', opacity: 0, transition: { duration: 0.18, ease } } : { x: 0, opacity: 0, transition: { duration: 0.1 } },
};

export default function PageTransition({ children }) {
  const location = useLocation();
  const mobile = useIsMobile(), element = useRef(null);
  const { mode, animateEntry } = useNavigationMotion();
  // The existing ScrollToTop owns scroll handling; do not reset POP or hash navigation here.
  if (!mobile) return children;
  return <AnimatePresence mode="wait" initial={animateEntry} custom={mode}>
    <motion.div key={location.pathname} ref={element} custom={mode} variants={variants} initial="initial" animate="animate" exit="exit" className="w-full min-h-full" style={{ overflowX: 'clip' }} onAnimationComplete={phase => {
      if (phase === 'animate' && element.current) element.current.style.transform = 'none';
    }}>{children}</motion.div>
  </AnimatePresence>;
}