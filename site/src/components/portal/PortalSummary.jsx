import { Briefcase, CheckCircle2, CircleDot, ListTodo } from 'lucide-react';

export default function PortalSummary({ data, loading }) {
  const cards = [
    { label: 'Active projects', value: data?.active, icon: Briefcase },
    { label: 'Completed projects', value: data?.completed, icon: CheckCircle2 },
    { label: 'Tasks in progress', value: data?.tasks.active, icon: CircleDot },
    { label: 'Tasks up next', value: data?.tasks.next, icon: ListTodo },
  ];
  return <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Project overview" aria-busy={loading}>
    {cards.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-start justify-between gap-2"><span className="text-sm text-muted-foreground">{label}</span><Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" /></div>
      <p className="mt-3 font-heading text-2xl font-bold">{loading ? '…' : value ?? '—'}</p>
    </div>)}
  </div>;
}