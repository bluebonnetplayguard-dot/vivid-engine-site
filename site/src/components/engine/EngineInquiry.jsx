import { useEffect, useState } from 'react';
const NEEDS = ['Website design', 'Website maintenance', 'Domain leasing', 'POS / CRM', 'SEO / Google Ads', 'Not sure yet'];
export default function EngineInquiry({ plan, revision }) {
  const [details, setDetails] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { if (plan) setDetails(previous => `Interested in the ${plan} plan. ${previous.replace(/^Interested in the .*? plan\.\s*/, '')}`); }, [plan, revision]);
  function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const get = key => String(data.get(key) || '').trim();
    const name = get('name'), biz = get('business'), phone = get('phone'), email = get('email');
    if (!biz || !name) { setMessage('Please add your business name and your name.'); return; }
    if (!phone && !email) { setMessage('Please add a phone number or email so we can reach you.'); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setMessage('Check the email address. It should look like you@business.com.'); return; }
    const body = [`Business: ${biz}`, `Contact: ${name}`, `Phone: ${phone || '-'}`, `Email: ${email || '-'}`, `Current website: ${get('website') || '-'}`, `Best way to reach: ${get('method')}`, `Looking for: ${data.getAll('needs').join(', ') || '-'}`, '', 'Details:', details.trim() || '-'].join('\r\n');
    window.location.href = `mailto:hello@vividenginesolutions.com?subject=${encodeURIComponent('New inquiry: ' + biz)}&body=${encodeURIComponent(body)}`;
    setMessage(`Thanks, ${name}! Your email app should open with your inquiry ready to send.`);
  }
  return <section id="inquiry" className="engine-section engine-band"><div className="engine-wrap engine-inquiry">
    <div><div className="engine-head"><span className="engine-caps">Let’s build your online presence</span><h2>Tell us about your business</h2><p>A local team member follows up, usually the same day.</p></div><div className="engine-side-info"><div><b className="engine-caps">Service area</b>Southeast Texas &amp; Southwest Louisiana</div><div><b className="engine-caps">Meet in person</b>Sit-downs at your business. No Zoom required.</div><div><b className="engine-caps">Response time</b>Same business day for inquiries before 4 pm; otherwise the next business day.</div></div></div>
    <form className="engine-form" onSubmit={submit} noValidate>
      <div className="engine-form-row"><label>Business name<input name="business" placeholder="e.g. Bayou Coastal Hardware" autoComplete="organization" required /></label><label>Your name<input name="name" placeholder="First and last name" autoComplete="name" required /></label></div>
      <div className="engine-form-row"><label>Phone<input name="phone" type="tel" placeholder="Phone number" autoComplete="tel" /></label><label>Email<input name="email" type="email" placeholder="you@business.com" autoComplete="email" /></label></div>
      <div className="engine-form-row"><label>Current website (if any)<input name="website" placeholder="yourbusiness.com or 'none'" autoComplete="url" /></label><label>Best way to reach you<select name="method">{['Phone call', 'Text', 'Email', 'In-person visit'].map(value => <option key={value}>{value}</option>)}</select></label></div>
      <fieldset><legend>What are you looking for?</legend><div className="engine-checks">{NEEDS.map(need => <label key={need}><input type="checkbox" name="needs" value={need} />{need}</label>)}</div></fieldset>
      <label>Project details<textarea name="details" rows={4} placeholder="Tell us what's not working with your current setup, or what you're hoping to launch." value={details} onChange={event => setDetails(event.target.value)} /></label>
      <button className="engine-button engine-primary" type="submit">Send inquiry</button><p className="engine-form-message" role="status" aria-live="polite">{message}</p>
    </form>
  </div></section>;
}