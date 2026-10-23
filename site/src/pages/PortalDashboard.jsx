import { Link } from 'react-router-dom';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import usePortalDashboard from '@/hooks/usePortalDashboard';
import PortalSummary from '@/components/portal/PortalSummary';
import PaymentOptions from '@/components/payments/PaymentOptions';
import ClientProjectCard from '@/components/portal/ClientProjectCard';
import { taskTotals } from '@/components/portal/projectStatus';

export default function PortalDashboard() {
  const { user } = useAuth();
  const dashboard = usePortalDashboard(user?.id);
  return <div className="mx-auto max-w-6xl p-4 sm:p-6 md:p-10">
    <PageMeta {...PAGE_META.portal} noindex />
    <h1 className="font-heading text-2xl font-bold">Your project dashboard</h1>
    <p className="mt-2 text-sm text-muted-foreground">Project progress and current work with Vivid Engine Solutions, all in one place.</p>
    <div className="mt-6"><PaymentOptions variant="compact" /></div>
    <PortalSummary data={dashboard.summary.data} loading={dashboard.summary.isPending} />
    {dashboard.summary.isError && <p className="mt-3 text-sm text-destructive" role="alert">Overview totals couldn’t be loaded. <button type="button" className="underline" onClick={() => dashboard.summary.refetch()}>Retry totals</button></p>}
    {dashboard.counts.isError && <p className="mt-3 text-sm text-destructive" role="alert">Task totals couldn’t be loaded. <button type="button" className="underline" onClick={() => dashboard.counts.refetch()}>Retry task totals</button></p>}
    <div className="mt-8 space-y-5">
      {dashboard.projects.isPending ? <div role="status" className="flex items-center gap-3 py-8 text-sm text-muted-foreground"><span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />Loading your projects…</div> : dashboard.projects.isError ? <div role="alert" className="space-y-3"><p className="text-sm text-destructive">We couldn’t load your projects.</p><Button variant="outline" onClick={() => dashboard.projects.refetch()}>Try again</Button></div> : !dashboard.items.length ? <div className="rounded-2xl border border-dashed border-border p-8 text-center"><h2 className="font-heading text-lg font-semibold">No projects to show yet</h2><p className="mt-2 text-sm text-muted-foreground">Project status and tasks will appear here once your project is set up.</p><Link to="/contact" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">Contact the team</Link></div> : dashboard.items.map(project => <ClientProjectCard key={project.id} project={project} userId={user.id} totals={dashboard.counts.isSuccess ? taskTotals(dashboard.byProject[project.id]) : null} />)}
    </div>
    {dashboard.projects.hasNextPage && <Button variant="outline" className="mt-5" disabled={dashboard.projects.isFetchingNextPage} onClick={() => dashboard.projects.fetchNextPage()}>{dashboard.projects.isFetchingNextPage ? 'Loading…' : 'Show more projects'}</Button>}
  </div>;
}