import { useEffect, useState } from "react";
import { api } from '@/api/client';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';
import { useToast } from "@/components/ui/use-toast";
import { CheckCircle2, AlertCircle } from "lucide-react";
import PosPaymentForm from '@/components/admin/PosPaymentForm';
import openCheckout from '@/lib/openCheckout';

export default function AdminPos() {
  const { toast } = useToast();
  const [form, setForm] = useState({ plan_id: 'launch', billing_cycle: 'monthly', add_on_ids: [], amount: "", description: "Service payment", client_name: "", client_email: "" });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setStatus(params.get("status") || "");
  }, []);

  const charge = async (e) => {
    e.preventDefault();
    if (form.plan_id === 'manual' && (!form.amount || Number(form.amount) <= 0)) { toast({ variant: 'destructive', title: 'Enter an approved quote amount' }); return; }
    setLoading(true);
    try {
      await openCheckout(async () => {
        if (form.plan_id !== 'manual') return { plan_id: form.plan_id, billing_cycle: form.billing_cycle, add_on_ids: form.add_on_ids, client_name: form.client_name, client_email: form.client_email };
        const { data } = await api.functions.invoke('createInvoice', { plan_id: 'manual', client_name: form.client_name, client_email: form.client_email, service: form.description, tax_rate: 0, line_items: [{ description: form.description, qty: 1, price: Number(form.amount) }] });
        if (!data.invoice?.id) throw new Error(data.error || 'Could not save approved quote.');
        return { invoice_id: data.invoice.id };
      });
    } catch (error) { toast({ variant: 'destructive', title: 'Checkout failed', description: error.message }); }
    finally { setLoading(false); }
  };

  return (
    <div className="p-6 md:p-10">
      <PageMeta {...PAGE_META.adminPos} noindex />
      <h1 className="font-heading text-2xl font-bold">POS / Payments</h1>
      <p className="mt-1 text-sm text-muted-foreground">Charge catalog plans at server-verified prices, or collect a saved, approved manual quote.</p>

      {status === "success" && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-400"><CheckCircle2 className="h-5 w-5" /> Payment successful — thank you!</div>
      )}
      {status === "cancel" && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"><AlertCircle className="h-5 w-5" /> Payment was cancelled.</div>
      )}

      <div className="mt-8 max-w-md rounded-2xl border border-border bg-card p-6">
        <PosPaymentForm form={form} setForm={setForm} loading={loading} onSubmit={charge} />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Checkout opens in a new tab when embedded, or in this tab otherwise. Launch is always charged once; monthly options are purchased separately. Manual quote amounts must include applicable tax.</p>
    </div>
  );
}