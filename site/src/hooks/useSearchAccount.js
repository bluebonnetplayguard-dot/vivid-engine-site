import { useCallback, useEffect, useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { historyAccess } from '@/config/plans';

// Signed-in visitor's AI Search plan and, when the plan includes it, their saved conversations.
export default function useSearchAccount() {
  const { isAuthenticated, authChecked, user } = useAuth();
  const [me, setMe] = useState(null);
  const [threads, setThreads] = useState([]);
  const access = historyAccess(me);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) { setMe(null); setThreads([]); return; }
    const profile = await api.aiSearch.me().catch(() => null);
    setMe(profile);
    if (historyAccess(profile).allowed || historyAccess(profile).readOnly) setThreads(await api.aiSearch.threads().catch(() => []));
    else setThreads([]);
  }, [isAuthenticated]);

  useEffect(() => { refresh(); }, [refresh]);

  return { me, setMe, threads, setThreads, access, refresh, isAuthenticated, authChecked, user };
}
