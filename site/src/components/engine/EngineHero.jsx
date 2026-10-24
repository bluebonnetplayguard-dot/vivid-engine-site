import { Calendar, MapPin } from 'lucide-react';
import { Image } from '@/components/ui/image';

export default function EngineHero() {
  return <><section className="engine-hero" id="top">
    <Image src="/hero-background.webp" className="engine-backdrop" alt="" aria-hidden="true" />
    <div className="engine-wrap engine-hero-content">
      <Image src="/logo-400.webp" className="engine-hero-logo" alt="Vivid Engine logo" fittingType="fit" />
      <h1>Web Design &amp; App Development in <span className="engine-blue">Beaumont &amp; Lake Charles</span></h1>
      <p className="engine-tag">Locally owned. Personally built.<br />Professionally maintained.</p>
      <p className="engine-hero-services">Website Design · Website Maintenance · Domain Leasing<br />Business Solutions · In-Person Consultations</p>
      <a className="engine-button engine-primary" href="/quote"><Calendar size={18} />Let’s build your online presence</a>
      <p className="engine-location"><MapPin size={16} />Serving SE Texas &amp; SW Louisiana</p>
    </div>
  </section><div className="engine-strip"><div className="engine-wrap"><span><b>Locally owned</b> · Houston to Lafayette</span><span><b>In-person</b> sit-downs</span><span><b>Same-day</b> replies before 4 pm</span><span>Sites from <b>$999</b> · care from <b>$49/mo</b></span></div></div></>;
}