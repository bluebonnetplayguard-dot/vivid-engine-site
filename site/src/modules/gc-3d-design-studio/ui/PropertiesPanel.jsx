import { useEffect, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BadgeCheck, CircleDashed, X } from 'lucide-react';
import { findElement, measure } from '../core/model.js';
import { materialOf, surfacesOf } from '../core/commands.js';
import { CATEGORIES, COLORS, MATERIALS, materialsFor } from '../core/materials.js';
import { ftin, parseLength, sqft } from '../core/units.js';

const SURFACE_LABEL = { 'wall.exterior': 'Exterior finish', 'wall.interior': 'Interior finish', 'opening.frame': 'Frame', 'opening.door': 'Door', roof: 'Roofing', 'room.floor': 'Flooring' };
const SWATCHES = ['white', 'off white', 'cream', 'beige', 'greige', 'light gray', 'gray', 'charcoal', 'black', 'navy', 'blue', 'sage', 'green', 'red', 'brown', 'tan'];
const KIND_LABEL = { wall: 'Wall', opening: 'Opening', room: 'Room', roof: 'Roof', component: 'Component', floor: 'Floor' };

function fmt([, v, t]) { return t === 'len' ? ftin(v) : t === 'area' ? sqft(v) : String(v); }

function LengthInput({ label, value, onCommit }) {
  const [text, setText] = useState(ftin(value));
  useEffect(() => setText(ftin(value)), [value]);
  const commit = () => {
    const raw = text.trim();
    const v = /^\d+(\.\d+)?$/.test(raw) ? parseFloat(raw) : parseLength(raw);   // bare numbers are inches
    if (v == null || !Number.isFinite(v)) { setText(ftin(value)); return; }
    if (Math.abs(v - value) > 0.01) onCommit(v); else setText(ftin(value));
  };
  return <label className="gcs-field"><span>{label}</span>
    <input value={text} onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} inputMode="decimal" aria-label={`${label} (for example 3' 6" or 42)`} />
  </label>;
}

