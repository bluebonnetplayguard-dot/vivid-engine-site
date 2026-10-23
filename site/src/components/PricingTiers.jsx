import { useState } from 'react';
import { PLANS, PRICING_NOTES } from '@/config/pricing';
import BillingToggle from '@/components/pricing/BillingToggle';
import PlanCard from '@/components/pricing/PlanCard';
import AdditionalOptions from '@/components/pricing/AdditionalOptions';
import PlanComparison from '@/components/pricing/PlanComparison';
export default function PricingTiers({ compact = false, onSelectPlan }) {
  const [yearly, setYearly] = useState(false);
  return <section id="pricing" aria-labelledby="pricing-heading" className="scroll-mt-24 px-4 py-16">
    <div className="mx-auto max-w-6xl">
      <h2 id="pricing-heading" className="text-center text-3xl font-bold text-foreground sm:text-4xl">Plans that grow with your business</h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">Choose Starter, Launch or Full Engine, then add Basic Care or Turnkey Care and only the extras you need.</p>
      <BillingToggle yearly={yearly} onChange={setYearly} />
      <div className="mt-10 grid gap-6 lg:grid-cols-3 lg:items-start">{PLANS.map(plan => <PlanCard key={plan.id} plan={plan} yearly={yearly} onSelectPlan={onSelectPlan} />)}</div>
      {!compact && <><AdditionalOptions /><PlanComparison /><ul className="mx-auto mt-12 max-w-3xl space-y-2 text-sm text-muted-foreground">{PRICING_NOTES.map(note => <li key={note}>• {note}</li>)}</ul></>}
    </div>
  </section>;
}