import { useEffect, useState } from "react";
import { api } from '@/api/client';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Sparkles, Copy, Loader2, Phone, Mail } from "lucide-react";
import RadixSelect from "@/components/admin/RadixSelect";

const statuses = ["new", "contacted", "qualified", "won", "lost"];
const statusColor = { new: "bg-blue-500/10 text-blue-400", contacted: "bg-purple-500/10 text-purple-400", qualified: "bg-amber-500/10 text-amber-400", won: "bg-green-500/10 text-green-400", lost: "bg-red-500/10 text-red-400" };

export default function AdminLeads() {
  const { toast } = useToast();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", service_interest: "Website Design", source: "Website", estimated_value: 0, notes: "" });
  const [aiLead, setAiLead] = useState(null);
  const [aiMsg, setAiMsg] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const load = () => { setLoading(true); api.entities.Lead.list("-created_date", 100).then((d) => { setLeads(d); setLoading(false); }); };
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.entities.Lead.create({ ...form, estimated_value: Number(form.estimated_value) || 0 });
      setOpen(false);
      setForm({ name: "", email: "", phone: "", company: "", service_interest: "Website Design", source: "Website", estimated_value: 0, notes: "" });
      load();
      toast({ title: "Lead added" });
    } catch { toast({ variant: "destructive", title: "Failed to add lead" }); }
  };

  const setStatus = async (lead, status) => { await api.entities.Lead.update(lead.id, { status }); load(); };

  const generate = async (lead) => {
    setAiLead(lead); setAiMsg(""); setAiLoading(true);
    try {
      const res = await api.functions.invoke("generateLeadOutreach", { lead_name: lead.name, lead_company: lead.company, service_interest: lead.service_interest, our_business: "Vivid Engine" });
      setAiMsg(res.data.message);
    } catch { setAiMsg("Sorry, generation failed."); } finally { setAiLoading(false); }
  };

  const copy = () => { navigator.clipboard.writeText(aiMsg); toast({ title: "Copied to clipboard" }); };

  return (
    <div className="p-6 md:p-10">
      <PageMeta {...PAGE_META.adminLeads} noindex />
      <div className="flex items-center justify-between">
        <div><h1 className="font-heading text-2xl font-bold">Leads</h1><p className="mt-1 text-sm text-muted-foreground">Track prospects and generate outreach with AI.</p></div>
        <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Add lead</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add lead</DialogTitle></DialogHeader>
            <form onSubmit={create} className="grid gap-3">
              <div className="grid gap-2"><Label>Name</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div><div className="grid gap-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div></div>
              <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>Company</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div><div className="grid gap-2"><Label>Service interest</Label><Input value={form.service_interest} onChange={(e) => setForm({ ...form, service_interest: e.target.value })} /></div></div>
              <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>Source</Label><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></div><div className="grid gap-2"><Label>Est. value ($)</Label><Input type="number" value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} /></div></div>
              <div className="grid gap-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
              <DialogFooter><Button type="submit">Save lead</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="mt-8 rounded-2xl border border-border bg-card">
        {loading ? <div className="p-10 text-center text-muted-foreground">Loading...</div> : leads.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">No leads yet.</div> : (
          <div className="divide-y divide-border">
            {leads.map((l) => (
              <div key={l.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="font-medium">{l.name}</span>{l.company && <span className="text-sm text-muted-foreground">· {l.company}</span>}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{l.service_interest || "—"}</span>{l.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{l.email}</span>}{l.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{l.phone}</span>}
                    {l.estimated_value > 0 && <span>Est. ${(l.estimated_value).toLocaleString()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => generate(l)}><Sparkles className="mr-2 h-4 w-4 text-accent" /> AI outreach</Button>
                  <RadixSelect value={l.status} onValueChange={(v) => setStatus(l, v)} options={statuses} className={`h-9 w-auto rounded-full border-0 px-3 text-xs font-medium capitalize ${statusColor[l.status] || "bg-muted text-muted-foreground"}`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Dialog open={!!aiLead} onOpenChange={(o) => !o && setAiLead(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>AI outreach message</DialogTitle></DialogHeader>
          {aiLoading ? <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : (
            <>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{aiMsg}</p>
              <DialogFooter><Button variant="outline" size="sm" onClick={copy}><Copy className="mr-2 h-4 w-4" /> Copy</Button></DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}