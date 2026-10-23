import { Monitor, Settings, Globe, TrendingUp, Search, MapPin } from 'lucide-react';
import { SERVICES } from '@/components/engine/siteContent';
const icons = { Monitor, Settings, Globe, TrendingUp, Search, MapPin };
export default function EngineServices() {
  return <section className="engine-section" id="services"><div className="engine-wrap">
    <div className="engine-head"><span className="engine-caps">What we do</span><h2>Everything your business needs online, <span className="engine-blue">under one roof</span></h2><p>No passing you between five different vendors. One local team designs it, launches it, and keeps it running.</p></div>
    <div className="engine-service-grid">{SERVICES.map(([icon, title, text, meta]) => { const Icon = icons[icon]; return <article className="engine-service" key={title}><Icon className="engine-icon" size={46} strokeWidth={1.6} /><h3>{title}</h3><p>{text}</p><span className="engine-caps engine-service-meta">{meta}</span></article>; })}</div>
  </div></section>;
}