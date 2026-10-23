import { Sparkles } from 'lucide-react';
import { ADD_ONS, PLANS } from '@/config/pricing';
const PLAN_NAMES = Object.fromEntries(PLANS.map(p => [p.id, p.name]));
export default function AdditionalOptions() {
  return <div className="mt-20">
    <h2 className="flex items-center justify-center gap-2 text-center text-2xl font-bold text-foreground sm:text-3xl"><Sparkles size={22} className="text-primary" aria-hidden="true" /> Additional options</h2>
    <p className="mt-2 text-center text-muted-foreground">Add any of these to your plan.</p>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ADD_ONS.map(a => <div key={a.id} className="flex flex-col rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="font-semibold text-foreground">{a.name}</h3>
          <p className="shrink-0 text-right text-sm font-semibold text-primary">{a.display}</p>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{a.detail}</p>
        {a.includedIn.length > 0 && <p className="mt-3 text-xs text-primary">{a.includedNote ? `${a.includedNote} with ` : 'Included with '}{a.includedIn.map(id => PLAN_NAMES[id]).join(' and ')}</p>}
      </div>)}
    </div>
  </div>;
}