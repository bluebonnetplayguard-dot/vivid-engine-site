import CallToAction from '../components/CallToAction';
import { site } from '../site';

export default function About() {
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <p className="eyebrow">About</p>
          <h1>Local web design, done straight.</h1>
          <p className="lead">
            {site.name} is a web design and local SEO studio serving Beaumont, Lake Charles and the communities in
            between.
          </p>
        </div>
      </section>
      <section className="section">
        <div className="container prose">
          <p>
            We started Vivid Engine because too many good local businesses are stuck with slow websites that do not show
            up in search. We keep things simple: fast sites, honest advice, fixed quotes and reports you can actually
            read.
          </p>
          <p>
            Every site we build is prerendered for speed, works on every phone, and ships with the technical SEO search
            engines expect. When you are ready to grow, our local SEO service keeps your Google Business Profile, citations
            and reviews working for you month after month.
          </p>
        </div>
      </section>
      <CallToAction />
    </>
  );
}
