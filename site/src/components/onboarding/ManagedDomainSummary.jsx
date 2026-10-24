import { ADD_ONS, formatUsd } from '@/config/pricing';
export default function ManagedDomainSummary({ checked, onChange, included = false }) {
  return (
    <div className="rounded-xl border border-orange-500/30 bg-orange-950/20 p-5">
      <p className="text-xs font-black tracking-[0.18em] text-orange-300">MANAGED DOMAIN SERVICE SUMMARY</p>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        {included ? 'One managed domain is included with your Turnkey Care plan.' : `If selected separately, domain leasing is ${formatUsd(ADD_ONS.find(option => option.id === 'domain').price)} per month. Cancel anytime.`} The domain is managed by
        Vivid Engine Solutions unless a separate written agreement states otherwise. Domain availability,
        renewal, registrar requirements, and transfer requests may be subject to third-party rules and fees.
      </p>
      <label className="mt-4 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-600 bg-slate-900 accent-orange-500"
        />
        <span className="text-sm leading-6 text-slate-200">
          I understand this is a managed domain lease/service and does not automatically transfer domain
          ownership to my business.
        </span>
      </label>
    </div>
  );
}