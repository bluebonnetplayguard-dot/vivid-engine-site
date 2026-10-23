import { STEPS } from '@/components/engine/siteContent';
export default function EngineProcess() {
  return <section id="process" className="engine-section"><div className="engine-wrap">
    <div className="engine-head"><span className="engine-caps">How it works</span><h2>From first sit-down to turnkey handoff</h2><p>A real, ordered process, not a form you fill out and wait on.</p></div>
    <ol className="engine-steps">{STEPS.map(([title, text], i) => <li className="engine-step" key={title}><span className="engine-caps">STEP {String(i + 1).padStart(2, '0')}</span><h3>{title}</h3><p>{text}</p></li>)}</ol>
  </div></section>;
}