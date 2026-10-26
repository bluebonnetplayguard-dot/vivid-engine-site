import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Box, Camera, Check, ChevronLeft, ChevronRight, Download, Eye, Footprints, Home, Layers3, Map, Palette, PanelLeft, PanelRight, Redo2, Ruler, Save, Sparkles, SquareDashed, Sun, Undo2, X } from 'lucide-react';
import { api } from '@/api/client';
import { Viewport } from '../3d/Viewport.js';
import { sampleHouse } from '../core/sampleHouse.js';
import { applyAll } from '../core/commands.js';
import { findElement } from '../core/model.js';
import { quickParse } from '../core/quickparse.js';
import { ftin } from '../core/units.js';
import { initialState, reducer, snapshot } from '../state/studioState.js';
import { runCommands } from '../state/runCommands.js';
import PropertiesPanel from './PropertiesPanel.jsx';
import AssistantPanel from './AssistantPanel.jsx';
import ProjectPanel from './ProjectPanel.jsx';
import './studio.css';

const useMobile = () => {
  const q = '(max-width: 900px)';
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, []);
  return m;
};

// Compact description of the model for the server-side AI interpreter (ids, names, faces; no geometry).
function aiContext(state) {
  const m = state.model;
  const wallFace = Object.fromEntries(m.walls.map(w => [w.id, w.face]));
  return {
    selection: state.selection ? { id: state.selection, kind: findElement(m, state.selection)?.kind, name: findElement(m, state.selection)?.el.name } : null,
    walls: m.walls.map(w => ({ id: w.id, name: w.name, floor: w.floor, face: w.face, exterior: w.exterior })),
    openings: m.openings.map(o => ({ id: o.id, name: o.name, kind: o.kind, face: wallFace[o.wall] || null })),
    rooms: m.rooms.map(r => ({ id: r.id, name: r.name, floor: r.floor })),
    roofs: m.roofs.map(r => ({ id: r.id, name: r.name, material: r.material })),
    components: m.components.map(c => ({ id: c.id, name: c.name, kind: c.kind })),
    view: { mode: state.view.mode, lighting: state.view.lighting },
  };
}

