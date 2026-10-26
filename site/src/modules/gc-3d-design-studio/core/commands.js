// Validated command layer. The AI assistant (and the toolbar, and the quick parser) can only change the
// studio by emitting these commands; nothing the AI writes is ever executed as code.
//
// Every command is checked twice: validateCommand() checks its shape, and applyModelCommand() checks it
// against the building (does the window still fit in its wall, is the material allowed on that surface...).
import { MATERIALS, materialAllowed, normalizeColor } from './materials.js';
import { checkOpening, clone, findElement, footprint, newId, wallLength } from './model.js';
import { ftin } from './units.js';

export const COMMAND_TYPES = [
  'SELECT_OBJECT', 'UPDATE_MATERIAL', 'UPDATE_COLOR', 'MOVE_OBJECT', 'RESIZE_OBJECT', 'ADD_COMPONENT', 'REMOVE_COMPONENT',
  'CHANGE_CAMERA', 'SET_VIEW', 'TOGGLE_LAYER', 'SET_LIGHTING', 'GENERATE_RENDER', 'CREATE_DESIGN_VARIATION', 'SAVE_DESIGN',
];
export const CAMERA_PRESETS = ['front', 'back', 'left', 'right', 'top', 'iso', 'ground', 'room', 'rotate'];
export const VIEW_MODES = ['exterior', 'interior', 'dollhouse', 'walkthrough', 'floor', 'perspective', 'orthographic'];
export const LAYERS = ['roof', 'exterior-walls', 'interior-walls', 'openings', 'floors', 'cabinets', 'site', 'dimensions', 'grid'];
export const LIGHTING = ['day', 'sunset', 'evening'];
export const TARGET_KINDS = ['selected', 'roof', 'wall', 'exterior-walls', 'interior-walls', 'window', 'door', 'opening', 'room', 'cabinet', 'countertop', 'component'];
export const FACES = ['front', 'back', 'left', 'right'];
export const ADDABLE = ['covered-patio'];

const CLASS = {
  SELECT_OBJECT: 'view', CHANGE_CAMERA: 'view', SET_VIEW: 'view', TOGGLE_LAYER: 'view', SET_LIGHTING: 'view',
  UPDATE_MATERIAL: 'appearance', UPDATE_COLOR: 'appearance',
  MOVE_OBJECT: 'geometry', RESIZE_OBJECT: 'geometry', ADD_COMPONENT: 'geometry', REMOVE_COMPONENT: 'geometry',
  GENERATE_RENDER: 'output', CREATE_DESIGN_VARIATION: 'output', SAVE_DESIGN: 'output',
};
// view: applied instantly, not saved in the model. appearance: instant, undoable, saved.
// geometry: previewed first and applied only after the contractor approves. output: saves or captures.
export const commandClass = cmd => CLASS[cmd?.type] || 'unknown';

const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

function validateTarget(t) {
  if (!t || typeof t !== 'object') return 'missing target';
  if (t.id != null) return typeof t.id === 'string' && t.id.length < 80 ? null : 'bad target id';
  if (!TARGET_KINDS.includes(t.kind)) return `unknown target kind ${t.kind}`;
  if (t.face != null && !FACES.includes(t.face)) return `unknown face ${t.face}`;
  if (t.floor != null && !['f1', 'f2', 1, 2].includes(t.floor)) return 'unknown floor';
  if (t.name != null && (typeof t.name !== 'string' || t.name.length > 80)) return 'bad name';
  return null;
}

