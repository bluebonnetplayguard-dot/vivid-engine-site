import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays } from 'lucide-react';
import ClientTaskList from '@/components/portal/ClientTaskList';
import { displayDate, statusLabel, statusStyle } from '@/components/portal/projectStatus';

export default function ClientProjectCard({ project, userId, totals }) {
  const progress = Math.round(Math.max(0, Math.min(100, Number(project.progress) || 0)));
  return <article className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-6" aria-labelledby={`project-title-${project.id}`}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1"><h2 id={`project-title-${project.id}`} className="wrap-break-word font-heading text-xl font-semibold">{project.title}</h2>
        {project.description && <p className="mt-2 whitespace-pre-wrap wrap-break-word text-sm text-muted-foreground">{project.description}</p>}
      </div>
      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStyle(project.status)}`}>{statusLabel(project.status)}</span>
    </header>
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">Project progress</span><span className="font-semibold">{progress}% complete</span></div>
      <div role="progressbar" aria-label={`${project.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-2.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div>
    </div>
    <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />Target date: {displayDate(project.due_date)}</span>
      {project.updated_date && <span>Last updated {displayDate(project.updated_date)}</span>}
    </div>
    <ClientTaskList projectId={project.id} userId={userId} totals={totals} />
    <Link to={`/portal/projects/${project.id}`} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline">Project details &amp; messages<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
  </article>;
}