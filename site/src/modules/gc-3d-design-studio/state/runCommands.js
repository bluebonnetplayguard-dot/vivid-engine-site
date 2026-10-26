// Executes validated studio commands. View commands drive the viewport straight away; appearance commands
// change the model (undoable); geometry commands become a proposal the contractor must apply or discard.
import { applyAll, applyModelCommand, commandClass, resolveTarget, validateCommand } from '../core/commands.js';

export async function runCommands(commands, { getState, dispatch, viewport, actions }) {
  const notes = [], errors = [];
  const valid = [];
  for (const c of Array.isArray(commands) ? commands : []) {
    const why = validateCommand(c);
    if (why) errors.push(`Skipped an instruction I couldn’t use (${why}).`); else valid.push(c);
  }
  const appearance = [], geometry = [];
  for (const c of valid) {
    const cls = commandClass(c);
    if (cls === 'appearance') appearance.push(c);
    else if (cls === 'geometry') geometry.push(c);
  }

  // Appearance first, as one undo step.
  if (appearance.length) {
    const st = getState();
    let m = st.model; const changes = [];
    for (const c of appearance) {
      const r = applyModelCommand(m, c, { selection: st.selection });
      if (r.error) errors.push(r.error); else { m = r.model; changes.push(...r.changes); }
    }
    if (changes.length) { dispatch({ type: 'APPLY', model: m }); notes.push(...changes); }
  }

  if (geometry.length) {
    const st = getState();
    const r = applyAll(st.model, geometry, { selection: st.selection });
    if (r.error) errors.push(r.error);
    else { dispatch({ type: 'PROPOSE', model: r.model, changes: r.changes, ids: r.ids, focus: r.ids?.[0] }); notes.push(...r.changes.map(c => `Proposed: ${c}`)); }
  }

  for (const c of valid) {
    const cls = commandClass(c);
    if (cls === 'view') {
      if (c.type === 'CHANGE_CAMERA') {
        const r = viewport?.cameraPreset(c.preset, { room: c.room, degrees: c.degrees });
        if (r?.error) errors.push(r.error);
        if (c.preset === 'room' && !r?.error) dispatch({ type: 'VIEW', patch: { mode: 'interior' } });
      } else if (c.type === 'SET_VIEW') {
        if (c.mode === 'perspective' || c.mode === 'orthographic') { viewport?.setProjection(c.mode); dispatch({ type: 'VIEW', patch: { projection: c.mode } }); }
        else { viewport?.setMode(c.mode, { floor: c.floor, reframe: c.mode === 'exterior' }); dispatch({ type: 'VIEW', patch: { mode: c.mode, floor: c.mode === 'floor' ? (c.floor || 1) : null } }); }
      } else if (c.type === 'TOGGLE_LAYER') { viewport?.setLayer(c.layer, c.visible); dispatch({ type: 'VIEW', patch: { layers: { [c.layer]: c.visible } } }); }
      else if (c.type === 'SET_LIGHTING') { viewport?.setLighting(c.preset); dispatch({ type: 'VIEW', patch: { lighting: c.preset } }); }
      else if (c.type === 'SELECT_OBJECT') {
        const ids = resolveTarget(getState().model, c.target, getState().selection);
        if (ids.length) { viewport?.select(ids[0]); } else errors.push('I couldn’t find that part of the building.');
      }
    } else if (cls === 'output') {
      try {
        if (c.type === 'GENERATE_RENDER') notes.push(await actions.capture(c.label));
        else if (c.type === 'SAVE_DESIGN') notes.push(await actions.save());
        else if (c.type === 'CREATE_DESIGN_VARIATION') notes.push(await actions.variation(c.name, c.commands || []));
      } catch (e) { errors.push(e?.message || 'That didn’t work. Try again.'); }
    }
  }
  return { notes: notes.filter(Boolean), errors };
}
