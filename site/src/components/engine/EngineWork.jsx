import { Image } from '@/components/ui/image';
export default function EngineWork() {
  return <section id="work" className="engine-section engine-band"><div className="engine-wrap">
    <div className="engine-head"><span className="engine-caps">Portfolio</span><h2>Most of our clients start here</h2><p>An outdated site quietly costs a business customers every day. This is the kind of turnaround we build toward.</p></div>
    <div className="engine-compare"><article className="engine-pane"><span className="engine-caps">Before · legacy template site</span><div className="engine-shot engine-dated">unmaintained · slow · not mobile-ready</div><p>Avg. load time: <b>6.2s</b> · Mobile score: <b>34/100</b></p></article>
    <article className="engine-pane engine-after"><span className="engine-caps">After · Vivid Engine rebuild</span><Image src="/hero-background.webp" className="engine-shot" alt="Illustrative Vivid Engine design backdrop" /><p>Avg. load time: <b>1.1s</b> · Mobile score: <b>96/100</b></p></article></div>
    <p className="engine-disclaimer">Illustrative before-and-after example, not measured client results.</p>
  </div></section>;
}