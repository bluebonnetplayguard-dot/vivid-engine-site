import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Box, Download, FileJson, FileSpreadsheet, FileText, Image as ImageIcon, Info, Layers, Link2, RotateCcw, ScanEye } from 'lucide-react';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';
import EngineNav from '@/components/engine/EngineNav';
import EngineFooter from '@/components/engine/EngineFooter';
import ConstructionViewer from '@/components/construction/ConstructionViewer';
import { TYPES, defaults, estimate, generate, cutList, MATERIALS } from '@/construction';
import { ftin } from '@/construction/lumber';
import '@/components/engine/engine.css';
import '@/components/construction/construction.css';

const money = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const PRICE_KEY = 'vivid.construction.prices.v1';
const SETTINGS_KEY = 'vivid.construction.settings.v1';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const csvCell = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
// jsPDF's built-in Helvetica only covers WinAnsi; swap the few symbols it lacks.
const pdfText = t => String(t).replace(/≈/g, '~').replace(/[–—]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF’‘“”•]/g, '');
const toCsv = rows => rows.map(r => r.map(csvCell).join(',')).join('\n');

function readUrl(params) {
  const t = params.get('type');
  if (!TYPES[t]) return null;
  try { return { type: t, opts: { ...defaults(t), ...JSON.parse(atob(params.get('o') || '') || '{}') } }; } catch { return { type: t, opts: defaults(t) }; }
}

