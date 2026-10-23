import { Link } from 'react-router';
import CallToAction from '../components/CallToAction';
import { areas, type Service } from '../content';

export default function ServicePage({ service }: { service: Service }) {
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <p className="eyebrow">Services</p>
          <h1>{service.title}</h1>
          <p className="lead">{service.intro}</p>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="cards cards-2">
            {service.points.map((p) => (
              <div key={p.heading} className="card">
                <h3>{p.heading}</h3>
                <p>{p.body}</p>
              </div>
            ))}
          </div>
          <p className="areas-line">
            {service.name} for businesses in{' '}
            {areas.map((a, i) => (
              <span key={a.slug}>
                {i > 0 && ' and '}
                <Link to={`/areas/${a.slug}`}>{a.city}, {a.state}</Link>
              </span>
            ))}
            .
          </p>
        </div>
      </section>
      <CallToAction />
    </>
  );
}
