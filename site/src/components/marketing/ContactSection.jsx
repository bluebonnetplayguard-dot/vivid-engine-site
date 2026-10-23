import { useState } from "react";
import { api } from '@/api/client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import BottomDrawerSelect from "@/components/ui/BottomDrawerSelect";
import { Send, Loader2, MapPin, Mail, Handshake } from "lucide-react";

const services = [
  "Website Design",
  "Web App Development",
  "Mobile App",
  "POS System",
  "CRM & Business Software",
  "E-commerce Store",
  "Branding & Logo",
  "SEO & Ads",
  "Hosting & Maintenance",
  "Other",
];

export default function ContactSection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", company: "", service_interest: "Website Design", message: "" });
  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.entities.ContactSubmission.create(form);
      toast({ title: "Request sent!", description: "We'll reach out within one business day to set up a consult." });
      setForm({ name: "", email: "", company: "", service_interest: "Website Design", message: "" });
    } catch (err) {
      toast({ variant: "destructive", title: "Something went wrong", description: "Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="contact" className="py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">§ 08 — Contact</span>
            <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight md:text-4xl">Let's sit down</h2>
            <p className="mt-4 text-muted-foreground">Tell us about your project and we'll set up a free, no-pressure consultation — in person if you're in the area. We respond within one business day.</p>
            <div className="mt-8 space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-secondary/40 text-accent"><Mail className="h-4 w-4" /></span>
                <div><div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Email</div><div className="font-medium"><a href="mailto:info@vividenginesolutions.com" className="transition-colors hover:text-accent">info@vividenginesolutions.com</a></div></div>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-secondary/40 text-accent"><MapPin className="h-4 w-4" /></span>
                <div><div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Service area</div><div className="font-medium">Southeast Texas & Southwest Louisiana</div></div>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-secondary/40 text-accent"><Handshake className="h-4 w-4" /></span>
                <div><div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Consultations</div><div className="font-medium">In-person available · No Zoom required</div></div>
              </div>
            </div>
          </div>
          <form onSubmit={submit} className="border border-border">
            <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              <span>Project Inquiry</span>
              <span>Form 01</span>
            </div>
            <div className="grid gap-4 p-6 md:p-8">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" required value={form.name} onChange={update("name")} placeholder="Jane Doe" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={form.email} onChange={update("email")} placeholder="jane@email.com" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company">Company (optional)</Label>
                <Input id="company" value={form.company} onChange={update("company")} placeholder="Your company" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="service">Service needed</Label>
                <BottomDrawerSelect
                  value={form.service_interest}
                  onChange={(v) => setForm((f) => ({ ...f, service_interest: v }))}
                  options={services}
                  title="Service needed"
                  triggerClassName="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="message">Project details</Label>
                <Textarea id="message" required value={form.message} onChange={update("message")} placeholder="Tell us about your business and what you need..." rows={4} />
              </div>
              <Button type="submit" disabled={loading} className="mt-2 w-full">
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</> : <><Send className="mr-2 h-4 w-4" /> Request a free consult</>}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}