// Shape check. Returns null when the command is well formed, otherwise a short reason.
export function validateCommand(cmd) {
  if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd)) return 'not an object';
  if (!COMMAND_TYPES.includes(cmd.type)) return `unknown command ${cmd.type}`;
  switch (cmd.type) {
    case 'SELECT_OBJECT': return validateTarget(cmd.target);
    case 'UPDATE_MATERIAL': return validateTarget(cmd.target) || (MATERIALS[cmd.material] ? null : `unknown material ${cmd.material}`);
    case 'UPDATE_COLOR': return validateTarget(cmd.target) || (normalizeColor(cmd.color) ? null : `unknown color ${cmd.color}`);
    case 'MOVE_OBJECT': return validateTarget(cmd.target) || ((num(cmd.along ?? 0, -600, 600) && num(cmd.up ?? 0, -120, 120) && (cmd.along || cmd.up)) ? null : 'move needs along and/or up in inches');
    case 'RESIZE_OBJECT': return validateTarget(cmd.target) || (['width', 'height', 'sill', 'depth'].some(k => cmd[k] != null) && ['width', 'height', 'sill', 'depth'].every(k => cmd[k] == null || num(cmd[k], 0, 1200)) ? null : 'resize needs width, height, depth or sill in inches');
    case 'ADD_COMPONENT': return ADDABLE.includes(cmd.component) && ['front', 'back', undefined].includes(cmd.side) && (cmd.width == null || num(cmd.width, 96, 480)) && (cmd.depth == null || num(cmd.depth, 72, 240)) ? null : 'unsupported component';
    case 'REMOVE_COMPONENT': return validateTarget(cmd.target);
    case 'CHANGE_CAMERA': return CAMERA_PRESETS.includes(cmd.preset) ? (cmd.preset === 'rotate' && !num(cmd.degrees, -360, 360) ? 'rotate needs degrees' : null) : `unknown camera preset ${cmd.preset}`;
    case 'SET_VIEW': return VIEW_MODES.includes(cmd.mode) ? null : `unknown view ${cmd.mode}`;
    case 'TOGGLE_LAYER': return LAYERS.includes(cmd.layer) && typeof cmd.visible === 'boolean' ? null : 'unknown layer';
    case 'SET_LIGHTING': return LIGHTING.includes(cmd.preset) ? null : 'unknown lighting';
    case 'GENERATE_RENDER': return cmd.label == null || (typeof cmd.label === 'string' && cmd.label.length <= 120) ? null : 'bad label';
    case 'CREATE_DESIGN_VARIATION': {
      if (typeof cmd.name !== 'string' || !cmd.name.trim() || cmd.name.length > 80) return 'variation needs a name';
      if (cmd.commands != null && (!Array.isArray(cmd.commands) || cmd.commands.length > 20)) return 'bad variation commands';
      for (const c of cmd.commands || []) { if (commandClass(c) !== 'appearance') return 'variations may only change materials and colors'; const e = validateCommand(c); if (e) return e; }
      return null;
    }
    case 'SAVE_DESIGN': return null;
    default: return 'unsupported';
  }
}

const floorOf = f => (f === 1 ? 'f1' : f === 2 ? 'f2' : f);
const norm = s => String(s || '').toLowerCase();

// Target -> element ids. `selection` is the id currently selected in the viewport.
export function resolveTarget(model, target, selection) {
  if (!target) return [];
  if (target.id) return findElement(model, target.id) ? [target.id] : [];
  const floor = floorOf(target.floor);
  const byFloor = el => !floor || el.floor === floor;
  const byName = el => !target.name || norm(el.name).includes(norm(target.name)) || norm(el.type).includes(norm(target.name));
  const byFace = w => !target.face || w.face === target.face;
  switch (target.kind) {
    case 'selected': return selection && findElement(model, selection) ? [selection] : [];
    case 'roof': return model.roofs.map(r => r.id);
    case 'exterior-walls': return model.walls.filter(w => w.exterior && byFloor(w) && byFace(w)).map(w => w.id);
    case 'interior-walls': return model.walls.filter(w => !w.exterior && byFloor(w) && byName(w)).map(w => w.id);
    case 'wall': return model.walls.filter(w => byFloor(w) && byFace(w) && byName(w) && (target.face ? w.exterior : true)).map(w => w.id);
    case 'window': case 'door': case 'opening': {
      const walls = new Map(model.walls.map(w => [w.id, w]));
      return model.openings.filter(o => (target.kind === 'opening' || o.kind === target.kind) && (!target.face || walls.get(o.wall)?.face === target.face)
        && (!floor || walls.get(o.wall)?.floor === floor) && byName(o)).map(o => o.id);
    }
    case 'room': return model.rooms.filter(r => byFloor(r) && byName(r)).map(r => r.id);
    case 'cabinet': case 'countertop': return model.components.filter(c => c.kind === target.kind && byName(c)).map(c => c.id);
    case 'component': return model.components.filter(c => byName(c)).map(c => c.id);
    default: return [];
  }
}

