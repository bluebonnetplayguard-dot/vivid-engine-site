import { Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { YEARLY_DISCOUNT, formatUsd, planPrice } from '@/config/pricing';
import PlanFeatures from '@/components/pricing/PlanFeatures';
export default function PlanCard({ plan, yearly, onSelectPlan }) {
  const { amount, suffix, yearlyTotal } = planPrice(plan, yearly);
  const featured = Boolean(plan.badge);
  return <article className={`relative flex flex-col rounded-2xl border bg-card p-6 sm:p-7 ${featured ? 'border-primary shadow-xl shadow-primary/10' : 'border-border'}`} aria-labelledby={`plan-${plan.id}`}>
    {plan.badge && <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary-foreground">{plan.badge}</span>}
    <h3 id={`plan-${plan.id}`} className="text-2xl font-bold text-foreground">{plan.name}</h3>
    <p className="mt-2 text-sm text-muted-foreground">{plan.tagline}</p>
    <div className="mt-5 flex flex-wrap items-baseline gap-x-2"><span className="text-4xl font-extrabold text-foreground">{formatUsd(amount)}</span><span className="text-sm text-muted-foreground">{suffix}</span></div>
    <p className="mt-1 min-h-[20px] text-xs text-muted-foreground">{yearlyTotal ? `${formatUsd(yearlyTotal)} per year${YEARLY_DISCOUNT ? ` (save ${Math.round(YEARLY_DISCOUNT * 100)}%)` : ''}` : plan.billing === 'one_time' ? 'Pay once. No monthly plan required.' : 'Month-to-month. Cancel anytime.'}</p>
    <p className={`mt-4 inline-flex w-fit items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold ${plan.maintenance ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'}`}><Wrench size={14} aria-hidden="true" />{plan.maintenance ? 'Ongoing maintenance included' : 'No ongoing maintenance'}</p>
    <PlanFeatures plan={plan} />
    <p className="mt-5 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Best for:</span> {plan.bestFor}</p>
    <Link to={onSelectPlan ? `/?plan=${plan.id}#inquiry` : plan.cta.href} onClick={onSelectPlan ? event => { event.preventDefault(); onSelectPlan(plan.id); } : undefined} className={`pricing-plan-link mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl px-5 text-center font-semibold transition ${featured ? 'pricing-plan-link-featured bg-linear-to-r from-primary to-accent text-primary-foreground hover:brightness-110' : 'border border-primary/60 text-primary hover:bg-primary/10'}`}>{plan.cta.label}</Link>
  </article>;
}