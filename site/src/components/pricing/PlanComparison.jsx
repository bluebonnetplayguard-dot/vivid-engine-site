import { COMPARE, PLANS } from '@/config/pricing';
import ComparisonCell from '@/components/pricing/ComparisonCell';
export default function PlanComparison() {
  return <div className="mt-20">
    <h2 className="text-center text-2xl font-bold text-foreground sm:text-3xl">Compare plans</h2>
    <div className="mt-8 hidden overflow-hidden rounded-2xl border border-border md:block">
      <table className="w-full text-left"><caption className="sr-only">Plan comparison</caption>
        <thead className="bg-secondary"><tr><th scope="col" className="px-5 py-4 text-sm font-semibold text-muted-foreground">Feature</th>{PLANS.map(p => <th key={p.id} scope="col" className="px-5 py-4 text-center text-sm font-semibold text-foreground">{p.name}</th>)}</tr></thead>
        <tbody>{COMPARE.map(([label, ...values]) => <tr key={label} className="border-t border-border"><th scope="row" className="px-5 py-3.5 text-sm font-normal text-muted-foreground">{label}</th>{values.map((v, i) => <td key={i} className="px-5 py-3.5 text-center"><ComparisonCell value={v} /></td>)}</tr>)}</tbody>
      </table>
    </div>
    <div className="mt-8 space-y-4 md:hidden">
      {PLANS.map((p, col) => <details key={p.id} className="rounded-xl border border-border bg-card p-4" open={col === 1}>
        <summary className="cursor-pointer list-none font-semibold text-foreground">{p.name}: what's included</summary>
        <dl className="mt-3 space-y-2">{COMPARE.map(([label, ...values]) => <div key={label} className="flex items-center justify-between gap-4 border-t border-border pt-2"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="text-right"><ComparisonCell value={values[col]} /></dd></div>)}</dl>
      </details>)}
    </div>
  </div>;
}