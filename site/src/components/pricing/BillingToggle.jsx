import { YEARLY_DISCOUNT } from '@/config/pricing';
export default function BillingToggle({ yearly, onChange }) {
  return <>
    <div className="mt-8 flex justify-center">
      <div role="radiogroup" aria-label="Billing period" className="inline-flex flex-wrap justify-center gap-1 rounded-full border border-border bg-secondary p-1">
        {[[false, 'Monthly billing'], [true, YEARLY_DISCOUNT ? `Yearly billing (save ${Math.round(YEARLY_DISCOUNT * 100)}%)` : 'Yearly billing']].map(([value, label]) =>
          <button key={label} type="button" role="radio" aria-checked={yearly === value} onClick={() => onChange(value)} className={`min-h-[44px] rounded-full px-4 text-sm font-medium transition ${yearly === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>)}
      </div>
    </div>
    <p className="mt-2 text-center text-xs text-muted-foreground">Billing choices apply to monthly care only. Website and app builds are one-time.</p>
  </>;
}