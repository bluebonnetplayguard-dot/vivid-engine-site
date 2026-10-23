import { Link } from 'react-router';
import CallToAction from '../components/CallToAction';
import { services, type Area } from '../content';

export default function AreaPage({ area }: { area: Area }) {
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <p className="eyebrow">{area.city}, {area.state}</p>
          <h1>{area.title}</h1>
          <p className="lead">{area.intro}</p>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="cards">
            {services.map((s) => (
              <Link key={s.slug} to={`/services/${s.slug}`} className="card card-link">
                <h3>{s.name} in {area.city}</h3>
                <p>{s.description}</p>
                <span className="more">Learn more →</span>
              </Link>
            ))}
          </div>
          <h2 className="section-title section-title-sm">Also serving</h2>
          <ul className="chips">
            {area.nearby.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      </section>
      <CallToAction heading={`Grow your ${area.city} business online`} />
    </>
  );
}
