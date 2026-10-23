import { Link } from 'react-router';

export default function CallToAction({ heading = 'Ready to get more local customers?' }: { heading?: string }) {
  return (
    <section className="cta">
      <div className="container cta-inner">
        <h2>{heading}</h2>
        <p>Get a free review of your website and Google presence, with clear next steps and no obligation.</p>
        <Link to="/contact" className="btn">Request a free review</Link>
      </div>
    </section>
  );
}