// Which surface of an element a material or color goes on.
export function surfacesOf(model, id) {
  const hit = findElement(model, id);
  if (!hit) return [];
  const { el, kind } = hit;
  if (kind === 'wall') return el.exterior ? ['wall.exterior', 'wall.interior'] : ['wall.interior'];
  if (kind === 'opening') return el.door ? ['opening.frame', 'opening.door'] : ['opening.frame'];
  if (kind === 'roof') return ['roof'];
  if (kind === 'room') return ['room.floor'];
  if (kind === 'component') return [`component.${el.kind}`];
  return [];
}

const FIELD = {
  'wall.exterior': ['finishExterior', 'colorExterior'], 'wall.interior': ['finishInterior', 'colorInterior'],
  'opening.frame': ['frame', 'frameColor'], 'opening.door': ['door', 'doorColor'], roof: ['material', 'color'], 'room.floor': ['floorFinish', 'floorColor'],
};
const fieldFor = surface => FIELD[surface] || (surface.startsWith('component.') ? ['material', 'color'] : null);
const SURFACE_ALIAS = { exterior: 'wall.exterior', interior: 'wall.interior', frame: 'opening.frame', door: 'opening.door', floor: 'room.floor' };

// The material on an element's main surface, for display.
export function materialOf(el, surface) {
  const f = fieldFor(surface);
  return f ? { material: el[f[0]], color: el[f[1]] || MATERIALS[el[f[0]]]?.color } : null;
}

function describe(el) { return el.name || el.id; }

