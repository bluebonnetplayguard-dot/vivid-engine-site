import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import ClientTaskRow from '@/components/portal/ClientTaskRow';
import { taskGroups } from '@/components/portal/projectStatus';

export default function ClientTaskList({ projectId, userId, totals }) {
  const [filter, setFilter] = useState('all');
  const tasks = useInfiniteQuery({
    queryKey: ['client-dashboard', userId, 'tasks', projectId, filter], initialPageParam: undefined, staleTime: 30000,
    queryFn: ({ pageParam }) => api.entities.Task.filter({ project_id: projectId, ...(filter === 'all' ? {} : { status: { $in: taskGroups[filter].values } }) }, { sort: 'order', limit: 10, cursor: pageParam }),
    getNextPageParam: page => page.has_more ? page.next_cursor : undefined,
  });
  const items = tasks.data?.pages.flatMap(page => page.items) || [];
  const options = [['all', 'All tasks'], ...Object.entries(taskGroups).map(([key, group]) => [key, group.label])];
  return <section className="mt-5 border-t border-border pt-5" aria-label="Project tasks">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-heading font-semibold">Task list</h3>
      {totals && <p className="text-xs text-muted-foreground">{totals.done} of {totals.total} tasks completed</p>}
    </div>
    <p className="mt-1 text-xs text-muted-foreground">In progress is what we’re working on now. Up next is planned work.</p>
    <div className="my-3 flex flex-wrap gap-2" role="group" aria-label="Filter project tasks">
      {options.map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className={`min-h-9 rounded-lg border px-3 py-1.5 text-xs font-medium ${filter === key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`}>
        {label}{totals ? ` (${key === 'all' ? totals.total : totals[key]})` : ''}
      </button>)}
    </div>
    {tasks.isPending ? <p className="py-3 text-sm text-muted-foreground" role="status">Loading tasks…</p> : tasks.isError ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>We couldn’t load these tasks.</p><Button variant="outline" size="sm" onClick={() => tasks.refetch()}>Try again</Button></div> : items.length ? <ul className="space-y-2">{items.map(task => <ClientTaskRow key={task.id} task={task} />)}</ul> : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{filter === 'all' ? 'No tasks have been posted for this project yet.' : `No tasks marked ${taskGroups[filter].label.toLowerCase()} right now.`}</p>}
    {tasks.hasNextPage && <Button variant="outline" size="sm" className="mt-3" disabled={tasks.isFetchingNextPage} onClick={() => tasks.fetchNextPage()}>{tasks.isFetchingNextPage ? 'Loading…' : 'Show more tasks'}</Button>}
  </section>;
}