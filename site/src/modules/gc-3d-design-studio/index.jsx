// GC 3D Design Studio module entry. Route: /studio (signed-in). See README.md in this folder.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import StudioApp from './ui/StudioApp.jsx';
import './ui/studio.css';

export default function GcDesignStudio() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let alive = true;
    api.studio3d.status()
      .then(st => alive && setStatus({ enabled: !!st.enabled, ai: !!st.ai, offline: false, error: '' }))
      .catch(e => alive && setStatus({ enabled: true, ai: false, offline: true,
        error: e.status === 404 ? 'The studio server isn’t deployed yet, so designs can’t be saved. Everything else works.' : `Can’t reach the studio server (${e.message || 'offline'}). Designs can’t be saved right now.` }));
    return () => { alive = false; };
  }, []);
  if (!status) return <div className="gcs-app"><div className="gcs-center"><p>Opening the studio…</p></div></div>;
  if (!status.enabled) return <div className="gcs-app"><div className="gcs-center"><p>The 3D Design Studio isn’t switched on for this site yet.</p><Link to="/portal" className="gcs-btn">Back to the portal</Link></div></div>;
  return <StudioApp initialStatus={status} />;
}
