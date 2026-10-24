import { useState } from "react";
import { api } from '@/api/client';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Calculator, Loader2, Save, Sparkles } from "lucide-react";
import RadixSelect from "@/components/admin/RadixSelect";

const fmt = (n) => (n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const services = ["Website Design", "Web App Development", "Mobile App", "E-commerce Store", "Branding & Logo", "SEO & Marketing", "Custom Software", "Maintenance & Support", "Other"];

export default function AdminEstimator() {
  const { toast } = useToast();
  const [form, setForm] = useState({ client_name: "", service: "Website Design", job_details: "", tax_rate: 8.25 });
  const [loading, setLoading] = useState(false);
  const [estimate, setEstimate] = useState(null);
  const [saving, setSaving] = useState(false);

  const generate = async (e) => {
    e.preventDefault();
    setLoading(true); setEstimate(null);
    try {
      const res = await api.functions.invoke("generateEstimate", { service: form.service, job_details: form.job_details, business_name: "Vivid Engine", tax_rate: form.tax_rate });
      if (res.data.estimate) setEstimate(res.data.estimate);
      else toast({ variant: "destructive", title: res.data.error || "Estimate failed" });
    } catch { toast({ variant: "destructive", title: "Estimate failed" }); }
    finally { setLoading(false); }
  };

  const saveAsQuote = async () => {
    if (!estimate) return;
    setSaving(true);
    const number = "Q-" + Date.now().toString().slice(-6);
    const line_items = (estimate.line_items || []).map((it) => ({ description: it.description, qty: Number(it.qty) || 1, price: Number(it.price) || 0 }));
    const subtotal = line_items.reduce((s, it) => s + it.qty * it.price, 0);
    const tax = Number(estimate.tax) || subtotal * (form.tax_rate || 0) / 100;
    const total = Number(estimate.total) || subtotal + tax;
    try {
      await api.entities.Quote.create({ number, client_name: form.client_name || "Estimate", service: form.service, line_items, subtotal, tax, total, status: "draft", tax_rate: Number(form.tax_rate) || 0, notes: estimate.summary || "" });
      toast({ title: "Saved as quote", description: number });
    } catch { toast({ variant: "destructive", title: "Failed to save" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="p-6 md:p-10">
      <PageMeta {...PAGE_META.adminEstimator} noindex />
      <h1 className="font-heading text-2xl font-bold">AI Estimator</h1>
      <p className="mt-1 text-sm text-muted-foreground">Generate a complete, service-tailored estimate in seconds — then save it as a quote.</p>
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <form onSubmit={generate} className="rounded-2xl border border-border bg-card p-6">
          <div className="grid gap-2"><Label>Client name</Label><Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} placeholder="Optional" /></div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="grid gap-2"><Label>Service</Label><RadixSelect value={form.service} onValueChange={(v) => setForm({ ...form, service: v })} options={services} className="h-10" /></div>
            <div className="grid gap-2"><Label>Tax %</Label><Input type="number" step="0.01" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} /></div>
          </div>
          <div className="mt-4 grid gap-2"><Label>Job details</Label><Textarea value={form.job_details} onChange={(e) => setForm({ ...form, job_details: e.target.value })} rows={6} placeholder="e.g. 5-page business website with booking, contact form, and CMS" /></div>
          <Button type="submit" disabled={loading} className="mt-6 w-full" size="lg">{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating estimate...</> : <><Sparkles className="mr-2 h-4 w-4 text-accent" /> Generate estimate</>}</Button>
        </form>

        <div className="rounded-2xl border border-border bg-card p-6">
          {loading ? (
            <div className="flex h-full min-h-[300px] items-center justify-center"><div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">Building your estimate...</p></div></div>
          ) : estimate ? (
            <div>
              <div className="flex items-center gap-2"><Calculator className="h-5 w-5 text-accent" /><h2 className="font-heading text-lg font-semibold">AI estimate</h2></div>
              {estimate.summary && <p className="mt-2 text-sm text-muted-foreground">{estimate.summary}</p>}
              {estimate.estimated_days != null && <p className="mt-1 text-xs text-muted-foreground">Estimated duration: {estimate.estimated_days} day(s)</p>}
              <div className="mt-4 overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="p-3">Description</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Price</th><th className="p-3 text-right">Total</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {(estimate.line_items || []).map((it, i) => (
                      <tr key={i}><td className="p-3">{it.description}</td><td className="p-3 text-right">{it.qty}</td><td className="p-3 text-right">{fmt(it.price)}</td><td className="p-3 text-right font-medium">{fmt((it.qty || 0) * (it.price || 0))}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmt(estimate.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{fmt(estimate.tax)}</span></div>
                <div className="flex justify-between border-t border-border pt-2 font-heading text-lg font-bold"><span>Total</span><span className="text-primary">{fmt(estimate.total)}</span></div>
              </div>
              {estimate.notes && <p className="mt-3 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{estimate.notes}</p>}
              <Button onClick={saveAsQuote} disabled={saving} className="mt-4 w-full">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save as quote</Button>
            </div>
          ) : (
            <div className="flex h-full min-h-[300px] items-center justify-center text-center text-sm text-muted-foreground"><div><Calculator className="mx-auto h-10 w-10 text-muted-foreground/40" /><p className="mt-3">Enter the service and job details, then generate a tailored estimate.</p></div></div>
          )}
        </div>
      </div>
    </div>
  );
}