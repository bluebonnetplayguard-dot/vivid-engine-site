import ContactForm from '../components/ContactForm';
import { site } from '../site';

export default function Contact() {
  return (
    <section className="section">
      <div className="container contact-grid">
        <div>
          <p className="eyebrow">Contact</p>
          <h1>Get a free website and local SEO review</h1>
          <p className="lead">
            Tell us a little about your business. We'll look at your site and Google presence and reply within one
            business day with what we'd fix first.
          </p>
          {site.phone && <p>Call <a href={`tel:${site.phone.replace(/[^\d+]/g, '')}`}>{site.phone}</a></p>}
          {site.email && <p>Email <a href={`mailto:${site.email}`}>{site.email}</a></p>}
        </div>
        <ContactForm />
      </div>
    </section>
  );
}
