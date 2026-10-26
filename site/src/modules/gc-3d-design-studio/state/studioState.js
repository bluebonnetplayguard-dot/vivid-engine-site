// Studio state: the building model with undo/redo, the pending geometry proposal, selection and view.
import { clone } from '../core/model.js';

const MAX_HISTORY = 60;

export const initialView = { mode: 'exterior', floor: null, lighting: 'day', projection: 'perspective', measuring: false,
  layers: { roof: true, 'exterior-walls': true, 'interior-walls': true, openings: true, floors: true, cabinets: true, site: true, dimensions: false, grid: false } };

export function initialState(model) {
  return { model, past: [], future: [], selection: null, proposal: null, dirty: false, design: null, project: null, view: initialView, savedAt: null };
}

export function reducer(state, a) {
  switch (a.type) {
    case 'LOAD': return { ...initialState(a.model), design: a.design ?? null, project: a.project ?? state.project, view: { ...state.view, ...(a.view || {}) } };
    case 'APPLY': return { ...state, model: a.model, past: [...state.past, state.model].slice(-MAX_HISTORY), future: [], dirty: true, proposal: null };
    case 'UNDO': {
      if (!state.past.length) return state;
      return { ...state, model: state.past[state.past.length - 1], past: state.past.slice(0, -1), future: [state.model, ...state.future], dirty: true, proposal: null };
    }
    case 'REDO': {
      if (!state.future.length) return state;
      return { ...state, model: state.future[0], future: state.future.slice(1), past: [...state.past, state.model], dirty: true, proposal: null };
    }
    case 'PROPOSE': return { ...state, proposal: { model: a.model, changes: a.changes, ids: a.ids, focus: a.focus } };
    case 'ACCEPT': return state.proposal ? { ...state, model: state.proposal.model, past: [...state.past, state.model].slice(-MAX_HISTORY), future: [], proposal: null, dirty: true } : state;
    case 'DISCARD': return { ...state, proposal: null };
    case 'SELECT': return { ...state, selection: a.id };
    case 'VIEW': return { ...state, view: { ...state.view, ...a.patch, layers: { ...state.view.layers, ...(a.patch.layers || {}) } } };
    case 'SAVED': return { ...state, dirty: false, design: { ...state.design, ...a.design }, savedAt: Date.now() };
    case 'PROJECT': return { ...state, project: a.project };
    default: return state;
  }
}

export const snapshot = state => ({ model: clone(state.model), view: { lighting: state.view.lighting, layers: state.view.layers } });
