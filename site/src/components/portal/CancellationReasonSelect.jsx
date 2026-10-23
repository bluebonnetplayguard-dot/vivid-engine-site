import BottomDrawerSelect from '@/components/ui/BottomDrawerSelect';
import { useIsMobile } from '@/hooks/use-mobile';

const reasons = ['Business closed', 'No longer need service', 'Moving to another provider', 'Billing concern', 'Website or domain issue', 'Other'];
const triggerClassName = 'mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-white outline-hidden focus:border-blue-400 focus:ring-2 focus:ring-blue-400/30';

export default function CancellationReasonSelect({ value, onChange, disabled }) {
  const mobile = useIsMobile();
  if (mobile) return <BottomDrawerSelect
    id="domain-cancellation-reason" title="Reason for request" variant="blueprint"
    placeholder="Select a reason" value={value} onChange={onChange} disabled={disabled}
    options={reasons} triggerClassName={`${triggerClassName} flex items-center justify-between gap-2 text-left disabled:opacity-50`}
  />;
  return <select id="domain-cancellation-reason" required value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className={triggerClassName}>
    <option value="">Select a reason</option>
    {reasons.map(reason => <option key={reason} value={reason}>{reason}</option>)}
  </select>;
}