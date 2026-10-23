import { PLANS, ADD_ONS, formatUsd } from '@/config/pricing';
import BottomDrawerSelect from '@/components/ui/BottomDrawerSelect';
export default function CatalogPicker({ value, onChange }) {
  const set = patch => onChange({ ...value, ...patch });
  return <div className="grid gap-3 rounded-lg border border-border p-3">
    <div className="grid gap-1 text-sm"><span>Plan or approved quote</span>
      <BottomDrawerSelect title="Plan or approved quote" triggerClassName="flex w-full min-h-11 items-center justify-between gap-2 rounded-md border border-input bg-background p-2 text-left" value={value.plan_id} onChange={plan_id => set({ plan_id, billing_cycle: 'monthly', add_on_ids: [] })} options={[{ value: 'manual', label: 'Manual approved quote' }, ...PLANS.filter(plan => !plan.startingFrom).map(plan => ({ value: plan.id, label: `${plan.name} — ${formatUsd(plan.price)} ${plan.billing === 'one_time' ? 'one-time' : '/month'}` })), { value: 'addons', label: 'Add-ons only' }]} />
    </div>
    <p className="text-xs text-muted-foreground">Full Engine, starting-price options, quantities and rush delivery require a manual approved quote.</p>
    {value.plan_id !== 'manual' && <fieldset><legend className="mb-2 text-sm">Additional options</legend><div className="grid gap-2">
      {ADD_ONS.map(option => {
        const included = option.includedIn.includes(value.plan_id);
        const separate = option.billing === 'monthly' && (PLANS.find(plan => plan.id === value.plan_id)?.billing === 'one_time' || value.billing_cycle === 'yearly');
        const disabled = included || separate || option.price === null || option.startingFrom;
        return <label key={option.id} className="flex items-start gap-2 text-xs"><input type="checkbox" disabled={disabled} checked={included || value.add_on_ids.includes(option.id)} onChange={e => set({ add_on_ids: e.target.checked ? [...value.add_on_ids, option.id] : value.add_on_ids.filter(id => id !== option.id) })} /><span>{option.name}: {included ? 'Included' : option.price === null || option.startingFrom ? `${option.display} (manual quote required)` : `${formatUsd(option.price)}${option.billing === 'monthly' ? '/month' : ' one-time'}`}{separate && option.price !== null ? ' (purchase separately)' : ''}</span></label>;
      })}
    </div></fieldset>}
  </div>;
}