export default function StudioApp({ initialStatus }) {
  const [state, dispatch] = useReducer(reducer, null, () => initialState(sampleHouse()));
  const stateRef = useRef(state); stateRef.current = state;
  const getState = useCallback(() => stateRef.current, []);
  const vp = useRef(null);
  const mobile = useMobile();
  const [params, setParams] = useSearchParams();
  const [status] = useState(initialStatus);
  const [projects, setProjects] = useState([]);
  const [images, setImages] = useState([]);
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [measureOut, setMeasureOut] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [sheet, setSheet] = useState(null);           // mobile: 'project' | 'edit' | 'assistant'
  const [panels, setPanels] = useState({ left: true, right: true });
  const [viewError, setViewError] = useState('');

  const flash = t => { setToast(t); clearTimeout(flash.t); flash.t = setTimeout(() => setToast(''), 3200); };

  // ---------- viewport lifecycle ----------
  // A callback ref, so the viewport follows its container if the layout switches between desktop and mobile.
  const box = useCallback(node => {
    const old = vp.current;
    const pose = old?.pose();
    if (old) { old.dispose(); vp.current = null; delete window.__gcStudio; }
    if (!node) return;
    let v;
    try {
      v = new Viewport(node, {
        onSelect: id => { dispatch({ type: 'SELECT', id }); if (id && window.matchMedia('(max-width: 900px)').matches) setSheet('edit'); },
        onMeasure: r => setMeasureOut(r),
      });
    } catch { setViewError('3D could not start on this device (WebGL is unavailable or turned off).'); return; }
    vp.current = v; window.__gcStudio = { viewport: v, getState };   // handy for support and automated tests
    const st = stateRef.current;
    v.setModel(st.proposal ? st.proposal.model : st.model, { preview: st.proposal?.ids || null });
    v.setLighting(st.view.lighting);
    for (const [k, on] of Object.entries(st.view.layers)) v.setLayer(k, on);
    if (pose) v.setPose(pose, { instant: true });
  }, [getState]);

  useEffect(() => {
    const v = vp.current; if (!v) return;
    const p = state.proposal;
    v.setModel(p ? p.model : state.model, { preview: p ? p.ids : null });
    if (state.selection && !findElement(p ? p.model : state.model, state.selection)) dispatch({ type: 'SELECT', id: null });
    else v.select(state.selection, { silent: true });
  }, [state.model, state.proposal]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- server ----------
  const refreshProject = useCallback(async id => {
    const r = await api.studio3d.project(id);
    dispatch({ type: 'PROJECT', project: { ...r.project, designs: r.designs } });
    setImages(r.images);
    return r;
  }, []);

  const openDesign = useCallback(async (designId, project) => {
    const d = await api.studio3d.design(designId);
    dispatch({ type: 'LOAD', model: d.data.model, design: { id: d.id, title: d.title, version: d.version }, project, view: { lighting: d.data.view?.lighting || 'day', layers: d.data.view?.layers } });
    const v = vp.current;
    if (v) {
      v.framed = false; v.setModel(d.data.model); v.setLighting(d.data.view?.lighting || 'day');
      for (const [k, on] of Object.entries(d.data.view?.layers || {})) v.setLayer(k, on);
      if (d.data.view?.camera) v.setPose(d.data.view.camera, { instant: true });
    }
    setParams(p => { const n = new URLSearchParams(p); n.set('project', d.project_id); n.set('design', d.id); return n; }, { replace: true });
  }, [setParams]);

  const openProject = useCallback(async (projectId, designId) => {
    const r = await refreshProject(projectId);
    const target = designId && r.designs.find(d => d.id === designId) ? designId : r.designs[0]?.id;
    if (target) await openDesign(target, { ...r.project, designs: r.designs });
  }, [refreshProject, openDesign]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!status.enabled || status.offline) return;
      const list = await api.studio3d.projects().catch(() => []);
      if (!alive) return;
      setProjects(list);
      const want = params.get('project');
      const pick = list.find(p => p.id === want) || list[0];
      if (pick) await openProject(pick.id, params.get('design')).catch(e => flash(e.message || 'Couldn’t open the project.'));
    })();
    return () => { alive = false; };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- actions ----------
  const designData = () => ({ ...snapshot(getState()), view: { ...snapshot(getState()).view, camera: vp.current?.pose() } });

  const save = useCallback(async (note) => {
    if (status.offline) throw new Error('Saving needs the studio server, which isn’t reachable.');
    const st = getState();
    if (st.proposal) throw new Error('Apply or discard the proposed change before saving.');
    if (!st.project) {
      const r = await api.studio3d.createProject({ name: st.model.name, design: { title: 'Base design', data: designData() } });
      dispatch({ type: 'SAVED', design: { id: r.design.id, title: r.design.title, version: r.design.version } });
      await refreshProject(r.project.id);
      setProjects(await api.studio3d.projects());
      setParams(p => { const n = new URLSearchParams(p); n.set('project', r.project.id); n.set('design', r.design.id); return n; }, { replace: true });
      return `Saved as a new project, “${r.project.name}”.`;
    }
    const r = await api.studio3d.saveDesign(st.design.id, { data: designData(), baseVersion: st.design.version, note: note || undefined });
    dispatch({ type: 'SAVED', design: { version: r.version } });
    await refreshProject(st.project.id);
    return `Saved ${st.design.title} (version ${r.version}).`;
  }, [getState, refreshProject, setParams, status.offline]);   // eslint-disable-line react-hooks/exhaustive-deps

  const capture = useCallback(async label => {
    const v = vp.current; if (!v) throw new Error('The 3D view isn’t ready.');
    if (!getState().project) await save();
    const st = getState();
    const title = `${st.project?.name || st.model.name}${st.design?.title ? ` · ${st.design.title}` : ''}`;
    const dataUrl = v.capture({ title });
    const img = await api.studio3d.saveImage(st.project.id, { designId: st.design?.id, label: label || `${st.design?.title || 'View'}, ${new Date().toLocaleString()}`, dataUrl, camera: v.pose(), lighting: st.view.lighting });
    await refreshProject(st.project.id);
    return `Saved presentation image “${img.label}” to ${st.project.name}.`;
  }, [getState, save, refreshProject]);

  const variation = useCallback(async (name, commands) => {
    let st = getState();
    if (st.proposal) throw new Error('Apply or discard the proposed change first.');
    if (!st.project || st.dirty) { await save(); st = getState(); }
    const r = applyAll(st.model, commands, { selection: st.selection });
    if (r.error) throw new Error(r.error);
    const d = await api.studio3d.createDesign(st.project.id, { title: name, data: { model: { ...r.model }, view: designData().view } });
    const proj = await refreshProject(st.project.id);
    await openDesign(d.id, { ...proj.project, designs: proj.designs });
    return `Created “${name}” as a separate design. Switch between designs in the Project panel to compare.`;
  }, [getState, save, refreshProject, openDesign]);   // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(cmds => runCommands(cmds, { getState, dispatch, viewport: vp.current, actions: { save, capture, variation } }), [getState, save, capture, variation]);

  const runUi = useCallback(async cmds => {
    const r = await run(cmds);
    if (r.errors.length) flash(r.errors[0]); else if (r.notes.length && !r.notes[0].startsWith('Proposed')) flash(r.notes[0]);
    return r;
  }, [run]);

  const ask = useCallback(async text => {
    setMessages(m => [...m, { role: 'user', text }]);
    const st = getState();
    const local = quickParse(text, { selectionKind: st.selection ? findElement(st.model, st.selection)?.kind : null });
    setBusy(true);
    try {
      if (local) {
        const r = await run(local.commands);
        setMessages(m => [...m, { role: 'ai', text: r.errors.length && !r.notes.length ? 'I couldn’t do that.' : local.reply, notes: r.notes, errors: r.errors, engine: 'instant' }]);
        return;
      }
      if (!status.ai) {
        setMessages(m => [...m, { role: 'ai', error: true, text: 'I didn’t understand that one, and the full AI interpreter isn’t switched on for this site yet. Try wording like the suggestions below.' }]);
        return;
      }
      const res = await api.studio3d.interpret({ message: text, context: aiContext(st), history: messages.filter(x => x.role === 'user').slice(-4).map(x => x.text) });
      const r = res.commands?.length ? await run(res.commands) : { notes: [], errors: [] };
      setMessages(m => [...m, { role: 'ai', text: res.reply || 'Done.', notes: r.notes, errors: [...(res.dropped || []), ...r.errors], engine: res.engine }]);
    } catch (e) {
      setMessages(m => [...m, { role: 'ai', error: true, text: e?.message || 'Something went wrong. Try again.' }]);
    } finally { setBusy(false); }
  }, [getState, run, status.ai, messages]);

  const restoreVersion = async v => {
    const st = getState();
    const r = await api.studio3d.version(st.design.id, v);
    dispatch({ type: 'APPLY', model: r.data.model });
    flash(`Version ${v} restored. Save to make it the current version.`);
  };

  const newProject = async () => {
    const name = window.prompt('Name the new project', 'New project');
    if (!name) return;
    try {
      const r = await api.studio3d.createProject({ name, design: { title: 'Base design', data: { model: sampleHouse(), view: { lighting: 'day' } } } });
      setProjects(await api.studio3d.projects());
      await openProject(r.project.id, r.design.id);
      flash(`Created ${name}.`);
    } catch (e) { flash(e.message || 'Couldn’t create the project.'); }
  };

  // ---------- keyboard ----------
  useEffect(() => {
    const f = e => {
      if (/input|textarea|select/i.test(document.activeElement?.tagName || '')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' }); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); dispatch({ type: 'REDO' }); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save().then(flash, err => flash(err.message)); }
      else if (e.key === 'Escape') { vp.current?.select(null); vp.current?.setMeasuring(false); dispatch({ type: 'VIEW', patch: { measuring: false } }); }
    };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }, [save]);

  useEffect(() => {
    const f = e => { if (stateRef.current.dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', f); return () => window.removeEventListener('beforeunload', f);
  }, []);

  // ---------- toolbar ----------
  const v = state.view;
  const tool = (cmds) => () => runUi(cmds);
  const toggleMeasure = () => { const on = !v.measuring; vp.current?.setMeasuring(on); setMeasureOut(null); dispatch({ type: 'VIEW', patch: { measuring: on } }); if (on) flash('Measure: tap two points on the model.'); };
  const toggleDims = () => runUi([{ type: 'TOGGLE_LAYER', layer: 'dimensions', visible: !v.layers.dimensions }]);
  const exportImage = () => { const url = vp.current?.capture({ title: state.model.name }); if (!url) return; const a = document.createElement('a'); a.href = url; a.download = 'gc-3d-view.jpg'; a.click(); };
  const sel = state.selection && findElement(state.proposal?.model || state.model, state.selection);

  const toolbar = <nav className="gcs-toolbar" aria-label="Design controls">
    <button type="button" className={v.mode === 'floor' ? 'is-on' : ''} onClick={tool([{ type: 'SET_VIEW', mode: 'floor', floor: v.mode === 'floor' && v.floor === 1 ? 2 : 1 }])} title="2D floor plan (tap again for the other floor)"><Map size={17} aria-hidden="true" /><span>2D{v.mode === 'floor' ? ` · ${v.floor === 2 ? '2nd' : '1st'}` : ''}</span></button>
    <button type="button" className={v.mode === 'exterior' ? 'is-on' : ''} onClick={tool([{ type: 'SET_VIEW', mode: 'exterior' }, { type: 'CHANGE_CAMERA', preset: 'iso' }])}><Box size={17} aria-hidden="true" /><span>3D</span></button>
    <button type="button" className={v.mode === 'walkthrough' ? 'is-on' : ''} onClick={tool([{ type: 'SET_VIEW', mode: 'walkthrough' }])}><Footprints size={17} aria-hidden="true" /><span>Walk</span></button>
    <button type="button" className={v.mode === 'exterior' ? '' : ''} onClick={tool([{ type: 'SET_VIEW', mode: 'exterior' }, { type: 'CHANGE_CAMERA', preset: 'front' }])}><Home size={17} aria-hidden="true" /><span>Exterior</span></button>
    <button type="button" className={v.mode === 'interior' ? 'is-on' : ''} onClick={tool([{ type: 'SET_VIEW', mode: 'interior' }, { type: 'CHANGE_CAMERA', preset: 'room', room: 'living room' }])}><Eye size={17} aria-hidden="true" /><span>Interior</span></button>
    <button type="button" className={v.mode === 'dollhouse' ? 'is-on' : ''} onClick={tool([{ type: 'SET_VIEW', mode: 'dollhouse' }])}><Layers3 size={17} aria-hidden="true" /><span>Dollhouse</span></button>
    <span className="gcs-sep" aria-hidden="true" />
    <select aria-label="Camera view" value="" onChange={e => { if (e.target.value) runUi([{ type: 'SET_VIEW', mode: v.mode === 'walkthrough' || v.mode === 'interior' ? 'exterior' : v.mode }, { type: 'CHANGE_CAMERA', preset: e.target.value }]); }}>
      <option value="">View…</option><option value="front">Front</option><option value="back">Back</option><option value="left">Left</option><option value="right">Right</option><option value="top">Top</option><option value="iso">Corner</option><option value="ground">Street level</option>
    </select>
    <select aria-label="Lighting" value={v.lighting} onChange={e => runUi([{ type: 'SET_LIGHTING', preset: e.target.value }])}><option value="day">Day</option><option value="sunset">Sunset</option><option value="evening">Evening</option></select>
    <button type="button" className={v.projection === 'orthographic' ? 'is-on' : ''} onClick={tool([{ type: 'SET_VIEW', mode: v.projection === 'orthographic' ? 'perspective' : 'orthographic' }])} title="Perspective / orthographic"><SquareDashed size={17} aria-hidden="true" /><span>{v.projection === 'orthographic' ? 'Ortho' : 'Persp'}</span></button>
    <span className="gcs-sep" aria-hidden="true" />
    <button type="button" onClick={() => { if (mobile) setSheet(state.selection ? 'edit' : 'project'); else setPanels(p => ({ ...p, right: true })); if (!state.selection) flash('Tap part of the building to change its finish.'); }}><Palette size={17} aria-hidden="true" /><span>Materials</span></button>
    <button type="button" className={v.measuring ? 'is-on' : ''} onClick={toggleMeasure}><Ruler size={17} aria-hidden="true" /><span>Measure</span></button>
    <button type="button" className={v.layers.dimensions ? 'is-on' : ''} onClick={toggleDims}><Ruler size={17} aria-hidden="true" style={{ transform: 'rotate(90deg)' }} /><span>Dims</span></button>
    <button type="button" onClick={() => runUi([{ type: 'GENERATE_RENDER' }])}><Camera size={17} aria-hidden="true" /><span>Render</span></button>
    <button type="button" onClick={() => save().then(flash, e => flash(e.message))} className={state.dirty ? 'is-attn' : ''}><Save size={17} aria-hidden="true" /><span>Save</span></button>
    <button type="button" onClick={exportImage}><Download size={17} aria-hidden="true" /><span>Export</span></button>
  </nav>;

  const proposalBar = state.proposal && <div className="gcs-proposal" role="alertdialog" aria-label="Proposed change">
    <b>Proposed change</b><ul>{state.proposal.changes.map(c => <li key={c}>{c}</li>)}</ul>
    <p>Sizes are conceptual until checked against construction documents.</p>
    <div><button type="button" className="gcs-btn is-primary" onClick={() => { dispatch({ type: 'ACCEPT' }); flash('Change applied. Undo is available.'); }}><Check size={15} aria-hidden="true" />Apply</button>
      <button type="button" className="gcs-btn" onClick={() => dispatch({ type: 'DISCARD' })}><X size={15} aria-hidden="true" />Discard</button></div>
  </div>;

  const props = <PropertiesPanel model={state.proposal?.model || state.model} selection={state.selection} onRun={runUi} onClose={() => vp.current?.select(null)} />;
  const assistant = <AssistantPanel messages={messages} busy={busy} onSend={ask} aiReady={status.ai} />;
  const project = <ProjectPanel state={state} projects={projects} images={images} onOpenDesign={id => openDesign(id, state.project).catch(e => flash(e.message))}
    onRestoreVersion={restoreVersion} onNewProject={newProject} onOpenProject={id => openProject(id).catch(e => flash(e.message))}
    onLayer={(layer, on) => runUi([{ type: 'TOGGLE_LAYER', layer, visible: on }])} onOpenImage={setLightbox} />;

  const viewportEl = <div className="gcs-stage">
    <div ref={box} className="gcs-viewport" />
    {viewError && <div className="gcs-center"><p>{viewError}</p></div>}
    {proposalBar}
    {v.mode === 'walkthrough' && <div className="gcs-walkpad" aria-label="Walk controls">
      {[['↑', 18, 0, 0, 'Forward'], ['↓', -18, 0, 0, 'Back'], ['⟲', 0, 0, 0.25, 'Turn left'], ['⟳', 0, 0, -0.25, 'Turn right']].map(([l, f, s, t, aria]) =>
        <button type="button" key={aria} aria-label={aria} onClick={() => vp.current?.walkStep(f, s, t)}>{l}</button>)}
      <small>Drag to look · W A S D or arrows</small>
    </div>}
    {v.measuring && <div className="gcs-measure-out" role="status">{measureOut?.distance != null ? <>Distance <b>{ftin(measureOut.distance)}</b> · horizontal {ftin(measureOut.horizontal)} · vertical {ftin(measureOut.vertical)}</> : measureOut?.points ? 'Now tap the second point.' : 'Tap the first point.'}</div>}
    {sel && !mobile && <div className="gcs-selchip">{sel.el.name}</div>}
    {toast && <div className="gcs-toast" role="status">{toast}</div>}
  </div>;

  const header = <header className="gcs-top">
    <Link to="/portal" className="gcs-back" aria-label="Back to the portal"><ChevronLeft size={18} aria-hidden="true" /></Link>
    <div className="gcs-title"><b>GC 3D Design Studio</b><span>{state.project?.name || 'Sample house (not saved yet)'}{state.design ? ` · ${state.design.title} v${state.design.version}` : ''}{state.dirty ? ' · unsaved changes' : ''}</span></div>
    <div className="gcs-top-acts">
      <button type="button" className="gcs-icon" onClick={() => dispatch({ type: 'UNDO' })} disabled={!state.past.length} aria-label="Undo"><Undo2 size={17} /></button>
      <button type="button" className="gcs-icon" onClick={() => dispatch({ type: 'REDO' })} disabled={!state.future.length} aria-label="Redo"><Redo2 size={17} /></button>
      {!mobile && <><button type="button" className="gcs-icon" onClick={() => setPanels(p => ({ ...p, left: !p.left }))} aria-label="Toggle project panel" aria-pressed={panels.left}><PanelLeft size={17} /></button>
        <button type="button" className="gcs-icon" onClick={() => setPanels(p => ({ ...p, right: !p.right }))} aria-label="Toggle assistant panel" aria-pressed={panels.right}><PanelRight size={17} /></button></>}
    </div>
  </header>;

  return <div className={`gcs-app${mobile ? ' is-mobile' : ''}`}>
    {header}
    {status.error && <p className="gcs-banner" role="status">{status.error}</p>}
    {mobile ? <>
      <main className="gcs-main-mobile">{viewportEl}</main>
      {toolbar}
      <div className="gcs-sheet-tabs" role="tablist">
        {[['project', 'Project'], ['edit', sel ? 'Edit selection' : 'Edit'], ['assistant', 'Assistant']].map(([id, label]) =>
          <button type="button" key={id} role="tab" aria-selected={sheet === id} onClick={() => setSheet(sheet === id ? null : id)}>{id === 'assistant' && <Sparkles size={14} aria-hidden="true" />}<span>{label}</span></button>)}
      </div>
      {sheet && <div className={`gcs-sheet is-${sheet}`}>
        <button type="button" className="gcs-sheet-close" onClick={() => setSheet(null)} aria-label="Close panel"><ChevronRight size={16} style={{ transform: 'rotate(90deg)' }} /></button>
        {sheet === 'project' && project}{sheet === 'edit' && props}{sheet === 'assistant' && assistant}
      </div>}
    </> : <PanelGroup direction="horizontal" className="gcs-body" autoSaveId="gc-studio-panels">
      {panels.left && <><Panel id="left" order={1} defaultSize={20} minSize={14} maxSize={34} className="gcs-left">{project}</Panel><PanelResizeHandle className="gcs-handle" /></>}
      <Panel id="center" order={2} minSize={36} className="gcs-center-col">{viewportEl}{toolbar}</Panel>
      {panels.right && <><PanelResizeHandle className="gcs-handle" /><Panel id="right" order={3} defaultSize={26} minSize={18} maxSize={40} className="gcs-right">{sel ? props : null}{assistant}</Panel></>}
    </PanelGroup>}
    {lightbox && <div className="gcs-lightbox" role="dialog" aria-label={lightbox.label} onClick={() => setLightbox(null)}>
      <figure onClick={e => e.stopPropagation()}><img src={lightbox.url} alt={lightbox.label} /><figcaption>{lightbox.label} · Design visualization, conceptual
        <a className="gcs-btn" href={lightbox.url} download={`${lightbox.label.replace(/[^\w-]+/g, '-')}.jpg`}><Download size={14} aria-hidden="true" />Download</a>
        <button type="button" className="gcs-btn" onClick={() => setLightbox(null)}>Close</button></figcaption></figure>
    </div>}
  </div>;
}

