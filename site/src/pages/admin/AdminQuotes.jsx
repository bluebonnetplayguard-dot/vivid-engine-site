import { useEffect, useState } from "react";
import { api } from '@/api/client';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Plus } from "lucide-react";
import LineItemsEditor from "@/components/admin/LineItemsEditor";
import RadixSelect from "@/components/admin/RadixSelect";

const fmt = (n) => (n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const statuses = ["draft", "sent", "accepted", "rejected"];
const statusColor = { draft: "bg-muted text-muted-foreground", sent: "bg-blue-500/10 text-blue-400", accepted: "bg-green-500/10 text-green-400", rejected: "bg-red-500/10 text-red-400" };

export default function AdminQuotes() {
  const { toast } = useToast();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ client_name: "", client_email: "", service: "Website Design", valid_until: "", notes: "", tax_rate: 8.25 });
  const [items, setItems] = useState([{ description: "", qty: 1, price: 0 }]);

  const load = () => { setLoading(true); api.entities.Quote.list("-created_date", 100).then((d) => { setQuotes(d); setLoading(false); }); };
  useEffect(() => { load(); }, []);

  const subtotal = items.reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);
  const tax = subtotal * (form.tax_rate || 0) / 100;
  const total = subtotal + tax;

  const create = async (e) => {
    e.preventDefault();
    const number = "Q-" + Date.now().toString().slice(-6);
    try {
      await api.entities.Quote.create({ ...form, number, line_items: items, subtotal, tax, total, status: "draft", tax_rate: Number(form.tax_rate) || 0 });
      setOpen(false);
      setForm({ client_name: "", client_email: "", service: "Website Design", valid_until: "", notes: "", tax_rate: 8.25 });
      setItems([{ description: "", qty: 1, price: 0 }]);
      load();
      toast({ title: "Quote created" });
    } catch { toast({ variant: "destructive", title: "Failed to create quote" }); }
  };

  const setStatus = async (q, status) => { await api.entities.Quote.update(q.id, { status }); load(); };

  return (
    <div className="p-6 md:p-10">
      <PageMeta {...PAGE_META.adminQuotes} noindex />
      <div className="flex items-center justify-between">
        <div><h1 className="font-heading text-2xl font-bold">Quotes</h1><p className="mt-1 text-sm text-muted-foreground">Create and track quotes for your clients.</p></div>
        <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> New quote</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>New quote</DialogTitle></DialogHeader>
            <form onSubmit={create} className="grid gap-3">
              <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>Client name</Label><Input required value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></div><div className="grid gap-2"><Label>Client email</Label><Input type="email" value={form.client_email} onChange={(e) => setForm({ ...form, client_email: e.target.value })} /></div></div>
              <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>Service</Label><Input value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} /></div><div className="grid gap-2"><Label>Valid until</Label><Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} /></div></div>
              <div><Label>Line items</Label><div className="mt-2"><LineItemsEditor items={items} onChange={setItems} /></div></div>
              <div className="flex items-center gap-3"><Label className="whitespace-nowrap">Tax %</Label><Input type="number" step="0.01" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} className="w-24" /></div>
              <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/50 p-3 text-sm"><div>Subtotal: <span className="font-medium">{fmt(subtotal)}</span></div><div>Tax: <span className="font-medium">{fmt(tax)}</span></div><div>Total: <span className="font-bold">{fmt(total)}</span></div></div>
              <div className="grid gap-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
              <DialogFooter><Button type="submit">Create quote</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="mt-8 rounded-2xl border border-border bg-card">
        {loading ? <div className="p-10 text-center text-muted-foreground">Loading...</div> : quotes.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">No quotes yet.</div> : (
          <div className="divide-y divide-border">
            {quotes.map((q) => (
              <div key={q.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div><div className="flex items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{q.number}</span><span className="font-medium">{q.client_name}</span></div><div className="mt-1 text-xs text-muted-foreground">{q.service} · {fmt(q.total)}</div></div>
                <RadixSelect value={q.status} onValueChange={(v) => setStatus(q, v)} options={statuses} className={`h-9 w-auto rounded-full border-0 px-3 text-xs font-medium capitalize ${statusColor[q.status] || ""}`} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}