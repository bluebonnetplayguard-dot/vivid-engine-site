import { Link } from 'react-router';
import CallToAction from '../components/CallToAction';
import { areas, services } from '../content';

const steps = [
  { n: '01', heading: 'Review', body: 'We look at your current site, your Google Business Profile and who ranks ahead of you.' },
  { n: '02', heading: 'Plan', body: 'You get a short, plain-language plan with priorities, timeline and a fixed quote.' },
  { n: '03', heading: 'Build', body: 'We design and build a fast site, or fix the one you have, with local SEO built in.' },
  { n: '04', heading: 'Grow', body: 'Ongoing local SEO, reviews and monthly reports that show calls and leads, not jargon.' },
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <p className="eyebrow">Beaumont, TX · Lake Charles, LA</p>
          <h1>
            Websites that load fast and <span className="accent">get you found</span> locally.
          </h1>
          <p className="lead">
            Vivid Engine Solutions builds search-ready websites and runs local SEO for businesses across Southeast Texas
            and Southwest Louisiana, so more nearby customers find you, call you and choose you.
          </p>
          <div className="hero-actions">
            <Link to="/contact" className="btn">Get a free review</Link>
            <Link to="/services/web-design" className="btn btn-ghost">See what we do</Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-title">What we do</h2>
          <div className="cards">
            {services.map((s) => (
              <Link key={s.slug} to={`/services/${s.slug}`} className="card card-link">
                <h3>{s.name}</h3>
                <p>{s.intro}</p>
                <span className="more">Learn more →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <h2 className="section-title">How it works</h2>
          <ol className="steps">
            {steps.map((s) => (
              <li key={s.n}>
                <span className="step-n">{s.n}</span>
                <h3>{s.heading}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-title">Areas we serve</h2>
          <div className="cards">
            {areas.map((a) => (
              <Link key={a.slug} to={`/areas/${a.slug}`} className="card card-link">
                <h3>{a.city}, {a.state}</h3>
                <p>Also serving {a.nearby.slice(0, 4).join(', ')} and nearby.</p>
                <span className="more">{a.city} services →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CallToAction />
    </>
  );
}
