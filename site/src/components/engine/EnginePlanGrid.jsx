import { Check } from 'lucide-react';
import { formatUsd } from '@/config/pricing';
export default function EnginePlanGrid({ plans, onSelect, care = false }) {
  return <div className={care ? 'engine-pricing engine-care-pricing' : 'engine-pricing'}>{plans.map(plan => <article key={plan.id} className={plan.badge ? 'engine-plan engine-featured' : 'engine-plan'}>
    <span className="engine-caps">{plan.tag}</span><h3>{plan.name}</h3><div className="engine-price">{formatUsd(plan.price)} <small>{plan.billing === 'monthly' ? '/mo' : plan.startingFrom ? 'and up' : 'one-time'}</small></div><p>{plan.tagline}</p>
    <ul>{plan.includes.map(text => <li key={text}><Check size={18} aria-hidden="true" />{text}</li>)}</ul><button type="button" className={plan.badge ? 'engine-button engine-primary' : 'engine-button engine-outline'} onClick={() => onSelect(plan.name)}>{plan.cta.label}</button>
  </article>)}</div>;
}