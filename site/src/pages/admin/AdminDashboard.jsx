import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from '@/api/client';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';
import { Users, FileText, Receipt, TrendingUp } from "lucide-react";

const fmt = (n) => (n || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  useEffect(() => {
    Promise.all([
      api.entities.Lead.list("-created_date", 50).catch(() => []),
      api.entities.Quote.list("-created_date", 50).catch(() => []),
      api.entities.Invoice.list("-created_date", 50).catch(() => []),
      api.entities.Cost.list("-created_date", 50).catch(() => []),
    ]).then(([leads, quotes, invoices, costs]) => {
      const revenue = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + (i.total || 0), 0);
      const outstanding = invoices.filter((i) => i.status !== "paid" && i.status !== "draft").reduce((s, i) => s + (i.total || 0), 0);
      const totalCosts = costs.reduce((s, c) => s + (c.amount || 0), 0);
      setData({ leads, quotes, invoices, costs, revenue, outstanding, totalCosts, profit: revenue - totalCosts });
    });
  }, []);

  if (!data) return <div className="flex h-full items-center justify-center p-10"><PageMeta {...PAGE_META.adminDashboard} noindex /><h1 className="sr-only">Business OS Dashboard</h1><div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" /></div>;

  const stats = [
    { label: "Total leads", value: data.leads.length, sub: `${data.leads.filter((l) => l.status === "new").length} new`, icon: Users, to: "/admin/leads" },
    { label: "Open quotes", value: data.quotes.filter((q) => q.status !== "accepted" && q.status !== "rejected").length, sub: fmt(data.quotes.reduce((s, q) => s + (q.total || 0), 0)), icon: FileText, to: "/admin/quotes" },
    { label: "Outstanding", value: fmt(data.outstanding), sub: `${data.invoices.filter((i) => i.status !== "paid").length} unpaid`, icon: Receipt, to: "/admin/invoices" },
    { label: "Revenue (paid)", value: fmt(data.revenue), sub: `Profit ${fmt(data.profit)}`, icon: TrendingUp, to: "/admin/invoices" },
  ];

  return (
    <div className="p-6 md:p-10">
      <PageMeta {...PAGE_META.adminDashboard} noindex />
      <h1 className="font-heading text-2xl font-bold">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your business at a glance.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className="group rounded-2xl border border-border bg-card p-5 transition-all hover:border-primary/50">
            <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{s.label}</span><s.icon className="h-4 w-4 text-muted-foreground" /></div>
            <div className="mt-3 font-heading text-2xl font-bold">{s.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.sub}</div>
          </Link>
        ))}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between"><h2 className="font-heading font-semibold">Recent leads</h2><Link to="/admin/leads" className="text-xs text-primary">View all</Link></div>
          <div className="mt-4 space-y-3">
            {data.leads.slice(0, 5).map((l) => (
              <div key={l.id} className="flex items-center justify-between">
                <div><div className="text-sm font-medium">{l.name}</div><div className="text-xs text-muted-foreground">{l.service_interest || "—"}</div></div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">{l.status}</span>
              </div>
            ))}
            {data.leads.length === 0 && <p className="text-sm text-muted-foreground">No leads yet.</p>}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between"><h2 className="font-heading font-semibold">Recent invoices</h2><Link to="/admin/invoices" className="text-xs text-primary">View all</Link></div>
          <div className="mt-4 space-y-3">
            {data.invoices.slice(0, 5).map((i) => (
              <div key={i.id} className="flex items-center justify-between">
                <div><div className="text-sm font-medium">{i.client_name}</div><div className="text-xs text-muted-foreground">{i.number}</div></div>
                <div className="text-right"><div className="text-sm font-medium">{fmt(i.total)}</div><span className="text-xs capitalize text-muted-foreground">{i.status}</span></div>
              </div>
            ))}
            {data.invoices.length === 0 && <p className="text-sm text-muted-foreground">No invoices yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}