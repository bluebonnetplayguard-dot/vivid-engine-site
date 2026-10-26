import { useEffect, useState } from 'react';
import { Download, FolderPlus, History, Image as ImageIcon, Layers, Library, Plus, RotateCcw } from 'lucide-react';
import { api } from '@/api/client';
import { buildingSummary } from '../core/model.js';
import { CATEGORIES, MATERIALS } from '../core/materials.js';
import { ftin, sqft } from '../core/units.js';

const LAYER_LABELS = { roof: 'Roof', 'exterior-walls': 'Exterior walls', 'interior-walls': 'Interior walls', openings: 'Windows and doors', floors: 'Floors', cabinets: 'Cabinets and counters', site: 'Slab, patio and site', dimensions: 'Dimension labels', grid: 'Grid' };

function Thumb({ img, onOpen }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let u = '', alive = true;
    api.studio3d.image(img.id).then(b => { if (!alive) return; u = URL.createObjectURL(b); setUrl(u); }).catch(() => {});
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [img.id]);
  return <button type="button" className="gcs-thumb" onClick={() => url && onOpen({ ...img, url })} aria-label={`Open ${img.label}`}>
    {url ? <img src={url} alt={img.label} /> : <span aria-hidden="true" />}<small>{img.label}</small>
  </button>;
}

export default function ProjectPanel({ state, projects, images, onOpenDesign, onRestoreVersion, onNewProject, onOpenProject, onLayer, onOpenImage }) {
  const [tab, setTab] = useState('project');
  const [versions, setVersions] = useState(null);
  const designId = state.design?.id;
  useEffect(() => { setVersions(null); }, [designId, state.design?.version]);
  const s = buildingSummary(state.model);
  const loadVersions = () => api.studio3d.versions(designId).then(setVersions).catch(() => setVersions([]));

  return <section className="gcs-project" aria-label="Project tools">
    <div className="gcs-tabs" role="tablist">
      {[['project', 'Project', FolderPlus], ['layers', 'Layers', Layers], ['library', 'Materials', Library]].map(([id, label, Icon]) =>
        <button type="button" role="tab" key={id} aria-selected={tab === id} onClick={() => setTab(id)}><Icon size={14} aria-hidden="true" />{label}</button>)}
    </div>

    {tab === 'project' && <div className="gcs-tabbody">
      <label className="gcs-field"><span>Project</span>
        <select value={state.project?.id || ''} onChange={e => e.target.value === '__new' ? onNewProject() : onOpenProject(e.target.value)}>
          {!state.project && <option value="">Unsaved project</option>}
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value="__new">+ New project from the sample house</option>
        </select>
      </label>
      <div className="gcs-facts">
        <span>{ftin(s.width)} × {ftin(s.depth)}</span><span>{s.floors} floors</span><span>{sqft(s.roomArea)}</span><span>{s.windows} windows · {s.doors} doors</span>
      </div>
      <p className="gcs-hint">{state.model.meta?.notice}</p>

      <h4>Designs</h4>
      <ul className="gcs-list">
        {(state.project?.designs || []).map(d => <li key={d.id}>
          <button type="button" className={d.id === designId ? 'is-on' : ''} onClick={() => onOpenDesign(d.id)}>{d.title}<small>v{d.version} · {new Date(d.updated_date).toLocaleString()}</small></button>
        </li>)}
        {!state.project?.designs?.length && <li className="gcs-hint">Save to keep this design in the project.</li>}
      </ul>

      {designId && <>
        <h4><History size={14} aria-hidden="true" />Versions</h4>
        {!versions ? <button type="button" className="gcs-btn is-quiet" onClick={loadVersions}>Show saved versions</button>
          : <ul className="gcs-list">{versions.map(v => <li key={v.version}><span>v{v.version} {v.note ? `· ${v.note}` : ''}<small>{new Date(v.created_date).toLocaleString()}</small></span>
            {v.version !== state.design.version && <button type="button" className="gcs-btn is-quiet" onClick={() => onRestoreVersion(v.version)}><RotateCcw size={13} aria-hidden="true" />Restore</button>}</li>)}</ul>}
      </>}

      <h4><ImageIcon size={14} aria-hidden="true" />Presentation images</h4>
      <div className="gcs-gallery">{images.map(img => <Thumb key={img.id} img={img} onOpen={onOpenImage} />)}{!images.length && <p className="gcs-hint">Images you render are saved here.</p>}</div>
      <h4>Uploaded blueprints</h4>
      <p className="gcs-hint">Blueprint upload and conversion arrive in the next milestone.</p>
    </div>}

    {tab === 'layers' && <div className="gcs-tabbody">
      {Object.entries(LAYER_LABELS).map(([id, label]) => <label key={id} className="gcs-check"><input type="checkbox" checked={!!state.view.layers[id]} onChange={e => onLayer(id, e.target.checked)} />{label}</label>)}
    </div>}

    {tab === 'library' && <div className="gcs-tabbody">
      <p className="gcs-hint">Select part of the building to apply a finish from its panel. Patterns are drawn at real size.</p>
      {Object.entries(CATEGORIES).map(([cat, c]) => <div key={cat}><h4>{c.label}</h4><ul className="gcs-lib">
        {Object.entries(MATERIALS).filter(([, m]) => m.category === cat).map(([id, m]) => <li key={id}><i style={{ background: m.color }} aria-hidden="true" />{m.name}</li>)}
      </ul></div>)}
    </div>}
    <div className="gcs-project-foot">
      <button type="button" className="gcs-btn is-quiet" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(state.model, null, 2)], { type: 'application/json' })); a.download = `${(state.design?.title || 'design').replace(/[^\w-]+/g, '-')}.gc-building.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }}>
        <Download size={14} aria-hidden="true" />Export model (JSON)</button>
      <button type="button" className="gcs-btn is-quiet" onClick={onNewProject}><Plus size={14} aria-hidden="true" />New project</button>
    </div>
  </section>;
}
