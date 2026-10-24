import { useEffect, useState } from "react";
import { api } from '@/api/client';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Plus, CreditCard, CheckCircle2 } from "lucide-react";
import LineItemsEditor from "@/components/admin/LineItemsEditor";
import CatalogPicker from '@/components/pricing/CatalogPicker';
import CatalogSummary from '@/components/pricing/CatalogSummary';
import openCheckout from '@/lib/openCheckout';

const fmt = (n) => (n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const statuses = ["draft", "sent", "paid", "overdue"];
const statusColor = { draft: "bg-muted text-muted-foreground", sent: "bg-blue-500/10 text-blue-400", paid: "bg-green-500/10 text-green-400", overdue: "bg-red-500/10 text-red-400" };

export default function AdminInvoices() {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ plan_id: 'manual', billing_cycle: 'monthly', add_on_ids: [], client_name: "", client_email: "", service: "Website Design", due_date: "", notes: "", tax_rate: 8.25 });
  const [items, setItems] = useState([{ description: "", qty: 1, price: 0 }]);

  const load = () => { setLoading(true); api.entities.Invoice.list("-created_date", 100).then((d) => { setInvoices(d); setLoading(false); }); };
  useEffect(() => { load(); }, []);

  const subtotal = items.reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);
  const tax = subtotal * (form.tax_rate || 0) / 100;
  const total = subtotal + tax;

  const create = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.functions.invoke('createInvoice', { ...form, line_items: items, tax_rate: Number(form.tax_rate) || 0 });
      if (!data.invoice?.id) throw new Error(data.error || 'Could not create invoice.');
      setOpen(false);
      setForm({ plan_id: 'manual', billing_cycle: 'monthly', add_on_ids: [], client_name: "", client_email: "", service: "Website Design", due_date: "", notes: "", tax_rate: 8.25 });
      setItems([{ description: "", qty: 1, price: 0 }]);
      load();
      toast({ title: "Invoice created" });
    } catch { toast({ variant: "destructive", title: "Failed to create invoice" }); }
  };

  const markPaid = async (inv) => {
    await api.entities.Invoice.update(inv.id, { status: "paid", paid_date: new Date().toISOString().slice(0, 10) });
    load();
    toast({ title: "Marked as paid" });
  };

  const charge = async (inv) => {
    try { await openCheckout(() => ({ invoice_id: inv.id })); }
    catch (error) { toast({ variant: 'destructive', title: 'Checkout failed', description: error.message }); }
  };

  return (
    <div className="p-6 md:p-10">
      <PageMeta {...PAGE_META.adminInvoices} noindex />
      <div className="flex items-center justify-between">
        <div><h1 className="font-heading text-2xl font-bold">Invoices</h1><p className="mt-1 text-sm text-muted-foreground">Bill clients and accept payment through Square. Afterpay refunds: Square can refund an Afterpay purchase for up to 120 days; after that, refund another way and note it here.</p></div>
        <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> New invoice</Button></DialogTrigger>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
            <DialogHeader><DialogTitle>New invoice</DialogTitle></DialogHeader>
            <form onSubmit={create} className="grid gap-3">
              <CatalogPicker value={form} onChange={setForm} />
              <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>Client name</Label><Input required value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></div><div className="grid gap-2"><Label>Client email</Label><Input type="email" value={form.client_email} onChange={(e) => setForm({ ...form, client_email: e.target.value })} /></div></div>
              <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>Service</Label><Input value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} /></div><div className="grid gap-2"><Label>Due date</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div></div>
              {form.plan_id === 'manual' ? <div><Label>Approved quote line items</Label><div className="mt-2"><LineItemsEditor items={items} onChange={setItems} /></div></div> : <CatalogSummary selection={form} />}
              <div className="flex items-center gap-3"><Label className="whitespace-nowrap">Tax %</Label><Input type="number" step="0.01" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} className="w-24" /></div>
              {form.plan_id === 'manual' && <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/50 p-3 text-sm"><div>Subtotal: <span className="font-medium">{fmt(subtotal)}</span></div><div>Tax: <span className="font-medium">{fmt(tax)}</span></div><div>Total: <span className="font-bold">{fmt(total)}</span></div></div>}
              <div className="grid gap-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
              <DialogFooter><Button type="submit">Create invoice</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="mt-8 rounded-2xl border border-border bg-card">
        {loading ? <div className="p-10 text-center text-muted-foreground">Loading...</div> : invoices.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">No invoices yet.</div> : (
          <div className="divide-y divide-border">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div><div className="flex items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{inv.number}</span><span className="font-medium">{inv.client_name}</span></div><div className="mt-1 text-xs text-muted-foreground">{inv.service} · {fmt(inv.total)}</div></div>
                <div className="flex items-center gap-2">
                  {inv.status !== "paid" && <Button variant="outline" size="sm" onClick={() => charge(inv)}><CreditCard className="mr-2 h-4 w-4" /> Charge</Button>}
                  {inv.status !== "paid" && <Button variant="ghost" size="sm" onClick={() => markPaid(inv)}><CheckCircle2 className="mr-2 h-4 w-4 text-green-400" /> Mark paid</Button>}
                  <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${statusColor[inv.status] || ""}`}>{inv.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}