// Apply one model-changing command. Pure: returns a new model, or { error } and the old model untouched.
export function applyModelCommand(model, cmd, { selection } = {}) {
  const shape = validateCommand(cmd);
  if (shape) return { model, error: `I couldn’t use that instruction (${shape}).` };
  const cls = commandClass(cmd);
  if (cls !== 'appearance' && cls !== 'geometry') return { model, error: 'That command doesn’t change the model.' };

  if (cmd.type === 'ADD_COMPONENT') return addCoveredPatio(model, cmd);

  let ids = resolveTarget(model, cmd.target, selection);
  if (!ids.length) return { model, error: cmd.target?.kind === 'selected' ? 'Select something in the model first.' : 'I couldn’t find that part of the building.' };
  const next = clone(model);
  const changes = [];

  if (cls === 'appearance') {
    const color = cmd.type === 'UPDATE_COLOR' ? normalizeColor(cmd.color) : null;
    const wanted = cmd.surface ? SURFACE_ALIAS[cmd.surface] || cmd.surface : null;
    let skipped = 0;
    for (const id of ids) {
      const { el } = findElement(next, id);
      const surfaces = surfacesOf(next, id);
      let surface;
      if (cmd.type === 'UPDATE_MATERIAL') surface = (wanted && surfaces.includes(wanted) && materialAllowed(cmd.material, wanted)) ? wanted : surfaces.find(s => materialAllowed(cmd.material, s));
      else surface = wanted && surfaces.includes(wanted) ? wanted : surfaces[0];
      if (!surface) { skipped++; continue; }
      const [matField, colorField] = fieldFor(surface);
      if (cmd.type === 'UPDATE_MATERIAL') { el[matField] = cmd.material; delete el[colorField]; }
      else el[colorField] = color;
      changes.push(id);
    }
    if (!changes.length) return { model, error: cmd.type === 'UPDATE_MATERIAL' ? `${MATERIALS[cmd.material].name} can’t go on that surface.` : 'That surface can’t be colored.' };
    const what = cmd.type === 'UPDATE_MATERIAL' ? MATERIALS[cmd.material].name.toLowerCase() : `color ${cmd.color}`;
    const label = changes.length === 1 ? describe(findElement(next, changes[0]).el) : `${changes.length} elements`;
    return { model: next, ids: changes, changes: [`${label}: ${what}${skipped ? ` (${skipped} skipped: not allowed there)` : ''}`] };
  }

  // Geometry. Only openings, components and the roof pitch can be edited in this release.
  if (cmd.type === 'REMOVE_COMPONENT') {
    const comps = ids.map(id => findElement(next, id)).filter(h => h?.kind === 'component');
    if (!comps.length) return { model, error: 'Only added components like patios and cabinets can be removed here. Walls and roofs can’t be deleted yet.' };
    if (comps.some(h => ['slab', 'floor-deck'].includes(h.el.kind))) return { model, error: 'The foundation and floor framing can’t be removed.' };
    const groups = new Set(comps.map(h => h.el.group).filter(g => g?.startsWith('add-')));
    const drop = new Set([...comps.map(h => h.el.id), ...next.components.filter(c => groups.has(c.group)).map(c => c.id)]);
    next.components = next.components.filter(c => !drop.has(c.id));
    return { model: next, ids: [...drop], changes: [`Removed ${drop.size === 1 ? describe(comps[0].el) : `${groups.size ? 'the added component' : `${drop.size} components`}`}`] };
  }

  if (ids.length > 1) {
    if (cmd.target?.kind === 'selected' || cmd.target?.id) ids = ids.slice(0, 1);
    else return { model, error: `That matches ${ids.length} elements. Select the one you mean and try again.` };
  }
  const hit = findElement(next, ids[0]);
  const { el, kind } = hit;

  if (kind === 'opening') {
    const before = { offset: el.offset, sill: el.sill, width: el.width, height: el.height };
    if (cmd.type === 'MOVE_OBJECT') { el.offset += cmd.along || 0; if (el.kind === 'window') el.sill += cmd.up || 0; else if (cmd.up) return { model, error: 'Doors stay on the floor; they can only move sideways.' }; }
    else { if (cmd.width != null) el.width = cmd.width; if (cmd.height != null) el.height = cmd.height; if (cmd.sill != null && el.kind === 'window') el.sill = cmd.sill; }
    const problems = checkOpening(next, el);
    if (problems.length) return { model, error: `${describe(el)} can’t change like that: ${problems.join(' ')}` };
    const out = [];
    if (el.offset !== before.offset) { const d = el.offset - before.offset; out.push(`moved ${ftin(Math.abs(d))} ${d < 0 ? 'left' : 'right'} (seen from outside)`); }
    if (el.sill !== before.sill) out.push(`sill ${ftin(before.sill)} → ${ftin(el.sill)}`);
    if (el.width !== before.width) out.push(`width ${ftin(before.width)} → ${ftin(el.width)}`);
    if (el.height !== before.height) out.push(`height ${ftin(before.height)} → ${ftin(el.height)}`);
    if (!out.length) return { model, error: 'Nothing would change.' };
    el.dims = { status: 'conceptual', edited: true };
    return { model: next, ids, changes: [`${describe(el)}: ${out.join(', ')}`] };
  }

  if (kind === 'component' && !['slab', 'floor-deck'].includes(el.kind)) {
    const s = [...el.box.s];
    if (cmd.type === 'MOVE_OBJECT') return { model, error: 'Moving components isn’t supported yet; resize them instead.' };
    if (cmd.width != null) s[0] = cmd.width; if (cmd.depth != null) s[1] = cmd.depth; if (cmd.height != null) s[2] = cmd.height;
    if (s.some(v => !(v >= 1 && v <= 600))) return { model, error: 'That size is out of range.' };
    el.box.s = s;
    return { model: next, ids, changes: [`${describe(el)}: now ${ftin(s[0])} × ${ftin(s[1])} × ${ftin(s[2])}`] };
  }

  if (kind === 'room' || kind === 'wall') {
    return { model, error: 'Moving walls and resizing rooms needs the wall-editing tools, which aren’t in this release yet. You can move and resize windows and doors, and change any finish.' };
  }
  if (kind === 'roof') return { model, error: 'Roof geometry edits aren’t supported yet; you can change its material and color.' };
  return { model, error: 'That element can’t be edited that way yet.' };
}

