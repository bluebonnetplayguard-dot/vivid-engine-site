import { useEffect } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { taskTotals } from '@/components/portal/projectStatus';

export default function usePortalDashboard(userId) {
  const queryClient = useQueryClient();
  const prefix = ['client-dashboard', userId];
  const projects = useInfiniteQuery({
    queryKey: [...prefix, 'projects'], enabled: !!userId, initialPageParam: undefined, staleTime: 30000,
    queryFn: ({ pageParam }) => api.entities.Project.filter({}, { sort: '-updated_date', limit: 5, cursor: pageParam }),
    getNextPageParam: page => page.has_more ? page.next_cursor : undefined,
  });
  const items = projects.data?.pages.flatMap(page => page.items) || [];
  const ids = items.map(project => project.id);
  const summary = useQuery({
    queryKey: [...prefix, 'summary'], enabled: !!userId, staleTime: 30000,
    queryFn: async () => {
      const [projectStats, taskStats] = await Promise.all([
        api.entities.Project.aggregate({ groupBy: 'status' }),
        api.entities.Task.aggregate({ groupBy: 'status' }),
      ]);
      const completed = projectStats.rows.find(row => row.status === 'completed')?.count || 0;
      return { completed, active: projectStats.rows.reduce((total, row) => total + row.count, 0) - completed, tasks: taskTotals(taskStats.rows) };
    },
  });
  const counts = useQuery({
    queryKey: [...prefix, 'task-counts', ids], enabled: !!userId && !!ids.length, staleTime: 30000,
    queryFn: () => api.entities.Task.aggregate({ query: { project_id: { $in: ids } }, groupBy: ['project_id', 'status'] }),
  });
  useEffect(() => {
    if (!userId) return;
    let timer;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => queryClient.invalidateQueries({ queryKey: ['client-dashboard', userId] }), 800); };
    const unsubscribers = [api.entities.Project.subscribe(refresh), api.entities.Task.subscribe(refresh)];
    return () => { clearTimeout(timer); unsubscribers.forEach(unsubscribe => unsubscribe()); };
  }, [userId, queryClient]);
  const byProject = {};
  for (const row of counts.data?.rows || []) (byProject[row.project_id] ||= []).push(row);
  return { projects, items, summary, counts, byProject };
}