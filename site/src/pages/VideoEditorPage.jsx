import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/api/client';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';
import VideoEditor from '@/video/editor/VideoEditor';
import '@/components/engine/engine.css';
import '@/video/video.css';

export default function VideoEditorPage() {
  const { id } = useParams();
  const [row, setRow] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setRow(null); setError('');
    api.video.project(id).then(setRow).catch(e => setError(e.message || 'This video could not be opened.'));
  }, [id]);

  return <div className="engine-site vs-app">
    <PageMeta {...PAGE_META.videoEditor} noindex />
    {error && <div className="vs-center-msg"><p>{error}</p><Link className="engine-button engine-outline" to="/video">Back to your videos</Link></div>}
    {!row && !error && <div className="vs-center-msg"><p>Opening your video…</p></div>}
    {row && <VideoEditor key={row.id} projectId={row.id} initial={{ ...row.data, title: row.title, aspect: row.aspect }} />}
  </div>;
}
