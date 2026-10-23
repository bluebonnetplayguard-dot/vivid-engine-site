import { Link } from 'react-router-dom';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';

const SERVICES = [
  { title: 'Updates and security', description: 'Keep your website software current and address security updates as part of an ongoing maintenance plan. We handle the technical upkeep so you can focus on your business.' },
  { title: 'Backups and monitoring', description: 'Website backups and monitoring help protect the work that goes into your online presence. We keep an eye on your site and review issues that need attention.' },
  { title: 'Content changes and support', description: 'Keep service information, photos, and business details current as your company grows. Contact our team about the edits you need and we will confirm what is included in your plan.' },
];

export default function Maintenance() {
  return (
    <div className="blueprint min-h-screen">
      <PageMeta {...PAGE_META.maintenance} />
      <Navbar />
      <main>
        <section className="mk-hero hero-section">
          <span className="mono">WEBSITE MAINTENANCE</span>
          <h1 className="hero-title mt-3">Small Business Website Maintenance</h1>
          <p>Hosting, security, updates, backups, and monitoring for your business website.</p>
          <p>Basic Care is $49/mo for hosting, SSL, security updates, daily backups and monitoring. Turnkey Care is $99/mo and adds a domain, site assistant, up to one hour of monthly edits, a monthly report and priority support. Website builds are separate.</p>
        </section>
        <section className="mx-auto max-w-5xl px-4 pb-16">
          <div className="mk-features">
            {SERVICES.map(service => <div key={service.title} className="glass-card"><h2>{service.title}</h2><p>{service.description}</p></div>)}
          </div>
          <div className="mt-12 text-center">
            <Link to="/contact" className="mk-btn mk-btn-lg">Discuss Website Maintenance</Link>
            <p className="mt-4"><Link to="/pricing" className="mk-btn">Compare plans</Link></p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}