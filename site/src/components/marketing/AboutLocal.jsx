import { MapPin, Handshake, Users, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

const cities = ["Beaumont", "Port Arthur", "Orange", "Lumberton", "Vidor", "Nederland", "Lake Charles", "Sulphur", "Jennings", "DeRidder", "Vinton", "Iowa"];

export default function AboutLocal() {
  return (
    <section id="about" className="py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">§ 06 — About</span>
            <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight md:text-4xl">We sit down with you — in person</h2>
            <p className="mt-4 text-muted-foreground">
              Vivid Engine Solutions is a local, in-person web & app company serving Southeast Texas and Southwest Louisiana. No Zoom-only relationship, no support ticket queue — just a real person you can meet with face-to-face to plan your project.
            </p>
            <div className="mt-8 space-y-4">
              <div className="flex items-start gap-3 border-l-2 border-accent/50 pl-4">
                <Handshake className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Face-to-face consults.</span> We meet locally to understand your business before we build.</p>
              </div>
              <div className="flex items-start gap-3 border-l-2 border-accent/50 pl-4">
                <Wrench className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Turnkey.</span> Choose a one-time Starter, Launch or Full Engine build, then add Basic Care ($49/mo) or Turnkey Care ($99/mo) for ongoing maintenance.</p>
              </div>
              <div className="flex items-start gap-3 border-l-2 border-accent/50 pl-4">
                <Users className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">One vendor for everything.</span> Site, POS, CRM, SEO, hosting, and security — all under one roof.</p>
              </div>
            </div>
            <a href="#contact" className="mt-8 inline-block"><Button>Book an in-person consult</Button></a>
          </div>
          <div className="border border-border">
            <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-accent" /> Service Area</span>
              <span>SETX · SWLA</span>
            </div>
            <div className="p-6">
              <h3 className="font-heading text-xl font-semibold">Southeast Texas & Southwest Louisiana</h3>
              <p className="mt-2 text-sm text-muted-foreground">In-person consultations available across the region:</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {cities.map((c) => (
                  <span key={c} className="border border-border bg-secondary/30 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{c}</span>
                ))}
              </div>
              <p className="mt-5 text-xs text-muted-foreground">Outside the area? We can still help remotely — just ask.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}