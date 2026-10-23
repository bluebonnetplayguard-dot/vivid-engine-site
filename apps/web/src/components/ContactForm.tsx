import { useState, type FormEvent } from 'react';
import { services } from '../content';

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string };

export default function ContactForm() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setStatus({ kind: 'sending' });
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
        throw new Error(msg || 'Something went wrong. Please try again.');
      }
      form.reset();
      setStatus({ kind: 'sent' });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' });
    }
  }

  if (status.kind === 'sent') {
    return (
      <div className="form-success" role="status">
        <h2>Thanks, we got your message.</h2>
        <p>We'll reply within one business day.</p>
      </div>
    );
  }

  return (
    <form className="contact-form" onSubmit={onSubmit}>
      <label>
        Name
        <input name="name" required maxLength={100} autoComplete="name" />
      </label>
      <label>
        Email
        <input name="email" type="email" required maxLength={200} autoComplete="email" />
      </label>
      <label>
        Phone <span className="optional">(optional)</span>
        <input name="phone" type="tel" maxLength={40} autoComplete="tel" />
      </label>
      <label>
        Business website <span className="optional">(optional)</span>
        <input name="website" type="text" maxLength={200} placeholder="example.com" />
      </label>
      <label>
        Interested in
        <select name="service" defaultValue="">
          <option value="">Not sure yet</option>
          {services.map((s) => (
            <option key={s.slug} value={s.slug}>{s.name}</option>
          ))}
        </select>
      </label>
      <label>
        How can we help?
        <textarea name="message" required maxLength={4000} rows={5} />
      </label>
      {/* Honeypot: hidden from people, often filled in by bots. */}
      <input className="hp" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      {status.kind === 'error' && <p className="form-error" role="alert">{status.message}</p>}
      <button className="btn" type="submit" disabled={status.kind === 'sending'}>
        {status.kind === 'sending' ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}
