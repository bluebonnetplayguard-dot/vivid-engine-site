import { Image } from '@/components/ui/image';
import { Monitor, Settings, Globe, TrendingUp, Handshake, MapPin, Calendar } from "lucide-react";

const HERO_BG = "/hero-background.webp";
const LOGO = "/logo-400.webp";

const SERVICES = [
  { icon: Monitor, label: "Website Design" },
  { icon: Settings, label: "Website Maintenance" },
  { icon: Globe, label: "Domain Leasing" },
  { icon: TrendingUp, label: "Business Solutions" },
  { icon: Handshake, label: "In-Person Consultations" },
];

export default function Hero() {
  return (
    <section className="ve-hero scroll-mt-24" id="top">
      <div className="ve-hero-bg" aria-hidden="true" style={{ backgroundImage: `url(${HERO_BG})` }} />
      <div className="ve-hero-grid" aria-hidden="true" />
      <div className="ve-hero-glow" aria-hidden="true" />

      <div className="ve-hero-content">
        <div className="ve-hero-logo">
          <Image src={LOGO} alt="Vivid Engine Solutions logo" className="h-full w-full object-contain p-1" fittingType="fit" />
        </div>

        <p className="ve-hero-header">Locally built for Southeast Texas &amp; Southwest Louisiana</p>

        <h1 className="ve-hero-title">
          Website &amp; App Design <span>for SETX / SWLA</span>
        </h1>

        <p className="mx-auto mb-10 mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">Custom websites, apps, POS and CRM — built, hosted and maintained by one local team.</p>

        <div className="ve-hero-services">
          {SERVICES.map((s) => (
            <div key={s.label} className="ve-hero-service">
              <s.icon size={28} strokeWidth={1.5} />
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        <a href="#inquiry" className="ve-hero-cta">
          <Calendar size={18} aria-hidden="true" />
          <span>Get a quote</span>
          <span className="ve-hero-cta-arrow" aria-hidden="true">&rarr;</span>
        </a>

        <div className="ve-hero-location">
          <MapPin size={16} />
          <span>Proudly Serving Southeast Texas &amp; Southwest Louisiana</span>
        </div>
      </div>
    </section>
  );
}