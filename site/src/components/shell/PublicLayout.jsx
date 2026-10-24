import { useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { accessFor } from '@/config/navigation';
import AppShell from '@/components/shell/AppShell';
import { ShellContext } from '@/components/shell/ShellContext';
import useSearchAccount from '@/hooks/useSearchAccount';
import '@/components/engine/engine.css';

// The shared frame for public pages: sidebar, breadcrumbs, footer, WhatsApp. Pages render only their content;
// the old per-page headers and footers step aside inside it (see useInShell).
export default function PublicLayout() {
  const account = useSearchAccount();
  const [page, setPage] = useState(null);
  const ctx = useMemo(() => ({ setPage, account }), [account]);
  return <ShellContext.Provider value={ctx}>
    <div className={`engine-site${account.isAuthenticated ? ' vh-signed' : ''}`}>
      <AppShell account={account} page={page}><AccessGate account={account}><Outlet /></AccessGate></AppShell>
    </div>
  </ShellContext.Provider>;
}

// Route protection from config/navigation.ts: signed-in pages send guests to sign in and come back after.
function AccessGate({ account, children }) {
  const { pathname, search } = useLocation();
  const need = accessFor(pathname);
  if (need === 'public') return children;
  if (!account.authChecked) return <div className="vs-gate" role="status">Loading…</div>;
  if (!account.isAuthenticated) return <Navigate to={`/login?returnTo=${encodeURIComponent(pathname + search)}`} replace />;
  if (need === 'admin' && account.user?.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}
