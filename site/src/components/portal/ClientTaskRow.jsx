import { CheckCircle2, Circle, CircleDot } from 'lucide-react';
import { displayDate, statusLabel, statusStyle, taskGroup } from '@/components/portal/projectStatus';

export default function ClientTaskRow({ task }) {
  const group = taskGroup(task.status);
  const Icon = group === 'done' ? CheckCircle2 : group === 'active' ? CircleDot : Circle;
  return <li className={`rounded-xl border p-3 sm:p-4 ${group === 'active' ? 'border-primary/40 bg-primary/5' : 'border-border bg-background'}`}>
    <div className="flex items-start gap-3">
      <Icon aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 ${group === 'active' ? 'text-primary' : 'text-muted-foreground'}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="wrap-break-word text-sm font-semibold">{task.title}</p>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyle(task.status, true)}`}>{statusLabel(task.status, true)}</span>
        </div>
        {task.description && <p className="mt-1 whitespace-pre-wrap wrap-break-word text-sm text-muted-foreground">{task.description}</p>}
        {task.due_date && <p className="mt-2 text-xs text-muted-foreground">Target date: {displayDate(task.due_date)}</p>}
      </div>
    </div>
  </li>;
}