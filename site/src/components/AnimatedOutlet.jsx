import { useLocation, useOutlet } from "react-router-dom";
import { useIsMobile } from '@/hooks/use-mobile';
import PageTransition from '@/components/transitions/PageTransition';
import { AnimatePresence, motion } from "framer-motion";

export default function AnimatedOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  const mobile = useIsMobile();
  if (mobile) return <PageTransition>{outlet}</PageTransition>;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}