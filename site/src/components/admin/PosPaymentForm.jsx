import CatalogPicker from '@/components/pricing/CatalogPicker';
import CatalogSummary from '@/components/pricing/CatalogSummary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CreditCard, Loader2 } from 'lucide-react';
export default function PosPaymentForm({ form, setForm, loading, onSubmit }) {
  return <form onSubmit={onSubmit} className="grid gap-4">
    <CatalogPicker value={form} onChange={setForm} />
    {form.plan_id === 'manual' ? <>
      <div className="grid gap-2"><Label>Approved quote amount ($)</Label><Input type="number" step="0.01" min="0.5" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="250.00" /></div>
      <div className="grid gap-2"><Label>Description</Label><Input required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
    </> : <CatalogSummary selection={form} />}
    <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>Client name</Label><Input required value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} /></div><div className="grid gap-2"><Label>Client email</Label><Input type="email" value={form.client_email} onChange={e => setForm({ ...form, client_email: e.target.value })} /></div></div>
    <Button type="submit" disabled={loading} size="lg">{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</> : <><CreditCard className="mr-2 h-4 w-4" /> Open secure checkout</>}</Button>
  </form>;
}