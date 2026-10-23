import { useEffect, useState } from "react";
import { api } from '@/api/client';
import { Star } from "lucide-react";

export default function TestimonialsSection() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.entities.Testimonial.list("-order", 20)
      .then((d) => { setItems(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  return (
    <section id="testimonials" className="py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-2xl">
          <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">§ 03b — Testimonials</span>
          <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight md:text-4xl">What clients say</h2>
          <p className="mt-4 text-muted-foreground">Trusted by founders and teams to bring their vision online.</p>
        </div>
        <div className="mt-10 grid gap-px border border-border bg-border md:grid-cols-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-48 animate-pulse bg-card" />
            ))
          ) : items.length === 0 ? (
            <p className="col-span-full bg-card px-6 py-10 text-center text-muted-foreground">Reviews coming soon.</p>
          ) : items.map((t, i) => (
            <div key={t.id} className="bg-card p-6">
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {Array.from({ length: t.rating || 5 }).map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-accent text-accent" />
                  ))}
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-foreground">"{t.quote}"</p>
              <div className="mt-6 flex items-center gap-3 border-t border-border pt-4">
                <div className="flex h-10 w-10 items-center justify-center border border-primary bg-primary text-sm font-semibold text-primary-foreground">
                  {(t.client_name || "?").charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-semibold">{t.client_name}</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{t.role}{t.company ? ` · ${t.company}` : ""}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}