export default function PropertiesPanel({ model, selection, onRun, onClose }) {
  const hit = selection ? findElement(model, selection) : null;
  if (!hit) return <div className="gcs-props is-empty"><p>Tap a wall, window, door, roof, room or cabinet to see its sizes and finishes.</p></div>;
  const { el, kind } = hit;
  const m = measure(model, el.id);
  const surfaces = surfacesOf(model, el.id);
  const target = { id: el.id };
  const geo = cmd => onRun([{ ...cmd, target }]);

  return <div className="gcs-props">
    <div className="gcs-props-head">
      <div><small>{KIND_LABEL[kind]}{el.kind && kind !== 'wall' ? ` · ${el.kind}` : ''}</small><h3>{el.name}</h3></div>
      {onClose && <button type="button" className="gcs-icon" onClick={onClose} aria-label="Clear selection"><X size={16} /></button>}
    </div>
    <p className={`gcs-badge ${m.status === 'verified' ? 'is-ok' : ''}`}>
      {m.status === 'verified' ? <><BadgeCheck size={14} aria-hidden="true" />Verified against {el.dims?.ref || 'drawings'}</> : <><CircleDashed size={14} aria-hidden="true" />Conceptual size{el.dims?.edited ? ' (edited)' : ''}: not from construction documents</>}
    </p>

    <table className="gcs-dims"><tbody>{m.rows.map(r => <tr key={r[0]}><th scope="row">{r[0]}</th><td>{fmt(r)}</td></tr>)}</tbody></table>

    {kind === 'opening' && <div className="gcs-edit">
      <h4>Position and size <small>(preview, then apply)</small></h4>
      <div className="gcs-nudge" role="group" aria-label="Move">
        <button type="button" onClick={() => geo({ type: 'MOVE_OBJECT', along: -6 })}><ArrowLeft size={15} aria-hidden="true" />6"</button>
        <button type="button" onClick={() => geo({ type: 'MOVE_OBJECT', along: 6 })}>6"<ArrowRight size={15} aria-hidden="true" /></button>
        {el.kind === 'window' && <><button type="button" onClick={() => geo({ type: 'MOVE_OBJECT', up: 2 })}><ArrowUp size={15} aria-hidden="true" />2"</button>
          <button type="button" onClick={() => geo({ type: 'MOVE_OBJECT', up: -2 })}><ArrowDown size={15} aria-hidden="true" />2"</button></>}
      </div>
      <p className="gcs-hint">Left and right are as seen from outside.</p>
      <div className="gcs-fields">
        <LengthInput label="Width" value={el.width} onCommit={v => geo({ type: 'RESIZE_OBJECT', width: v })} />
        <LengthInput label="Height" value={el.height} onCommit={v => geo({ type: 'RESIZE_OBJECT', height: v })} />
        {el.kind === 'window' && <LengthInput label="Sill" value={el.sill} onCommit={v => geo({ type: 'RESIZE_OBJECT', sill: v })} />}
      </div>
    </div>}

    {kind === 'component' && !['slab', 'floor-deck'].includes(el.kind) && <div className="gcs-edit">
      <h4>Size <small>(preview, then apply)</small></h4>
      <div className="gcs-fields">
        <LengthInput label="Width" value={el.box.s[0]} onCommit={v => geo({ type: 'RESIZE_OBJECT', width: v })} />
        <LengthInput label="Depth" value={el.box.s[1]} onCommit={v => geo({ type: 'RESIZE_OBJECT', depth: v })} />
        <LengthInput label="Height" value={el.box.s[2]} onCommit={v => geo({ type: 'RESIZE_OBJECT', height: v })} />
      </div>
      {el.group?.startsWith('add-') && <button type="button" className="gcs-btn is-quiet" onClick={() => geo({ type: 'REMOVE_COMPONENT' })}>Remove this addition</button>}
    </div>}
    {(kind === 'wall' || kind === 'room') && <p className="gcs-hint">Moving walls and resizing rooms comes with the wall-editing tools in a later release. Finishes can be changed now.</p>}

    {surfaces.filter(s => s !== 'glass').map(surface => {
      const cur = materialOf(el, surface);
      const options = materialsFor(surface);
      if (!cur || !options.length) return null;
      const cat = MATERIALS[cur.material]?.category;
      return <div className="gcs-edit" key={surface}>
        <h4>{SURFACE_LABEL[surface] || CATEGORIES[cat]?.label || 'Finish'}</h4>
        <div className="gcs-mats" role="radiogroup" aria-label={SURFACE_LABEL[surface] || 'Material'}>
          {options.map(o => <button type="button" role="radio" aria-checked={cur.material === o.id} key={o.id} className={cur.material === o.id ? 'is-on' : ''}
            onClick={() => onRun([{ type: 'UPDATE_MATERIAL', target, material: o.id, surface: surface.split('.')[1] || undefined }])}>
            <i style={{ background: o.color }} aria-hidden="true" />{o.name}
          </button>)}
        </div>
        <div className="gcs-swatches" aria-label="Color">
          {SWATCHES.map(c => <button type="button" key={c} title={c} aria-label={`Color ${c}`} style={{ background: COLORS[c] }} className={cur.color?.toLowerCase() === COLORS[c] ? 'is-on' : ''}
            onClick={() => onRun([{ type: 'UPDATE_COLOR', target, color: c, surface: surface.split('.')[1] || undefined }])} />)}
          <label className="gcs-custom-color" title="Custom color"><input type="color" value={cur.color || '#cccccc'} aria-label="Custom color"
            onChange={e => onRun([{ type: 'UPDATE_COLOR', target, color: e.target.value, surface: surface.split('.')[1] || undefined }])} /></label>
        </div>
      </div>;
    })}
  </div>;
}
