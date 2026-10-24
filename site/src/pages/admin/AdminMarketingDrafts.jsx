import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/api/client';
import { PageMeta } from '@/components/SeoSchema';
import MarketingDraftCard from '@/components/marketing/MarketingDraftCard';
import { Button } from '@/components/ui/button';

export default function AdminMarketingDrafts() {
  const { user } = useAuth();
  const [status, setStatus] = useState('all');
  const drafts = useInfiniteQuery({ queryKey: ['marketing-drafts', status], enabled: user?.role === 'admin', initialPageParam: null,
    queryFn: ({ pageParam }) => api.entities.MarketingDraft.filter(status === 'all' ? {} : { status }, { sort: '-created_date', limit: 20, ...(pageParam ? { cursor: pageParam } : {}) }),
    getNextPageParam: page => page.has_more ? page.next_cursor : undefined,
  });
  return <div className="mx-auto max-w-4xl space-y-5 p-6">
    <PageMeta title="Marketing Drafts" description="Review, edit and copy private marketing drafts for Vivid Engine Solutions. Nothing is sent or published automatically." path="/admin/marketing-drafts" noindex />
    <h1 className="font-heading text-2xl font-bold">Marketing Drafts</h1>
    {user?.role !== 'admin' ? <p role="alert">Admin access is required. <Link className="underline" to="/portal">Return to portal</Link></p> : <>
      <p className="text-sm text-muted-foreground">Use the chat bubble’s Marketing tab to create content. Review and copy drafts here; nothing is sent or published automatically. Lead follow-ups are created in batches of up to ten.</p>
      <div className="flex gap-2" aria-label="Filter drafts">{['all', 'draft', 'reviewed'].map(value => <Button key={value} variant={status === value ? 'default' : 'outline-solid'} onClick={() => setStatus(value)}>{value === 'all' ? 'All' : value === 'draft' ? 'Drafts' : 'Reviewed'}</Button>)}</div>
      {drafts.isPending && <p role="status" className="text-sm text-muted-foreground">Loading marketing drafts…</p>}
      {drafts.error && <div role="alert" className="text-sm text-destructive">Unable to load drafts. <Button variant="outline" onClick={() => drafts.refetch()}>Try again</Button></div>}
      {drafts.data?.pages[0]?.items.length === 0 && <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">No {status === 'all' ? '' : status} drafts yet. Open the Marketing tab to create your first piece.</p>}
      {drafts.data?.pages.map(page => page.items.map(draft => <MarketingDraftCard key={draft.id} draft={draft} />))}
      {drafts.hasNextPage && <Button variant="outline" disabled={drafts.isFetchingNextPage} onClick={() => drafts.fetchNextPage()}>{drafts.isFetchingNextPage ? 'Loading…' : 'Load more'}</Button>}
    </>}
  </div>;
}