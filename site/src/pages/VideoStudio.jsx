import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Captions, Clapperboard, Film, LayoutTemplate, Palette, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';
import EngineNav from '@/components/engine/EngineNav';
import EngineFooter from '@/components/engine/EngineFooter';
import { allowed, ASPECTS, emptyProject, fmtTime, LEVEL_LABEL } from '@/video/engine/model';
import { fitsAspect, projectFromTemplate, templateLevel, TEMPLATES } from '@/video/engine/templates';
import '@/components/engine/engine.css';
import '@/video/video.css';

const FEATURES = [
  { icon: Film, title: 'Timeline editor', text: 'Trim, split, layer and arrange video, photos, text and music with undo, snapping and keyframes.' },
  { icon: LayoutTemplate, title: 'Templates', text: 'Intros, promos, invites, reviews and social posts that take on your brand colors and fonts.' },
  { icon: Captions, title: 'AI captions', text: 'Accurate, timed subtitles from your video’s speech, with word-highlight and pop styles.' },
  { icon: Wand2, title: 'Script to video', text: 'Paste a blog post or idea. AI writes the scenes, finds stock footage and records a voiceover.' },
  { icon: Sparkles, title: 'Effects & transitions', text: 'Filters and color grades, green screen, glitch, slow zoom, blur fill and 13 transitions.' },
  { icon: Palette, title: 'Brand kits', text: 'Save your logo, colors and fonts once. Every template and AI draft uses them.' },
];

function NewVideo({ tier, onCreate, busy }) {
  const [aspect, setAspect] = useState('16:9');
  const templates = TEMPLATES.filter(t => fitsAspect(t, aspect)).slice(0, 8);
  return <section className="vs-home-new" aria-labelledby="new-h">
    <h2 id="new-h">Start a new video</h2>
    <div className="vs-aspects" role="radiogroup" aria-label="Video shape">
      {Object.entries(ASPECTS).map(([k, v]) => <button type="button" role="radio" aria-checked={aspect === k} key={k} className={aspect === k ? 'is-on' : ''} onClick={() => setAspect(k)}>
        <i style={{ aspectRatio: `${v.w} / ${v.h}` }} /><b>{k}</b><small>{v.hint}</small>
      </button>)}
    </div>
    <div className="vs-home-starts">
      <button type="button" className="vs-start-blank" disabled={busy} onClick={() => onCreate(emptyProject(aspect))}><Plus size={22} aria-hidden="true" />Blank video</button>
      {templates.map(t => {
        const level = templateLevel(t);
        const locked = !allowed(level, tier?.templateLevel ?? 'basic');
        return <button type="button" key={t.id} className={`vs-start-tpl${locked ? ' is-locked' : ''}`} disabled={busy || locked}
          onClick={() => onCreate(projectFromTemplate(t, aspect, null))} title={locked ? `Needs the ${LEVEL_LABEL[level]} plan` : t.name}>
          <b>{t.name}</b><small>{t.category}{locked ? ` · ${LEVEL_LABEL[level]}` : ''}</small>
        </button>;
      })}
    </div>
  </section>;
}

export default function VideoStudio() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState(null);
  const [me, setMe] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) return;
    api.video.projects().then(setProjects).catch(e => setError(e.message));
    api.video.me().then(setMe).catch(() => {});
  }, [isAuthenticated]);

  const create = async data => {
    setBusy(true); setError('');
    try {
      const row = await api.video.createProject({ title: data.title, aspect: data.aspect, duration: 0, data });
      navigate(`/video/edit/${row.id}`);
    } catch (e) { setError(e.message); setBusy(false); }
  };

  const remove = async p => {
    if (!window.confirm(`Delete “${p.title}”? The edit is removed from your account. Media files on this device are kept.`)) return;
    try { await api.video.deleteProject(p.id); setProjects(list => list.filter(x => x.id !== p.id)); } catch (e) { setError(e.message); }
  };

  return <div className="engine-site">
    <PageMeta {...PAGE_META.videoStudio} />
    <EngineNav />
    <main className="vs-home">
      <header className="vs-home-hero">
        <span className="engine-caps"><Clapperboard size={14} aria-hidden="true" /> Vivid Video Studio</span>
        <h1>Make videos people <span className="engine-blue">actually watch</span></h1>
        <p>A video editor that runs in your browser: timeline editing, templates, AI captions, AI voiceover and script-to-video. Your files stay on your computer.</p>
        {!isLoadingAuth && !isAuthenticated && <div className="vs-home-cta">
          <Link className="engine-button engine-primary" to="/register?returnTo=%2Fvideo">Start free</Link>
          <Link className="engine-button engine-outline" to="/video/pricing">See plans</Link>
        </div>}
      </header>

      {error && <div className="vs-err" role="alert">{error}</div>}

      {isAuthenticated && <>
        <NewVideo tier={me?.tier} onCreate={create} busy={busy} />
        <section aria-labelledby="mine-h" className="vs-home-mine">
          <div className="vs-home-row"><h2 id="mine-h">Your videos</h2>
            {me && <span className="vs-muted">{me.tier.name} plan · {me.usage.projects.used} of {me.usage.projects.limit} projects · {me.usage.exports.used} of {me.usage.exports.limit} exports this month · <Link to="/video/account">Plan &amp; usage</Link></span>}</div>
          {!projects && <p className="vs-muted">Loading…</p>}
          {projects?.length === 0 && <p className="vs-muted">No videos yet. Start one above.</p>}
          {projects?.length > 0 && <div className="vs-home-grid">
            {projects.map(p => <article key={p.id} className="vs-home-card">
              <Link to={`/video/edit/${p.id}`} className="vs-home-thumb" style={{ aspectRatio: `${ASPECTS[p.aspect]?.w ?? 16} / ${ASPECTS[p.aspect]?.h ?? 9}` }}>
                {p.thumbnail ? <img src={p.thumbnail} alt="" /> : <Film size={28} aria-hidden="true" />}
              </Link>
              <div><Link to={`/video/edit/${p.id}`}><b>{p.title}</b></Link><small>{p.aspect} · {fmtTime(Number(p.duration_sec))} · {new Date(p.updated_date).toLocaleDateString()}</small></div>
              <button type="button" onClick={() => remove(p)} aria-label={`Delete ${p.title}`}><Trash2 size={15} /></button>
            </article>)}
          </div>}
        </section>
      </>}

      <section className="vs-home-features" aria-labelledby="feat-h">
        <h2 id="feat-h">Everything in one editor</h2>
        <div className="vs-home-feature-grid">{FEATURES.map(f => <div key={f.title}><f.icon size={22} aria-hidden="true" /><h3>{f.title}</h3><p>{f.text}</p></div>)}</div>
        <p className="vs-muted" style={{ textAlign: 'center' }}>Free plan included. <Link to="/video/pricing">Compare plans</Link>. Need a video made for you? <Link to="/contact">Contact us</Link>.</p>
      </section>
    </main>
    <EngineFooter />
  </div>;
}
