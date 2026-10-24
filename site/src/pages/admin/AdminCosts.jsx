import { useEffect, useState } from "react";
import { api } from '@/api/client';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2 } from "lucide-react";
import RadixSelect from "@/components/admin/RadixSelect";

const fmt = (n) => (n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const categories = ["materials", "labor", "equipment", "subcontractor", "fuel", "other"];

export default function AdminCosts() {
  const { toast } = useToast();
  const [costs, setCosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: "materials", description: "", amount: 0, vendor: "", date: new Date().toISOString().slice(0, 10), job_name: "" });

  const load = () => { setLoading(true); api.entities.Cost.list("-created_date", 100).then((d) => { setCosts(d); setLoading(false); }); };
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.entities.Cost.create({ ...form, amount: Number(form.amount) || 0 });
      setOpen(false);
      setForm({ category: "materials", description: "", amount: 0, vendor: "", date: new Date().toISOString().slice(0, 10), job_name: "" });
      load();
      toast({ title: "Cost added" });
    } catch { toast({ variant: "destructive", title: "Failed to add cost" }); }
  };

  const remove = async (c) => { await api.entities.Cost.delete(c.id); load(); };

  const total = costs.reduce((s, c) => s + (c.amount || 0), 0);
  const byCategory = categories.map((cat) => ({ cat, total: costs.filter((c) => c.category === cat).reduce((s, c) => s + (c.amount || 0), 0) })).filter((c) => c.total > 0);

  return (
    <div className="p-6 md:p-10">
      <PageMeta {...PAGE_META.adminCosts} noindex />
      <div className="flex items-center justify-between">
        <div><h1 className="font-heading text-2xl font-bold">Costs</h1><p className="mt-1 text-sm text-muted-foreground">Track internal costs to see your true profit.</p></div>
        <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Add cost</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add cost</DialogTitle></DialogHeader>
            <form onSubmit={create} className="grid gap-3">
              <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>Category</Label><RadixSelect value={form.category} onValueChange={(v) => setForm({ ...form, category: v })} options={categories} className="h-10 capitalize" /></div><div className="grid gap-2"><Label>Amount ($)</Label><Input type="number" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div></div>
              <div className="grid gap-2"><Label>Description</Label><Input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>Vendor</Label><Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></div><div className="grid gap-2"><Label>Job / Project</Label><Input value={form.job_name} onChange={(e) => setForm({ ...form, job_name: e.target.value })} /></div></div>
              <div className="grid gap-2"><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <DialogFooter><Button type="submit">Save cost</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-5"><div className="text-sm text-muted-foreground">Total costs</div><div className="mt-2 font-heading text-2xl font-bold">{fmt(total)}</div></div>
        {byCategory.map((c) => (
          <div key={c.cat} className="rounded-2xl border border-border bg-card p-5"><div className="text-sm capitalize text-muted-foreground">{c.cat}</div><div className="mt-2 font-heading text-2xl font-bold">{fmt(c.total)}</div></div>
        ))}
      </div>
      <div className="mt-8 rounded-2xl border border-border bg-card">
        {loading ? <div className="p-10 text-center text-muted-foreground">Loading...</div> : costs.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">No costs logged yet.</div> : (
          <div className="divide-y divide-border">
            {costs.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-4">
                <div><div className="flex items-center gap-2"><span className="font-medium">{c.description}</span><span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">{c.category}</span></div><div className="mt-1 text-xs text-muted-foreground">{c.vendor}{c.job_name ? ` · ${c.job_name}` : ""}{c.date ? ` · ${c.date}` : ""}</div></div>
                <div className="flex items-center gap-3"><span className="font-medium">{fmt(c.amount)}</span><Button variant="ghost" size="icon" onClick={() => remove(c)}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}