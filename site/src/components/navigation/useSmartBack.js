import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function parentPath(pathname) {
  const parts = (pathname || '/').split('/').filter(Boolean);
  parts.pop();
  return '/' + parts.join('/');
}

export function useSmartBack(fallback) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const index = typeof window !== 'undefined' ? window.history.state?.idx : undefined;
  const canGoBack = typeof index === 'number' && index > 0;
  const goBack = useCallback(() => {
    if (canGoBack) navigate(-1);
    else navigate(fallback || parentPath(pathname), { replace: true });
  }, [canGoBack, fallback, pathname, navigate]);
  return { goBack, canGoBack };
}