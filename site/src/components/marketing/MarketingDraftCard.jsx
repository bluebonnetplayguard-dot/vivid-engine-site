import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import CopyButton from '@/components/chat/CopyButton';

export default function MarketingDraftCard({ draft }) {
  const [editing, setEditing] = useState(false), [title, setTitle] = useState(draft.title), [content, setContent] = useState(draft.content);
  const queryClient = useQueryClient();
  const update = useMutation({ mutationFn: changes => api.entities.MarketingDraft.update(draft.id, changes), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['marketing-drafts'] }); setEditing(false); } });
  return <article className="rounded-xl border border-border bg-card p-5">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{draft.channel} · {draft.type.replaceAll('_', ' ')} · {new Date(draft.created_date).toLocaleDateString()}</span><span className="rounded-full bg-primary/10 px-3 py-1 text-foreground">{draft.status === 'reviewed' ? 'Reviewed' : 'Draft'}</span></div>
    {draft.recipient_email && <p className="mb-3 text-sm text-muted-foreground">To: {draft.recipient_email}</p>}
    {editing ? <form onSubmit={e => { e.preventDefault(); update.mutate({ title: title.trim(), content: content.trim(), status: 'draft' }); }} className="space-y-3">
      <label className="block text-sm">Title<input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3" /></label>
      <label className="block text-sm">Content<textarea required maxLength={20000} rows={14} value={content} onChange={e => setContent(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background p-3 text-sm" /></label>
      <div className="flex gap-2"><Button type="submit" disabled={update.isPending || !title.trim() || !content.trim()}>Save draft</Button><Button type="button" variant="outline" disabled={update.isPending} onClick={() => setEditing(false)}>Cancel</Button></div>
    </form> : <>
      <h2 className="font-heading text-xl font-bold">{draft.title}</h2>
      <div className="my-4 whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-foreground">{draft.content}</div>
      <div className="flex flex-wrap items-center gap-3"><CopyButton text={`${draft.title}\n\n${draft.content}`} /><Button size="sm" variant="outline" onClick={() => { setTitle(draft.title); setContent(draft.content); setEditing(true); }}>Edit</Button><Button size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate({ status: draft.status === 'reviewed' ? 'draft' : 'reviewed' })}>{draft.status === 'reviewed' ? 'Return to draft' : 'Mark reviewed'}</Button></div>
    </>}
    {update.error && <p role="alert" className="mt-3 text-sm text-destructive">Unable to save your changes. Please try again.</p>}
  </article>;
}