// Free, instant, offline parser for common studio requests ("show me the front", "make the roof black metal",
// "move this window two feet to the left"). It produces the same validated commands as the AI assistant.
// Anything it can't read with confidence goes to the server-side AI interpreter instead.
import { COLORS } from './materials.js';
import { STYLE_PRESETS } from './commands.js';
import { parseLength } from './units.js';

const has = (t, re) => re.test(t);
const COLOR_WORDS = Object.keys(COLORS).sort((a, b) => b.length - a.length);
const findColor = t => COLOR_WORDS.find(c => new RegExp(`\\b${c}\\b`).test(t)) || null;

// Surface words -> target + which material ids words map to on that surface.
const SURFACES = [
  { re: /\b(roof|roofing)\b/, target: { kind: 'roof' }, mats: [[/standing[- ]seam|metal|tin/, 'standing-seam'], [/clay|tile|spanish/, 'clay-tile'], [/cedar|shake/, 'cedar-shake'], [/shingle|asphalt|composition/, 'asphalt-shingle']] },
  { re: /\b(windows?|window frames?|frames?)\b/, target: { kind: 'window' }, mats: [[/alumin|metal/, 'aluminum-frame'], [/wood/, 'wood-frame'], [/vinyl/, 'vinyl-frame']], defaultColorMat: null },
  { re: /\bfront door\b/, target: { kind: 'door', name: 'front door' }, surface: 'door', mats: [[/wood|stain/, 'wood-door'], [/steel|metal/, 'steel-door'], [/glass/, 'glass-door']] },
  { re: /\b(doors?)\b/, target: { kind: 'door' }, surface: 'door', mats: [[/wood|stain/, 'wood-door'], [/steel|metal/, 'steel-door'], [/glass/, 'glass-door']] },
  { re: /\b(cabinets?|cabinetry)\b/, target: { kind: 'cabinet' }, mats: [[/walnut|wood|stain/, 'walnut-cabinet'], [/navy|blue/, 'shaker-navy'], [/white|shaker/, 'shaker-white']], colorIsMaterial: true },
  { re: /\b(counter ?tops?|counters?)\b/, target: { kind: 'countertop' }, mats: [[/quartz/, 'quartz-white'], [/granite/, 'granite-black'], [/butcher|wood/, 'butcher-block']] },
  { re: /\b(floors?|flooring)\b/, target: { kind: 'room' }, mats: [[/carpet/, 'carpet'], [/lvp|vinyl plank|luxury vinyl/, 'lvp-gray'], [/tile|porcelain/, 'tile-floor'], [/hardwood|oak|wood/, 'oak-floor']] },
  { re: /\b(interior walls?|inside walls?|paint inside|interior paint)\b/, target: { kind: 'interior-walls' }, surface: 'interior', mats: [[/shiplap/, 'shiplap'], [/drywall|paint/, 'drywall']] },
  { re: /\b(siding|exterior|outside walls?|walls?|house|facade|brick|stone|stucco|board and batten)\b/, target: { kind: 'exterior-walls' }, mats: [[/painted brick|white brick/, 'brick-white'], [/brick/, 'brick'], [/stone/, 'stone'], [/stucco/, 'stucco'], [/board[- ]and[- ]batten|batten/, 'board-batten'], [/hardie|fiber[- ]cement|lap/, 'fiber-cement-lap'], [/metal/, 'metal-panel'], [/vinyl/, 'vinyl-lap']] },
];

const ROOM_WORDS = [['kitchen', 'kitchen'], ['living', 'living'], ['family', 'family'], ['dining', 'dining'], ['primary|master', 'primary'], ['bath', 'bath'], ['bedroom 2|second bedroom', 'bedroom 2'], ['bedroom 3|third bedroom', 'bedroom 3'], ['bedroom', 'bedroom']];
const roomIn = t => { for (const [re, name] of ROOM_WORDS) if (new RegExp(`\\b(${re})\\b`).test(t)) return name; return null; };

