import { MapPin, Users, Wrench, CreditCard } from "lucide-react";

const signals = [
  { icon: MapPin, label: "SETX & SWLA local" },
  { icon: Users, label: "Face-to-face consults" },
  { icon: Wrench, label: "Build, launch & run it" },
  { icon: CreditCard, label: "Site · POS · CRM · SEO in one" },
];

export default function TrustBar() {
  return (
    <section className="border-b border-border bg-secondary/30">
      <div className="mx-auto max-w-7xl px-6 py-5">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {signals.map((s) => (
            <div key={s.label} className="flex items-center justify-center gap-2.5 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground md:gap-3">
              <s.icon className="h-4 w-4 shrink-0 text-accent" />
              {s.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}