// A covered patio: 6x6 posts, a beam and a low-slope (2:12) shed roof tied into the wall, over a slab.
function addCoveredPatio(model, cmd) {
  const side = cmd.side || 'back';
  const fp = footprint(model, 'f1');
  const width = cmd.width ?? 192, depth = cmd.depth ?? 120;
  if (width > fp.maxX - fp.minX) return { model, error: `The patio can be at most ${ftin(fp.maxX - fp.minX)} wide (the house width).` };
  const wall = model.walls.find(w => w.exterior && w.floor === 'f1' && w.face === side);
  if (!wall) return { model, error: `There’s no ${side} wall to attach to.` };
  const door = model.openings.find(o => o.wall === wall.id && o.kind === 'door');
  const L = wallLength(wall);
  const center = door ? (side === 'back' ? fp.maxX - door.offset : fp.minX + door.offset) : (fp.minX + fp.maxX) / 2;
  const cx = Math.min(fp.maxX - width / 2, Math.max(fp.minX + width / 2, center));
  const face = side === 'back' ? fp.maxY + wall.thickness / 2 : fp.minY - wall.thickness / 2;
  const sgn = side === 'back' ? 1 : -1;
  const outer = face + sgn * depth;
  const group = `add-${newId('patio')}`;
  const ledgerZ = 112, postH = ledgerZ - (depth * 2) / 12 - 8;   // roof falls 2" per foot, minus beam
  if (postH < 84) return { model, error: 'That patio is too deep for a 2:12 roof under the second floor; try a shallower depth.' };
  const comps = [];
  const nPosts = width > 216 ? 3 : 2;
  for (let i = 0; i < nPosts; i++) {
    const x = cx - width / 2 + 6 + (i * (width - 12)) / (nPosts - 1);
    comps.push({ id: newId('post'), kind: 'patio-post', floor: 'f1', name: `Patio post ${i + 1}`, box: { c: [x, outer - sgn * 6, postH / 2], s: [5.5, 5.5, postH] }, material: 'board-batten', color: '#f4f4f1', group, dims: { status: 'conceptual' } });
  }
  comps.push({ id: newId('beam'), kind: 'patio-post', floor: 'f1', name: 'Patio beam', box: { c: [cx, outer - sgn * 6, postH + 4], s: [width, 5.5, 8] }, material: 'board-batten', color: '#f4f4f1', group, dims: { status: 'conceptual' } });
  const run = depth + 12, angle = Math.atan2(2, 12), slope = run / Math.cos(angle);
  const zMid = ledgerZ - (run / 2) * (2 / 12) + 2;
  comps.push({ id: newId('proof'), kind: 'patio-roof', floor: 'f1', name: 'Patio roof', box: { c: [cx, face + sgn * run / 2, zMid], s: [width + 12, slope, 4], r: [sgn * -angle, 0, 0] }, material: 'standing-seam', group, dims: { status: 'conceptual' } });
  const hasSlab = model.components.some(c => c.kind === 'patio' && Math.abs(c.box.c[1] - (face + sgn * depth / 2)) < depth);
  if (!hasSlab) comps.push({ id: newId('pslab'), kind: 'patio', floor: 'f1', name: 'Patio slab', box: { c: [cx, face + sgn * depth / 2, -2], s: [width, depth, 4] }, material: 'concrete', group, dims: { status: 'conceptual' } });
  const next = clone(model);
  next.components.push(...comps);
  return { model: next, ids: comps.map(c => c.id), changes: [`Added a ${ftin(width)} × ${ftin(depth)} covered patio on the ${side} (${nPosts} posts, 2:12 metal roof${hasSlab ? ', over the existing slab' : ', new slab'})`], focus: comps[0].id, wallLength: L };
}

