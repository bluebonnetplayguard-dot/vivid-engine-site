import { Rocket, Clock, ShieldCheck, Sparkles, LifeBuoy, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const credentials = [
  { icon: Rocket, title: "Fast Delivery", desc: "Most projects launch in weeks, not months — without cutting corners." },
  { icon: BadgeCheck, title: "Custom-Built", desc: "Every website and app is built around your business, never a template." },
  { icon: Sparkles, title: "AI-Powered", desc: "Smart estimating, outreach, and content tools baked into your platform." },
  { icon: ShieldCheck, title: "Secure & Confidential", desc: "Your data stays private and protected on a secure, reliable platform." },
  { icon: LifeBuoy, title: "Ongoing Support", desc: "Basic Care covers essential maintenance. Turnkey Care adds monthly edits, reports and priority support." },
  { icon: Clock, title: "Transparent Pricing", desc: "Clear quotes and honest timelines — no surprises, no lock-in." },
];

export default function PricingSection() {
  return (
    <section id="why-us" className="py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-2xl">
          <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">§ 04 — Why Us</span>
          <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight md:text-4xl">Why choose Vivid Engine</h2>
          <p className="mt-4 text-muted-foreground">Fast, custom, and built to run your business — not just look pretty.</p>
        </div>
        <div className="mt-10 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {credentials.map((c, i) => (
            <div key={c.title} className="bg-card p-6">
              <div className="flex items-center justify-between">
                <c.icon className="h-6 w-6 text-accent" />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <h3 className="mt-4 font-heading text-base font-semibold">{c.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{c.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 border border-primary/40 bg-primary/5 p-8 text-center md:p-12">
          <h3 className="font-heading text-2xl font-bold">Ready to launch your project?</h3>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">Get a free consultation and a clear quote — let's bring your idea online.</p>
          <a href="#contact" className="mt-6 inline-block"><Button size="lg">Start a project</Button></a>
        </div>
      </div>
    </section>
  );
}