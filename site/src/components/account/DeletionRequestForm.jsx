import { useState } from 'react';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export default function DeletionRequestForm({ user, mailto }) {
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function submit(event) {
    event.preventDefault(); setState('sending'); setError('');
    try {
      const { data } = await api.functions.invoke('requestAccountDeletion', { confirm: true });
      if (!data?.success) throw new Error(data?.error || 'Request could not be saved.');
      setNotice(data.notification_pending ? 'Your request is saved, but an email confirmation is pending. Keep this page as your confirmation.' : 'A confirmation email has been sent to your account address.');
      setState('done');
    } catch (e) { setError(e?.response?.data?.error || e.message || 'Something went wrong.'); setState('error'); }
  }
  if (state === 'done') return <div role="status"><h2 className="text-xl font-semibold">Deletion request received</h2><p className="mt-3">Our team will process your request within 30 days, subject to legal retention requirements.</p><p className="mt-3 text-sm text-muted-foreground">{notice}</p></div>;
  return <form onSubmit={submit}>
    <h2 className="text-xl font-semibold">Request deletion for {user.email}</h2>
    <p className="mt-2 text-sm text-muted-foreground">Deletion is permanent once processed. Type DELETE to confirm your request.</p>
    <label htmlFor="confirm-delete" className="mt-4 block text-sm">Type DELETE to confirm</label>
    <Input id="confirm-delete" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off" disabled={state === 'sending'} className="mt-2 h-12" />
    <Button type="submit" variant="destructive" className="mt-4 min-h-12 w-full" disabled={confirm.trim().toUpperCase() !== 'DELETE' || state === 'sending'}>{state === 'sending' ? 'Sending request…' : 'Request account deletion'}</Button>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error} <a href={mailto} className="underline">Request deletion by email instead.</a></p>}
  </form>;
}