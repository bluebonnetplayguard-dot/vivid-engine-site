import { useRef, useState, useEffect } from "react";

export function usePullToRefresh(scrollRef, onRefresh, threshold = 70) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const dist = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onStart = (e) => {
      if (el.scrollTop <= 0) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      } else {
        pulling.current = false;
      }
    };
    const onMove = (e) => {
      if (!pulling.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0) {
        dist.current = Math.min(dy * 0.5, 80);
        setPull(dist.current);
      }
    };
    const onEnd = async () => {
      if (!pulling.current) return;
      pulling.current = false;
      const reached = dist.current >= threshold;
      dist.current = 0;
      setPull(0);
      if (reached) {
        setRefreshing(true);
        try {
          await onRefresh?.();
        } finally {
          setRefreshing(false);
        }
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [scrollRef, onRefresh, threshold]);

  return { pull, refreshing };
}