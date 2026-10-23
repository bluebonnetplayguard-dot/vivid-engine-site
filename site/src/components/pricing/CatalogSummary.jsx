import { PLANS, ADD_ONS, planPrice, formatUsd } from '@/config/pricing';
export default function CatalogSummary({ selection }) {
  const plan = PLANS.find(item => item.id === selection.plan_id);
  const price = plan ? planPrice(plan, selection.billing_cycle === 'yearly') : null;
  return <div className="rounded-lg bg-muted/50 p-3 text-sm" aria-live="polite">
    {plan && <p>{plan.name}: {formatUsd(price.yearlyTotal ?? price.amount)} {plan.billing === 'one_time' ? 'one-time' : selection.billing_cycle === 'yearly' ? '/year' : '/month'}</p>}
    {ADD_ONS.filter(option => selection.add_on_ids.includes(option.id) && !option.includedIn.includes(selection.plan_id)).map(option => <p key={option.id}>{option.name}: {option.price === null ? 'Manual quote required' : `${formatUsd(option.price)}${option.billing === 'monthly' ? '/month' : ' one-time'}`}</p>)}
    <p className="mt-2 text-xs text-muted-foreground">Applicable sales tax and a 3.5% card processing fee are added at checkout. Monthly care is separate from a one-time build. Starting-price options and rush delivery need an approved quote.</p>
  </div>;
}