// Run a list of model commands in order, stopping at the first error.
export function applyAll(model, cmds, ctx) {
  let m = model; const changes = []; const ids = [];
  for (const c of cmds) {
    const r = applyModelCommand(m, c, ctx);
    if (r.error) return { model, error: r.error, changes };
    m = r.model; changes.push(...r.changes); ids.push(...(r.ids || []));
  }
  return { model: m, changes, ids };
}

// Material/color presets for whole-house styles. Appearance-only, so they never move geometry.
export const STYLE_PRESETS = {
  'modern farmhouse': [
    { type: 'UPDATE_MATERIAL', target: { kind: 'exterior-walls' }, material: 'board-batten' }, { type: 'UPDATE_COLOR', target: { kind: 'exterior-walls' }, color: 'white' },
    { type: 'UPDATE_MATERIAL', target: { kind: 'roof' }, material: 'standing-seam' }, { type: 'UPDATE_COLOR', target: { kind: 'roof' }, color: 'black' },
    { type: 'UPDATE_MATERIAL', target: { kind: 'window' }, material: 'aluminum-frame' }, { type: 'UPDATE_COLOR', target: { kind: 'door', name: 'front door' }, color: 'black', surface: 'door' },
  ],
  contemporary: [
    { type: 'UPDATE_MATERIAL', target: { kind: 'exterior-walls' }, material: 'stucco' }, { type: 'UPDATE_COLOR', target: { kind: 'exterior-walls' }, color: 'off white' },
    { type: 'UPDATE_MATERIAL', target: { kind: 'exterior-walls', floor: 'f1', face: 'front' }, material: 'metal-panel' }, { type: 'UPDATE_COLOR', target: { kind: 'exterior-walls', floor: 'f1', face: 'front' }, color: 'charcoal' },
    { type: 'UPDATE_MATERIAL', target: { kind: 'roof' }, material: 'standing-seam' }, { type: 'UPDATE_COLOR', target: { kind: 'roof' }, color: 'charcoal' },
    { type: 'UPDATE_MATERIAL', target: { kind: 'window' }, material: 'aluminum-frame' },
  ],
  traditional: [
    { type: 'UPDATE_MATERIAL', target: { kind: 'exterior-walls' }, material: 'brick' }, { type: 'UPDATE_MATERIAL', target: { kind: 'roof' }, material: 'asphalt-shingle' },
    { type: 'UPDATE_MATERIAL', target: { kind: 'window' }, material: 'vinyl-frame' },
  ],
  craftsman: [
    { type: 'UPDATE_MATERIAL', target: { kind: 'exterior-walls' }, material: 'fiber-cement-lap' }, { type: 'UPDATE_COLOR', target: { kind: 'exterior-walls' }, color: 'sage' },
    { type: 'UPDATE_MATERIAL', target: { kind: 'exterior-walls', floor: 'f1' }, material: 'stone' },
    { type: 'UPDATE_MATERIAL', target: { kind: 'roof' }, material: 'asphalt-shingle' }, { type: 'UPDATE_MATERIAL', target: { kind: 'window' }, material: 'wood-frame' },
  ],
  coastal: [
    { type: 'UPDATE_MATERIAL', target: { kind: 'exterior-walls' }, material: 'fiber-cement-lap' }, { type: 'UPDATE_COLOR', target: { kind: 'exterior-walls' }, color: 'sky blue' },
    { type: 'UPDATE_MATERIAL', target: { kind: 'roof' }, material: 'standing-seam' }, { type: 'UPDATE_COLOR', target: { kind: 'roof' }, color: 'light gray' },
    { type: 'UPDATE_MATERIAL', target: { kind: 'window' }, material: 'vinyl-frame' },
  ],
};