function Field({ f, value, onChange }) {
  const id = `cc-${f.key}`;
  if (f.type === 'toggle') return <label className="cc-toggle" htmlFor={id}>
    <span>{f.label}</span>
    <input id={id} type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
    <i aria-hidden="true" />
  </label>;
  if (f.type === 'select') return <label className="cc-field" htmlFor={id}>
    <span>{f.label}</span>
    <select id={id} value={String(value)} onChange={e => onChange(e.target.value)}>
      {f.choices.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  </label>;
  return <label className="cc-field" htmlFor={id}>
    <span>{f.label}<em>{value}{f.unit && (f.unit.startsWith('/') ? f.unit : ` ${f.unit}`)}</em></span>
    <div className="cc-range">
      <input type="range" min={f.min} max={f.max} step={f.step} value={value} onChange={e => onChange(Number(e.target.value))} aria-label={f.label} />
      <input id={id} type="number" min={f.min} max={f.max} step={f.step} value={value} onChange={e => onChange(e.target.value === '' ? f.min : Number(e.target.value))} />
    </div>
  </label>;
}

export default function ConstructionConfigurator() {
  const [params, setParams] = useSearchParams();
  const initial = readUrl(params);
  const [type, setType] = useState(initial?.type || 'shed');
  const [optsByType, setOptsByType] = useState(() => initial ? { [initial.type]: initial.opts } : {});
  const opts = optsByType[type] || defaults(type);
  const setOpt = (k, v) => setOptsByType(s => ({ ...s, [type]: { ...(s[type] || defaults(type)), [k]: v } }));
  const [hidden, setHidden] = useState(() => new Set());
  const [xray, setXray] = useState(false);
  const [tab, setTab] = useState('estimate');
  const [prices, setPrices] = useState(() => load(PRICE_KEY, { lumber: {}, items: {} }));
  const [settings, setSettings] = useState(() => load(SETTINGS_KEY, { laborRate: 65, markup: 20, tax: 8.25, waste: 0 }));
  const [client, setClient] = useState({ name: '', address: '' });
  const [copied, setCopied] = useState(false);
  const viewer = useRef(null);

  const model = useMemo(() => generate(type, opts), [type, opts]);
  const est = useMemo(() => estimate(model, prices, settings), [model, prices, settings]);
  const cuts = useMemo(() => cutList(model), [model]);
  const groups = useMemo(() => [...new Set(model.elements.map(e => e.group.split(' · ')[0]))], [model]);

  useEffect(() => { localStorage.setItem(PRICE_KEY, JSON.stringify(prices)); }, [prices]);
  useEffect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }, [settings]);
  useEffect(() => {
    const t = setTimeout(() => setParams({ type, o: btoa(JSON.stringify(opts)) }, { replace: true }), 250);
    return () => clearTimeout(t);
  }, [type, opts, setParams]);

  const setPrice = (line, v) => {
    const n = Math.max(0, Number(v) || 0);
    if (line.category === 'Lumber') {
      const [, mat, nominal] = line.key.split(':');
      const lf = n / (line.label.match(/x (\d+)'/)?.[1] || 1) / (MATERIALS[mat]?.priceFactor ?? 1);
      setPrices(p => ({ ...p, lumber: { ...p.lumber, [nominal]: +lf.toFixed(4) } }));
    } else setPrices(p => ({ ...p, items: { ...p.items, [line.key]: n } }));
  };
  const toggleGroup = g => setHidden(h => { const n = new Set(h); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const reset = () => setOptsByType(s => ({ ...s, [type]: defaults(type) }));
  const slug = model.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const exportCsv = () => download(`${slug}-estimate.csv`, toCsv([
    ['Category', 'Item', 'Qty', 'Unit', 'Unit price', 'Total'],
    ...est.lines.map(l => [l.category, l.label, l.qty, l.unit, l.price.toFixed(2), l.total.toFixed(2)]),
    [], ['', 'Materials', '', '', '', est.materials.toFixed(2)], ['', `Sales tax ${settings.tax}%`, '', '', '', est.taxAmt.toFixed(2)],
    ['', `Labor ${est.laborHours} h @ ${settings.laborRate}`, '', '', '', est.labor.toFixed(2)], ['', `Markup ${settings.markup}%`, '', '', '', est.markupAmt.toFixed(2)], ['', 'Total', '', '', '', est.total.toFixed(2)],
  ]), 'text/csv');
  const exportCuts = () => download(`${slug}-cut-list.csv`, toCsv([
    ['Assembly', 'Part', 'Size', 'Material', 'Length', 'Length (in)', 'Qty'],
    ...cuts.map(c => [c.group, c.name, c.nominal, MATERIALS[c.material]?.name ?? c.material, ftin(c.lengthIn), c.lengthIn, c.qty]),
  ]), 'text/csv');
  const exportJson = () => download(`${slug}-model.json`, JSON.stringify({ format: 'vivid-construction-model', version: 1, type, title: model.title, options: model.options, units: 'inches', axes: 'x = width, y = depth, z = up', facts: model.facts, notes: model.notes, elements: model.elements }, null, 1), 'application/json');
  const exportPng = () => { const d = viewer.current?.snapshot(); if (d) fetch(d).then(r => r.blob()).then(b => download(`${slug}-3d.png`, b)); };
  const exportPdf = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const W = 612, M = 40; let y = M;
    doc.setFillColor(7, 16, 31); doc.rect(0, 0, W, 70, 'F');
    doc.setTextColor(233, 238, 246); doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('Vivid Engine Solutions', M, 32);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text('Construction estimate', M, 50);
    doc.text(new Date().toLocaleDateString('en-US'), W - M, 50, { align: 'right' });
    y = 96; doc.setTextColor(20, 28, 40); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(pdfText(model.title), M, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    if (client.name || client.address) { y += 15; doc.text(pdfText(`Prepared for: ${[client.name, client.address].filter(Boolean).join(', ')}`), M, y); }
    const img = viewer.current?.snapshot();
    y += 12;
    if (img) { const iw = W - 2 * M, ih = iw * 0.5; doc.addImage(img, 'PNG', M, y, iw, ih); y += ih + 14; }
    doc.setFont('helvetica', 'bold'); doc.text('Design', M, y); doc.setFont('helvetica', 'normal'); y += 13;
    for (const f of model.facts) { doc.text(pdfText(`${f.label}: ${f.value}`), M, y); y += 12; }
    y += 6;
    const head = () => { doc.setFont('helvetica', 'bold'); doc.text('Item', M, y); doc.text('Qty', 400, y, { align: 'right' }); doc.text('Unit price', 480, y, { align: 'right' }); doc.text('Total', W - M, y, { align: 'right' }); doc.setFont('helvetica', 'normal'); y += 4; doc.line(M, y, W - M, y); y += 11; };
    head();
    for (const l of est.lines) {
      if (y > 740) { doc.addPage(); y = M; head(); }
      doc.text(doc.splitTextToSize(pdfText(l.label), 330)[0], M, y); doc.text(pdfText(`${l.qty} ${l.unit}`), 400, y, { align: 'right' });
      doc.text(money(l.price), 480, y, { align: 'right' }); doc.text(money(l.total), W - M, y, { align: 'right' }); y += 12;
    }
    if (y > 650) { doc.addPage(); y = M; }
    y += 4; doc.line(320, y, W - M, y); y += 13;
    for (const [k, v, b] of [['Materials', est.materials], [`Sales tax (${settings.tax}%)`, est.taxAmt], [`Labor (${est.laborHours} h)`, est.labor], [`Overhead & profit (${settings.markup}%)`, est.markupAmt], ['Total', est.total, true]]) {
      doc.setFont('helvetica', b ? 'bold' : 'normal'); doc.text(k, 330, y); doc.text(money(v), W - M, y, { align: 'right' }); y += 13;
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); y += 8;
    const notes = [...model.notes.map(n => n.text), 'This estimate is a planning preview generated from the selected options. Quantities and sizes must be verified, and permit drawings may require a licensed design professional. Prices are valid for 30 days.'];
    for (const n of notes) { const lines = doc.splitTextToSize(pdfText(`• ${n}`), W - 2 * M); if (y + lines.length * 10 > 770) { doc.addPage(); y = M; } doc.text(lines, M, y); y += lines.length * 10 + 2; }
    doc.save(`${slug}-estimate.pdf`);
  };
  const copyLink = async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ } };

  const warns = model.notes.filter(n => n.level === 'warn');
  let section = null;

  return <div className="engine-site">
    <PageMeta {...PAGE_META.construction} />
    <EngineNav />
    <main className="cc-page">
      <header className="cc-hero">
        <span className="engine-caps"><Box size={14} aria-hidden="true" /> Vivid Build Studio · Construction</span>
        <h1>Design it in <span className="engine-blue">3D</span>, price it in seconds</h1>
        <p>Pick a structure, set the options, and get a live framing model with a materials list, cut list and cost estimate you can send to a client.</p>
      </header>

      <div className="cc-types" role="tablist" aria-label="Structure type">
        {Object.entries(TYPES).map(([k, t]) => <button key={k} role="tab" type="button" aria-selected={type === k} className={type === k ? 'is-on' : ''} onClick={() => setType(k)}>
          <b>{t.label}</b><small>{t.blurb}</small>
        </button>)}
      </div>

      <div className="cc-grid">
        <aside className="cc-panel" aria-label="Options">
          <div className="cc-panel-head"><h2>Options</h2><button type="button" className="cc-icon-btn" onClick={reset} title="Reset options"><RotateCcw size={15} /> Reset</button></div>
          {TYPES[type].options.map((f, i) => {
            if (f.section) { section = f.section; return <h3 key={`s${i}`} className="cc-section">{f.section}</h3>; }
            if (type === 'deck' && f.key === 'stairWidth' && !opts.stairs) return null;
            if (type === 'playset' && f.key === 'swingBeamHeight' && !opts.swings) return null;
            return <Field key={`${section}-${f.key}`} f={f} value={opts[f.key]} onChange={v => setOpt(f.key, v)} />;
          })}
        </aside>

        <section className="cc-stage" aria-label="3D model">
          <div className="cc-stage-head">
            <h2>{model.title}</h2>
            <div className="cc-stage-acts">
              <button type="button" className={`cc-icon-btn${xray ? ' is-on' : ''}`} aria-pressed={xray} onClick={() => setXray(x => !x)}><ScanEye size={15} /> X-ray framing</button>
              <div className="cc-views" role="group" aria-label="Camera view">
                {[['iso', '3D'], ['front', 'Front'], ['side', 'Side'], ['top', 'Top']].map(([k, l]) => <button key={k} type="button" className="cc-icon-btn" onClick={() => viewer.current?.resetView(k)}>{l}</button>)}
              </div>
            </div>
          </div>
          <ConstructionViewer ref={viewer} model={model} hidden={hidden} xray={xray} />
          <div className="cc-layers" role="group" aria-label="Layers">
            <Layers size={15} aria-hidden="true" />
            {groups.map(g => <button key={g} type="button" aria-pressed={!hidden.has(g)} className={hidden.has(g) ? '' : 'is-on'} onClick={() => toggleGroup(g)}>{g}</button>)}
          </div>
          <dl className="cc-facts">{model.facts.map(f => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>
          {warns.length > 0 && <div className="cc-warns">{warns.map((n, i) => <p key={i}><AlertTriangle size={15} aria-hidden="true" />{n.text}</p>)}</div>}
        </section>
      </div>

      <section className="cc-results">
        <div className="cc-tabs" role="tablist">
          {[['estimate', 'Materials & cost'], ['cuts', 'Cut list'], ['notes', `Checks & notes (${model.notes.length})`], ['export', 'Export & share']].map(([k, l]) =>
            <button key={k} role="tab" type="button" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{l}</button>)}
        </div>

        {tab === 'estimate' && <div className="cc-est">
          <div className="cc-settings">
            {[['laborRate', 'Labor rate ($/h)', 1], ['markup', 'Overhead & profit (%)', 0.5], ['tax', 'Sales tax on materials (%)', 0.25], ['waste', 'Extra lumber for waste (%)', 1]].map(([k, l, st]) =>
              <label key={k} className="cc-field"><span>{l}</span><input type="number" min="0" step={st} value={settings[k]} onChange={e => setSettings(s => ({ ...s, [k]: Math.max(0, Number(e.target.value) || 0) }))} /></label>)}
            <button type="button" className="cc-icon-btn" onClick={() => setPrices({ lumber: {}, items: {} })} title="Go back to the sample prices"><RotateCcw size={15} /> Sample prices</button>
          </div>
          <p className="cc-note"><Info size={13} aria-hidden="true" /> Prices start as sample numbers. Type your supplier’s prices into the Unit price column; they are saved on this device and used for every model.</p>
          <div className="cc-table-wrap">
            <table className="cc-table">
              <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Total</th></tr></thead>
              <tbody>
                {est.lines.map((l, i) => <tr key={l.key + i} className={i === 0 || est.lines[i - 1].category !== l.category ? 'is-first' : ''}>
                  <td><small>{l.category}</small>{l.label}</td>
                  <td className="num">{l.qty} {l.unit}</td>
                  <td className="num"><input type="number" min="0" step="0.01" value={l.price} onChange={e => setPrice(l, e.target.value)} aria-label={`Unit price for ${l.label}`} /></td>
                  <td className="num">{money(l.total)}</td>
                </tr>)}
              </tbody>
              <tfoot>
                <tr><td colSpan={3}>Materials</td><td className="num">{money(est.materials)}</td></tr>
                <tr><td colSpan={3}>Sales tax ({settings.tax}%)</td><td className="num">{money(est.taxAmt)}</td></tr>
                <tr><td colSpan={3}>Labor ({est.laborHours} h at {money(settings.laborRate)}/h)</td><td className="num">{money(est.labor)}</td></tr>
                <tr><td colSpan={3}>Overhead &amp; profit ({settings.markup}%)</td><td className="num">{money(est.markupAmt)}</td></tr>
                <tr className="is-total"><td colSpan={3}>Estimated total</td><td className="num">{money(est.total)}</td></tr>
              </tfoot>
            </table>
          </div>
        </div>}

        {tab === 'cuts' && <div className="cc-table-wrap">
          <table className="cc-table">
            <thead><tr><th>Assembly</th><th>Part</th><th>Size</th><th className="num">Length</th><th className="num">Qty</th></tr></thead>
            <tbody>{cuts.map((c, i) => <tr key={i}><td>{c.group}</td><td>{c.name}</td><td>{c.nominal} <small>{c.material.toUpperCase()}</small></td><td className="num">{ftin(c.lengthIn)}</td><td className="num">{c.qty}</td></tr>)}</tbody>
          </table>
        </div>}

        {tab === 'notes' && <ul className="cc-notes">
          {model.notes.map((n, i) => <li key={i} className={n.level === 'warn' ? 'is-warn' : ''}>{n.level === 'warn' ? <AlertTriangle size={15} aria-hidden="true" /> : <Info size={15} aria-hidden="true" />}{n.text}</li>)}
          <li><Info size={15} aria-hidden="true" />This model is a planning and estimating preview. Member sizes are rule-of-thumb picks, not engineering. Permit drawings may need a licensed architect or engineer, and every quantity should be checked before ordering.</li>
        </ul>}

        {tab === 'export' && <div className="cc-export">
          <div className="cc-client">
            <label className="cc-field"><span>Client name (for the PDF)</span><input value={client.name} onChange={e => setClient(c => ({ ...c, name: e.target.value }))} placeholder="Optional" /></label>
            <label className="cc-field"><span>Job address</span><input value={client.address} onChange={e => setClient(c => ({ ...c, address: e.target.value }))} placeholder="Optional" /></label>
          </div>
          <div className="cc-export-grid">
            <button type="button" onClick={exportPdf}><FileText size={20} /><b>PDF estimate</b><small>3D view, design summary, priced materials and notes</small></button>
            <button type="button" onClick={exportCsv}><FileSpreadsheet size={20} /><b>Estimate CSV</b><small>Opens in Excel or Google Sheets</small></button>
            <button type="button" onClick={exportCuts}><Download size={20} /><b>Cut list CSV</b><small>Every member with exact lengths</small></button>
            <button type="button" onClick={exportPng}><ImageIcon size={20} /><b>3D image</b><small>PNG of the current view</small></button>
            <button type="button" onClick={exportJson}><FileJson size={20} /><b>Model JSON</b><small>Full geometry for Build Studio or other tools</small></button>
            <button type="button" onClick={copyLink}><Link2 size={20} /><b>{copied ? 'Link copied' : 'Copy share link'}</b><small>Opens this exact design</small></button>
          </div>
          <p className="cc-note">Want it built? <Link to="/contact">Request a build quote</Link> with your share link.</p>
        </div>}
      </section>
    </main>
    <EngineFooter />
  </div>;
}
