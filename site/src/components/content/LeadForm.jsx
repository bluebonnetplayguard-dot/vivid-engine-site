import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import invokePublicFunction from '@/lib/invokePublicFunction';
import { BUSINESS } from '@/config/business';
import { WhatsAppLink } from '@/components/shell/WhatsAppButton';

// One form for quotes, consultations, early access and partner applications. Saves the request as a lead
// (submitInquiry) and alerts the team; nothing is booked or charged automatically.
const TOPICS = {
  quote: { kind: 'inquiry', heading: 'Tell us about your project', button: 'Request a quote', interest: 'Quote' },
  consultation: { kind: 'consultation', heading: 'Pick a time that works', button: 'Request a consultation', interest: 'Free consultation' },
  'early-access': { kind: 'inquiry', heading: 'Join early access', button: 'Join early access', interest: 'Early access' },
  partner: { kind: 'inquiry', heading: 'Tell us about your business', button: 'Send application', interest: 'Partner application' },
  domain: { kind: 'inquiry', heading: 'Ask about a domain', button: 'Send', interest: 'Domain' },
  general: { kind: 'inquiry', heading: 'Send us a message', button: 'Send message', interest: '' },
};

export default function LeadForm({ topic: topicProp }) {
  const [params] = useSearchParams();
  const topicKey = topicProp || params.get('topic') || 'general';
  const topic = TOPICS[topicKey] || TOPICS.general;
  const plan = params.get('plan') || '';
  const [state, setState] = useState({ status: 'idle', message: '' });
  const consult = topic.kind === 'consultation';

  const submit = async e => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = k => String(f.get(k) || '').trim();
    if (!get('name')) { setState({ status: 'error', message: 'Please add your name.' }); return; }
    if (!get('phone') && !get('email')) { setState({ status: 'error', message: 'Please add a phone number or email so we can reach you.' }); return; }
    setState({ status: 'sending', message: 'Sending…' });
    try {
      await invokePublicFunction('submitInquiry', {
        kind: topic.kind, name: get('name'), email: get('email'), phone: get('phone'), business: get('business'), location: get('location'),
        interest: [topic.interest, plan && `plan: ${plan}`].filter(Boolean).join(' · ').slice(0, 200), message: get('message'),
        preferredContact: get('preferredContact'), preferredDate: get('preferredDate'), preferredTime: get('preferredTime'), consultType: get('consultType'),
        website: get('website'),   // honeypot
      });
      setState({ status: 'done', message: `Thanks${get('name') ? `, ${get('name').split(' ')[0]}` : ''}. We have your request and will reply within one business day.` });
      e.currentTarget?.reset?.();
    } catch (err) {
      setState({ status: 'error', message: err?.message || 'Your request could not be sent. Please try again, or WhatsApp us.' });
    }
  };

  if (state.status === 'done') return <div className="ct-form-done" role="status"><b>Request sent.</b><p>{state.message}</p><p>Need us sooner? <WhatsAppLink placement={`form-${topicKey}`} /></p></div>;
  return <form className="ct-form" onSubmit={submit} noValidate aria-labelledby="ct-form-h">
    <h2 id="ct-form-h">{topic.heading}</h2>
    <div className="ct-row"><label>Your name<input name="name" autoComplete="name" required /></label><label>Business name<input name="business" autoComplete="organization" /></label></div>
    <div className="ct-row"><label>Phone<input name="phone" type="tel" autoComplete="tel" /></label><label>Email<input name="email" type="email" autoComplete="email" /></label></div>
    <div className="ct-row"><label>City<input name="location" placeholder={BUSINESS.serviceAreas.slice(0, 3).join(', ')} /></label>
      <label>Best way to reach you<select name="preferredContact" defaultValue="phone"><option value="phone">Phone call</option><option value="text">Text</option><option value="email">Email</option></select></label></div>
    {consult && <div className="ct-row">
      <label>Preferred day<input name="preferredDate" type="date" /></label>
      <label>Preferred time<select name="preferredTime" defaultValue="morning"><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select></label>
      <label>Meet<select name="consultType" defaultValue="in_person"><option value="in_person">In person</option><option value="phone">Phone</option></select></label>
    </div>}
    <label>{consult ? 'What would you like to talk about?' : 'Tell us more'}<textarea name="message" rows={5} maxLength={2000} defaultValue={plan ? `I'm interested in: ${plan}\n` : ''} /></label>
    <label className="ct-hp" aria-hidden="true">Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
    <button className="engine-button engine-primary" type="submit" disabled={state.status === 'sending'}>{state.status === 'sending' ? 'Sending…' : topic.button}</button>
    <p className={`ct-msg${state.status === 'error' ? ' is-error' : ''}`} role="status" aria-live="polite">{state.message}</p>
    <p className="ct-fine">Prefer to chat? <WhatsAppLink placement={`form-${topicKey}`} />. We never share your details.</p>
  </form>;
}
