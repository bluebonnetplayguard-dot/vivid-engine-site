import { Check, X } from 'lucide-react';
export default function PlanFeatures({ plan }) {
  return <>
    <ul className="mt-5 space-y-2.5 text-sm">
      {plan.includes.map(item => item.endsWith('plus:') ?
        <li key={item} className="pt-1 font-semibold text-foreground">{item}</li> :
        <li key={item} className="flex gap-2.5 text-foreground"><Check size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" /><span>{item}</span></li>)}
    </ul>
    {plan.notIncluded?.length > 0 && <ul className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
      {plan.notIncluded.map(item => <li key={item} className="flex gap-2.5 text-muted-foreground"><X size={18} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" /><span>{item}</span></li>)}
    </ul>}
  </>;
}