function surfaceCommands(seg, ctx) {
  const thisOne = /\b(this|that|it|selected)\b/.test(seg);
  let surf = SURFACES.find(s => s.re.test(seg));
  let target;
  if (surf) target = { ...surf.target };
  if (thisOne && (!surf || /\b(this|that) (one|wall|window|door|element|part|cabinet|floor|roof)\b|\bselected\b/.test(seg))) target = { kind: 'selected' };
  if (!surf && !thisOne) return [];
  if (!surf && thisOne) surf = SURFACES.find(s => s.target.kind === ctx.selectionKind) || null;
  const room = roomIn(seg);
  if (surf?.target.kind === 'room' && room && target.kind !== 'selected') target.name = room;
  if (surf?.target.kind === 'cabinet' && room) { /* cabinets are all in the kitchen */ }
  const out = [];
  const mat = surf?.mats.find(([re]) => re.test(seg))?.[1];
  const color = findColor(seg.replace(/\bwhite brick\b|\bpainted brick\b/, ''));
  const colorConsumed = surf?.colorIsMaterial && mat && /navy|white|blue/.test(seg);
  if (mat) out.push({ type: 'UPDATE_MATERIAL', target, material: mat, ...(surf.surface ? { surface: surf.surface } : {}) });
  if (color && !colorConsumed && !(mat === 'brick-white')) out.push({ type: 'UPDATE_COLOR', target, color, ...(surf?.surface ? { surface: surf.surface } : {}) });
  return out;
}

const TITLE = s => s.replace(/\b\w/g, c => c.toUpperCase());

export function quickParse(input, ctx = {}) {
  const raw = String(input || '').trim();
  const t = raw.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ');
  if (!t) return null;
  const cmds = [];
  let reply = '';

  // Saving and images
  if (has(t, /^(save|save (the |this )?design|save it|save changes)\b/)) return { commands: [{ type: 'SAVE_DESIGN' }], reply: 'Saving the design.' };
  if (has(t, /\b(presentation image|take a (picture|photo|snapshot)|screenshot|capture( the)? (view|image)|render( this| it| an image| the view)?$|create (a |an )?(image|render|picture))\b/)) {
    return { commands: [{ type: 'GENERATE_RENDER', label: 'Presentation view' }], reply: 'Capturing a presentation image from this view.' };
  }

  // Whole-house styles
  for (const style of Object.keys(STYLE_PRESETS)) {
    if (!t.includes(style)) continue;
    if (has(t, /\b(version|variation|option|alternative)\b/)) return { commands: [{ type: 'CREATE_DESIGN_VARIATION', name: `${TITLE(style)} version`, commands: STYLE_PRESETS[style] }], reply: `Creating a ${style} variation (materials and colors only; the geometry stays the same).` };
    return { commands: STYLE_PRESETS[style], reply: `Applying a ${style} palette to the finishes.` };
  }
  if (has(t, /\b(more )?modern\b/) && has(t, /\b(look|make|style)\b/) && !has(t, /farmhouse/)) return { commands: STYLE_PRESETS.contemporary, reply: 'Applying a contemporary palette to the finishes.' };

  // "Show me a brick version", "a white siding option"
  const variation = t.match(/\b(?:show me |create |make )?an? (.+?) (version|variation|option)\b/);
  if (variation) {
    const inner = surfaceCommands(variation[1], ctx);
    if (inner.length) return { commands: [{ type: 'CREATE_DESIGN_VARIATION', name: `${TITLE(variation[1])} version`, commands: inner }], reply: `Creating a ${variation[1]} variation as a separate design so you can compare.` };
  }

  // Adding a covered patio / porch
  if (has(t, /\badd\b/) && has(t, /\b(covered )?(patio|porch|pergola)\b/)) {
    const side = has(t, /\bfront\b/) ? 'front' : 'back';
    const m = t.match(/(\d+(?:\.\d+)?)\s*(?:x|by)\s*(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')?/);
    const extra = m ? { width: Math.round(parseFloat(m[1]) * 12), depth: Math.round(parseFloat(m[2]) * 12) } : has(t, /\b(large|big)\b/) ? { width: 288, depth: 144 } : {};
    return { commands: [{ type: 'ADD_COMPONENT', component: 'covered-patio', side, ...extra }], reply: `Here’s a proposed covered patio on the ${side}. Review it, then apply or discard.` };
  }
  if (has(t, /\b(remove|delete|take off)\b/) && has(t, /\b(patio|porch|this)\b/) && !has(t, /\broof\b/)) {
    return { commands: [{ type: 'REMOVE_COMPONENT', target: has(t, /\bthis\b/) ? { kind: 'selected' } : { kind: 'component', name: 'patio' } }], reply: 'Proposed removal. Review it, then apply or discard.' };
  }

  // Moving and resizing (geometry: previewed before it's applied)
  const len = parseLength(t);
  if (has(t, /\b(move|shift|slide|raise|lower)\b/) && (len != null || has(t, /\b(a bit|little)\b/))) {
    const d = len ?? 6;
    const target = has(t, /\b(this|it|selected)\b/) || !SURFACES.some(s => s.re.test(t)) ? { kind: 'selected' } : { kind: has(t, /door/) ? 'door' : 'window', ...(roomIn(t) ? { name: roomIn(t) } : {}) };
    let move = null;
    if (has(t, /\bleft\b/)) move = { along: -d }; else if (has(t, /\bright\b/)) move = { along: d };
    else if (has(t, /\b(up|raise|higher)\b/)) move = { up: d }; else if (has(t, /\b(down|lower)\b/)) move = { up: -d };
    if (move) return { commands: [{ type: 'MOVE_OBJECT', target, ...move }], reply: 'Proposed move. Check the preview, then apply or discard.' };
  }
  if (has(t, /\b(make|increase|decrease|change|set|resize|widen|enlarge)\b/) && len != null && has(t, /\b(wide|width|tall|height|high|deep|depth|sill)\b/)) {
    const target = has(t, /\broom\b/) && !has(t, /\b(this|it)\b/) ? { kind: 'room', ...(roomIn(t) ? { name: roomIn(t) } : {}) } : { kind: 'selected' };
    const key = has(t, /\b(wide|width)\b/) ? 'width' : has(t, /\bsill\b/) ? 'sill' : has(t, /\b(deep|depth)\b/) ? 'depth' : 'height';
    return { commands: [{ type: 'RESIZE_OBJECT', target, [key]: len }], reply: 'Proposed size change. Check the preview, then apply or discard.' };
  }

  // Camera and views
  const room = roomIn(t);
  if (room && has(t, /\b(show|go|take|see|view|walk|look|open)\b/) && !SURFACES.slice(0, 8).some(s => s.re.test(t))) {
    return { commands: [{ type: 'SET_VIEW', mode: 'interior' }, { type: 'CHANGE_CAMERA', preset: 'room', room }], reply: `Going to the ${room}.` };
  }
  if (has(t, /\b(remove|hide|take off|lift|without)\b.*\broof\b|\bdollhouse\b|\bsee the (floor ?plan|layout)\b/)) {
    cmds.push({ type: 'SET_VIEW', mode: 'dollhouse' }); reply = 'Roof off: dollhouse view.';
  } else if (has(t, /\b(put|bring|show|add)\b.*\broof\b.*\b(back|on)\b|\bshow the roof\b/)) {
    cmds.push({ type: 'SET_VIEW', mode: 'exterior' }); reply = 'Roof back on.';
  }
  if (has(t, /\b(walk ?through|first[- ]person|walk around inside)\b/)) { cmds.push({ type: 'SET_VIEW', mode: 'walkthrough' }); reply = 'Walkthrough mode: drag to look around, use the arrows or W A S D to walk.'; }
  if (has(t, /\b(first|1st|ground|downstairs|main) floor\b|\bfloor ?plan\b/) && !cmds.length) { cmds.push({ type: 'SET_VIEW', mode: 'floor', floor: 1 }); reply = 'First floor plan.'; }
  if (has(t, /\b(second|2nd|upper) floor\b|\bupstairs\b/) && !cmds.length) { cmds.push({ type: 'SET_VIEW', mode: 'floor', floor: 2 }); reply = 'Second floor plan.'; }
  if (has(t, /\borthographic\b/)) cmds.push({ type: 'SET_VIEW', mode: 'orthographic' });
  if (has(t, /\bperspective\b/)) cmds.push({ type: 'SET_VIEW', mode: 'perspective' });

  const rot = t.match(/\b(rotate|turn|spin|swing)\b(?:.*?\b(left|right)\b)?(?:.*?(\d+)\s*(?:degrees|deg|°))?/);
  if (rot && !has(t, /\bwindow|door\b/)) {
    const deg = rot[3] ? parseInt(rot[3], 10) : 45;
    cmds.push({ type: 'CHANGE_CAMERA', preset: 'rotate', degrees: rot[2] === 'left' ? -deg : deg }); reply = reply || `Rotating the house ${rot[2] || 'right'} ${deg}°.`;
  } else {
    const view = t.match(/\b(front|back|rear|left side|right side|left|right|top|above|overhead|aerial|bird'?s[- ]eye|street|ground level|eye level|corner|three[- ]quarter)\b/);
    if (view && has(t, /\b(show|view|see|look|go|take|camera|from|switch|move to|what)\b/) && !SURFACES.slice(0, 8).some(s => s.re.test(t.replace(/\bhouse\b/, '')))) {
      const v = view[1];
      const preset = /front/.test(v) ? 'front' : /back|rear/.test(v) ? 'back' : /left/.test(v) ? 'left' : /right/.test(v) ? 'right' : /aerial|bird|drone/.test(v) ? 'aerial' : /top|above|overhead/.test(v) ? 'top' : /street|ground|eye/.test(v) ? 'ground' : 'iso';
      if (!cmds.some(c => c.type === 'SET_VIEW')) cmds.push({ type: 'SET_VIEW', mode: 'exterior' });
      cmds.push({ type: 'CHANGE_CAMERA', preset }); reply = reply || `Showing the ${preset === 'iso' ? 'corner' : preset === 'ground' ? 'street-level' : preset === 'aerial' ? 'aerial (bird’s-eye)' : preset} view.`;
    }
  }
  if (has(t, /\b(inside|interior)\b/) && !cmds.length && !SURFACES.slice(0, 8).some(s => s.re.test(t))) { cmds.push({ type: 'SET_VIEW', mode: 'interior' }); reply = 'Interior view.'; }
  if (has(t, /\b(outside|exterior view)\b/) && !cmds.length && !has(t, /siding|walls?/)) { cmds.push({ type: 'SET_VIEW', mode: 'exterior' }, { type: 'CHANGE_CAMERA', preset: 'iso' }); reply = 'Exterior view.'; }

  // Lighting
  if (has(t, /\bsunset|golden hour|dusk\b/)) { cmds.push({ type: 'SET_LIGHTING', preset: 'sunset' }); reply = reply || 'Sunset lighting.'; }
  else if (has(t, /\b(evening|night|nighttime)\b/)) { cmds.push({ type: 'SET_LIGHTING', preset: 'evening' }); reply = reply || 'Evening lighting.'; }
  else if (has(t, /\b(daytime|daylight|noon|midday|day time)\b/)) { cmds.push({ type: 'SET_LIGHTING', preset: 'day' }); reply = reply || 'Daylight.'; }

  if (has(t, /\b(completed|finished|final)\b.*\b(building|house|home)\b|\bwhat (it|the house|the building) will look like\b/)) {
    return { commands: [{ type: 'SET_VIEW', mode: 'exterior' }, { type: 'SET_LIGHTING', preset: 'day' }, { type: 'CHANGE_CAMERA', preset: 'iso' }], reply: 'Here’s the finished exterior in daylight. Tap Render to save a presentation image.' };
  }
  if (cmds.length) return { commands: cmds, reply };

  // Materials and colors. Split "white siding, black windows and a metal roof" into parts.
  if (has(t, /\b(change|make|paint|switch|use|turn|set|color|colour|put|give|try|want|go with|swap|replace)\b|\bto (a |an )?\w+$|^(white|black|gray|grey|brick|stone|metal)\b/)) {
    const segs = t.split(/,|;|\band\b|\bwith\b|\bplus\b/).map(s => s.trim()).filter(Boolean);
    let all = [];
    for (const s of segs) all.push(...surfaceCommands(s, ctx));
    if (!all.length) all = surfaceCommands(t, ctx);
    if (all.length) return { commands: all, reply: 'Updating the finishes.' };
  }
  return null;
}
