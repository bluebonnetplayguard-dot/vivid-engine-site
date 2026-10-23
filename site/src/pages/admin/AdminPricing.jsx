import { useCallback, useEffect, useState } from "react";
import { api } from '@/api/client';
import { PageMeta } from '@/components/SeoSchema';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import RadixSelect from "@/components/admin/RadixSelect";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Activity, Bell, Check, ChevronDown, ChevronUp, Download, ExternalLink, Loader2, Plus, RefreshCw, RotateCcw, Search, Sparkles, X } from "lucide-react";

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" }));
const pctFmt = (n) => (n == null ? "—" : `${n > 0 ? "+" : ""}${Number(n).toFixed(1)}%`);
const COLOR = {
  green: { label: "Competitive", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  yellow: { label: "Review", cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  red: { label: "Significant deviation", cls: "bg-red-500/15 text-red-500 border-red-500/30" },
  blue: { label: "Margin opportunity", cls: "bg-sky-500/15 text-sky-500 border-sky-500/30" },
  gray: { label: "No verified data", cls: "bg-muted text-muted-foreground border-border" },
};
const MODES = [
  { value: "manual", label: "Manual: you set all prices; AI only recommends" },
  { value: "assisted", label: "AI-assisted: recommendations need your approval" },
  { value: "automatic", label: "Automatic: changes within your limits apply on their own" },
];
const SCHEDULES = [
  { value: "manual", label: "Only when I click Analyze" }, { value: "hourly", label: "Hourly" }, { value: "6h", label: "Every 6 hours" },
  { value: "12h", label: "Every 12 hours" }, { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" },
];
const RULE_FIELDS = [
  ["min_margin_pct", "Minimum gross margin %"], ["max_margin_pct", "Maximum gross margin % (blank = none)"],
  ["max_auto_increase_pct", "Max automatic increase %"], ["max_auto_decrease_pct", "Max automatic decrease %"],
  ["max_daily_change_pct", "Max change per day %"], ["approval_threshold_pct", "Changes above this % need approval"],
  ["min_price", "Minimum selling price $ (blank = none)"], ["max_price", "Maximum selling price $ (blank = none)"],
  ["min_sources", "Verified sources required"], ["min_confidence", "Minimum source confidence (0–1)"],
  ["cooldown_hours", "Cooldown between changes (hours)"], ["max_source_age_hours", "Market data counts as fresh for (hours)"],
  ["deadband_pct", "Green: within % of market"], ["red_pct", "Red: above market by more than %"],
  ["blue_pct", "Blue: below market by more than %"], ["market_position_pct", "When lowering, sit this % vs. average"],
  ["increase_capture_pct", "When raising, close this % of the gap"], ["volatility_pct", "Hold automatic changes if market moves more than %"],
];
const NULLABLE = new Set(["max_margin_pct", "min_price", "max_price"]);
const emptyItem = { name: "", kind: "service", current_price: "", unit_cost: "", operating_cost: "", delivery_cost: "", region: "", search_query: "" };
const emptyPrice = { competitor_name: "", product_name: "", price: "", source_url: "", location: "", price_type: "advertised", verified: true };

function StatusBadge({ color }) {
  const c = COLOR[color] || COLOR.gray;
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${c.cls}`}>{c.label}</span>;
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-heading text-xl font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default function AdminPricing() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [busy, setBusy] = useState("");
  const [selected, setSelected] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState({ prices: [], history: [] });
  const [itemOpen, setItemOpen] = useState(false);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [priceOpen, setPriceOpen] = useState(false);
  const [priceForm, setPriceForm] = useState(emptyPrice);
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const [autoConfirm, setAutoConfirm] = useState({ open: false, phrase: "" });

  const fail = (e, title = "Something went wrong") => toast({ variant: "destructive", title, description: e?.message });

  const load = useCallback(async () => {
    try {
      const [{ data: overview }, alertRows] = await Promise.all([
        api.functions.invoke("pricingOverview"),
        api.entities.PricingAlert.list("-created_date", 20),
      ]);
      setData(overview);
      setAlerts(alertRows);
      setSettingsDraft((d) => d ?? { mode: overview.settings.mode, schedule: overview.settings.schedule, rules: overview.settings.rules, providers: overview.settings.providers || {} });
    } catch (e) { fail(e, "Could not load pricing"); }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Phones and computers stay in sync: refresh when anyone changes pricing data.
  useEffect(() => {
    let timer;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(load, 600); };
    const subs = ["PricingItem", "PriceRecommendation", "PricingAlert", "PricingSettings"].map((n) => api.entities[n].subscribe(refresh));
    return () => { clearTimeout(timer); subs.forEach((u) => u()); };
  }, [load]);

  const loadDetail = async (itemId) => {
    const [prices, history] = await Promise.all([
      api.entities.CompetitorPrice.filter({ pricing_item_id: itemId }, "-created_date", 50),
      api.entities.PriceHistory.filter({ pricing_item_id: itemId }, "-created_date", 50),
    ]);
    setDetail({ prices, history });
  };
  const toggle = async (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id); setDetail({ prices: [], history: [] });
    try { await loadDetail(id); } catch (e) { fail(e); }
  };

  const run = async (label, fn, success) => {
    setBusy(label);
    try { const res = await fn(); if (success) toast({ title: typeof success === "function" ? success(res) : success }); await load(); if (expanded) await loadDetail(expanded); return res; }
    catch (e) { fail(e); return null; }
    finally { setBusy(""); }
  };
  const invoke = (name, body = {}) => api.functions.invoke(name, body).then((r) => r.data);

  const analyze = () => run("analyze", () => invoke("pricingAnalyze"), (r) => `Analyzed ${r.recommendations.length} item(s)`);
  const refreshPrices = () => run("refresh", () => invoke("pricingRefreshCompetitors"), (r) => {
    const stored = r.items.reduce((s, i) => s + i.stored, 0);
    const configured = Object.values(r.configured).some(Boolean);
    return configured ? `${stored} new market price(s) found` : "No research providers are configured yet (add API keys on the server)";
  });
  const recommendAll = () => run("recommend", () => invoke("pricingRecommend"), "Recommendations updated");
  const decide = (rec, action) => run(`decide-${rec.id}`, () => invoke("pricingDecide", { recommendation_id: rec.id, action }), action === "approve" ? "Approved. Apply it when ready." : "Rejected");
  const applySelected = () => {
    const ids = data.items.map((i) => i.recommendation).filter((r) => r && selected.includes(r.pricing_item_id) && r.status === "approved").map((r) => r.id);
    if (!ids.length) { toast({ title: "Select items with approved recommendations" }); return; }
    run("apply", () => invoke("pricingApply", { recommendation_ids: ids }), (r) => `Applied ${r.applied.length} change(s)${r.skipped.length ? `, skipped ${r.skipped.length}` : ""}`).then(() => setSelected([]));
  };
  const restore = (h) => run(`restore-${h.id}`, () => invoke("pricingRestore", { history_id: h.id }), `Restored ${fmt(h.old_price)}`);
  const exportReport = async () => {
    const r = await run("export", () => invoke("pricingReport"));
    if (!r) return;
    const url = URL.createObjectURL(new Blob([r.csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: r.filename });
    a.click(); URL.revokeObjectURL(url);
  };

  const saveItem = async (e) => {
    e.preventDefault();
    const num = (v) => (v === "" ? undefined : Number(v));
    const body = { ...itemForm, current_price: Number(itemForm.current_price), unit_cost: num(itemForm.unit_cost), operating_cost: num(itemForm.operating_cost), delivery_cost: num(itemForm.delivery_cost) };
    const ok = await run("item", () => api.entities.PricingItem.create(body), "Item added");
    if (ok) { setItemOpen(false); setItemForm(emptyItem); }
  };
  const savePrice = async (e) => {
    e.preventDefault();
    const body = { ...priceForm, pricing_item_id: expanded, price: Number(priceForm.price), source_provider: "manual", retrieved_at: new Date().toISOString(), confidence: priceForm.verified ? 0.9 : 0.4 };
    const ok = await run("price", () => api.entities.CompetitorPrice.create(body), "Market price saved");
    if (ok) { setPriceOpen(false); setPriceForm(emptyPrice); }
  };

  const saveSettings = async (extra = {}) => {
    const rules = Object.fromEntries(Object.entries(settingsDraft.rules).map(([k, v]) => [k, v === "" || v == null ? (NULLABLE.has(k) ? null : undefined) : typeof v === "string" && k !== "rounding" ? Number(v) : v]).filter(([, v]) => v !== undefined));
    const body = { mode: settingsDraft.mode, schedule: settingsDraft.schedule, rules, providers: settingsDraft.providers, ...extra };
    if (body.mode !== "automatic") body.auto_enabled = false;
    const res = await run("settings", () => invoke("pricingUpdateSettings", body), "Pricing settings saved");
    if (res) setSettingsDraft({ mode: res.mode, schedule: res.schedule, rules: { ...settingsDraft.rules, ...res.rules }, providers: res.providers || {} });
    return res;
  };
  const toggleAuto = async (on) => {
    if (!on) { await saveSettings({ auto_enabled: false }); return; }
    if (settingsDraft.mode !== "automatic") { toast({ variant: "destructive", title: "Choose Automatic mode first" }); return; }
    setAutoConfirm({ open: true, phrase: "" });
  };
  const confirmAuto = async () => {
    const res = await saveSettings({ auto_enabled: true, confirm_automatic: autoConfirm.phrase });
    if (res) setAutoConfirm({ open: false, phrase: "" });
  };
  const markRead = async (a) => { try { await api.entities.PricingAlert.update(a.id, { read: true }); setAlerts((x) => x.map((y) => (y.id === a.id ? { ...y, read: true } : y))); } catch (e) { fail(e); } };

  if (!data || !settingsDraft) {
    return <div className="flex h-full items-center justify-center p-10"><PageMeta title="Market Pricing" description="AI market pricing dashboard" path="/admin/pricing" noindex /><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const { totals, settings } = data;
  const phrase = settings.auto_confirm_phrase;
  const providersOn = Object.entries(settings.provider_status || {}).filter(([, v]) => v).map(([k]) => k);
  const chartData = [...detail.history].reverse().map((h) => ({ date: new Date(h.created_date).toLocaleDateString(), price: h.new_price, market: h.market_average ?? null, margin: h.gross_margin_pct }));

  return (
    <div className="space-y-6 p-4 md:p-10">
      <PageMeta title="Market Pricing" description="AI market pricing dashboard: verified market prices, recommendations, approvals and history." path="/admin/pricing" noindex />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Market Pricing</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Verified market prices, AI recommendations and your approvals. Changes update your pricing records here; they do not change the website's price list or Stripe checkout.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={analyze} disabled={!!busy}>{busy === "analyze" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Analyze market</Button>
          <Button variant="outline" onClick={refreshPrices} disabled={!!busy}>{busy === "refresh" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Refresh competitor prices</Button>
          <Button variant="outline" onClick={recommendAll} disabled={!!busy}><Sparkles className="mr-2 h-4 w-4" />Generate recommendations</Button>
          <Button variant="outline" onClick={exportReport} disabled={!!busy}><Download className="mr-2 h-4 w-4" />Export report</Button>
          <Button variant="outline" onClick={() => setItemOpen(true)}><Plus className="mr-2 h-4 w-4" />Add item</Button>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8" aria-label="Market overview">
        <Stat label="Monitored products" value={totals.products} />
        <Stat label="Monitored services" value={totals.services} />
        <Stat label="Need review" value={totals.needs_review} />
        <Stat label="Recommended increases" value={totals.increases} />
        <Stat label="Recommended decreases" value={totals.decreases} />
        <Stat label="Gross profit impact" value={fmt(totals.potential_gross_profit_impact_per_unit)} sub="per unit, if all applied" />
        <Stat label="Freshest market data" value={totals.freshest_data_hours == null ? "—" : `${Math.round(totals.freshest_data_hours)}h old`} />
        <Stat label="Research providers" value={providersOn.length ? providersOn.join(", ") : "None set up"} sub={settings.last_run_status || "No scheduled run yet"} />
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="grid flex-1 gap-2"><Label>Pricing mode</Label><RadixSelect value={settingsDraft.mode} onValueChange={(v) => setSettingsDraft({ ...settingsDraft, mode: v })} options={MODES} className="h-10" /></div>
          <div className="grid gap-2 lg:w-64"><Label>Market analysis schedule</Label><RadixSelect value={settingsDraft.schedule} onValueChange={(v) => setSettingsDraft({ ...settingsDraft, schedule: v })} options={SCHEDULES} className="h-10" /></div>
          <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-2">
            <Switch id="auto" checked={!!settings.auto_enabled} onCheckedChange={toggleAuto} disabled={!!busy} />
            <Label htmlFor="auto" className="text-sm">Automatic adjustments {settings.auto_enabled ? <span className="text-amber-500">ON</span> : <span className="text-muted-foreground">off</span>}</Label>
          </div>
          <Button onClick={() => saveSettings()} disabled={!!busy}>Save settings</Button>
        </div>
        {settings.auto_enabled && <p className="mt-3 text-xs text-amber-500">Automatic pricing enabled by {settings.auto_enabled_by} on {new Date(settings.auto_enabled_at).toLocaleString()}. Only changes that pass every rule below apply on their own; everything else waits for approval.</p>}
        <button type="button" onClick={() => setShowRules(!showRules)} className="mt-4 flex items-center gap-1 text-sm font-medium text-primary">{showRules ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}Pricing rules and profit protection</button>
        {showRules && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {RULE_FIELDS.map(([key, label]) => (
              <div key={key} className="grid gap-1"><Label className="text-xs">{label}</Label>
                <Input type="number" step="any" value={settingsDraft.rules[key] ?? ""} onChange={(e) => setSettingsDraft({ ...settingsDraft, rules: { ...settingsDraft.rules, [key]: e.target.value } })} /></div>
            ))}
            <div className="grid gap-1"><Label className="text-xs">Rounding</Label><RadixSelect value={settingsDraft.rules.rounding} onValueChange={(v) => setSettingsDraft({ ...settingsDraft, rules: { ...settingsDraft.rules, rounding: v } })} options={[{ value: "dollar", label: "Whole dollars" }, { value: "ninety_nine", label: "Ends in .99" }, { value: "cent", label: "Exact cents" }]} className="h-10" /></div>
            <div className="flex items-center gap-3 pt-5"><Switch id="promos" checked={!!settingsDraft.rules.include_promotions} onCheckedChange={(v) => setSettingsDraft({ ...settingsDraft, rules: { ...settingsDraft.rules, include_promotions: v } })} /><Label htmlFor="promos" className="text-xs">Count promotional prices in market averages</Label></div>
            <div className="flex flex-wrap items-center gap-4 pt-5 sm:col-span-2 lg:col-span-3">
              {["tavily", "exa", "perplexity"].map((p) => (
                <label key={p} className="flex items-center gap-2 text-xs capitalize">
                  <Switch checked={settingsDraft.providers?.[p] !== false} onCheckedChange={(v) => setSettingsDraft({ ...settingsDraft, providers: { ...settingsDraft.providers, [p]: v } })} />
                  {p} {settings.provider_status?.[p] ? "" : <span className="text-muted-foreground">(no API key)</span>}
                </label>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
          <h2 className="font-heading font-semibold">Product and service pricing</h2>
          <Button size="sm" onClick={applySelected} disabled={!!busy || !selected.length}><Check className="mr-2 h-4 w-4" />Apply selected ({selected.length})</Button>
        </div>
        {data.items.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No items yet. Add the products or services you want to monitor.</p> : (
          <div className="divide-y divide-border">
            <div className="hidden grid-cols-[2rem_2fr_repeat(4,1fr)_1.3fr_1.4fr] gap-3 px-4 py-2 text-xs font-medium text-muted-foreground lg:grid">
              <span /><span>Item</span><span>Current</span><span>Market avg</span><span>Recommended</span><span>Change</span><span>Status</span><span>Action</span>
            </div>
            {data.items.map((item) => {
              const rec = item.recommendation;
              const open = expanded === item.id;
              const live = rec && ["pending", "approved"].includes(rec.status) && rec.direction !== "none";
              return (
                <div key={item.id}>
                  <div className="grid grid-cols-2 items-center gap-3 px-4 py-3 text-sm lg:grid-cols-[2rem_2fr_repeat(4,1fr)_1.3fr_1.4fr]">
                    <input type="checkbox" aria-label={`Select ${item.name}`} className="h-4 w-4" checked={selected.includes(item.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, item.id] : s.filter((x) => x !== item.id)))} />
                    <button type="button" onClick={() => toggle(item.id)} className="col-span-1 flex items-center gap-1 text-left font-medium lg:col-span-1">{open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}<span>{item.name}<span className="block text-xs font-normal capitalize text-muted-foreground">{item.kind}{item.active === false ? " · paused" : ""}</span></span></button>
                    <span><span className="text-xs text-muted-foreground lg:hidden">Current </span>{fmt(item.current_price)}</span>
                    <span><span className="text-xs text-muted-foreground lg:hidden">Market </span>{fmt(rec?.market?.average)}</span>
                    <span><span className="text-xs text-muted-foreground lg:hidden">Recommended </span>{live ? fmt(rec.recommended_price) : "—"}</span>
                    <span className={live && rec.change_pct > 0 ? "text-emerald-500" : live && rec.change_pct < 0 ? "text-red-500" : ""}>{live ? pctFmt(rec.change_pct) : "0%"}</span>
                    <span>{rec && ["applied", "rejected"].includes(rec.status) ? <span className="text-xs text-muted-foreground">Last analysis {rec.status}</span> : <StatusBadge color={rec?.status_color || "gray"} />}</span>
                    <span className="flex flex-wrap items-center gap-1">
                      {rec?.status === "pending" && <>
                        <Button size="sm" variant="outline" onClick={() => decide(rec, "approve")} disabled={!!busy}><Check className="mr-1 h-3 w-3" />Approve</Button>
                        <Button size="sm" variant="ghost" onClick={() => decide(rec, "reject")} disabled={!!busy}><X className="mr-1 h-3 w-3" />Reject</Button>
                      </>}
                      {rec?.status === "approved" && <span className="text-xs font-medium text-emerald-500">Approved: select and apply</span>}
                      {(!rec || rec.status === "info") && <span className="text-xs text-muted-foreground">No change</span>}
                      {rec?.status === "applied" && <span className="text-xs text-muted-foreground">Applied {fmt(rec.recommended_price)}. Analyze again to re-check.</span>}
                      {rec?.status === "rejected" && <span className="text-xs text-muted-foreground">Rejected</span>}
                    </span>
                  </div>
                  {open && (
                    <div className="space-y-4 bg-muted/30 px-4 py-4 text-sm">
                      {rec && <div className="rounded-xl border border-border bg-card p-4">
                        <div className="font-medium">Why</div>
                        <p className="mt-1 text-muted-foreground">{rec.explanation}</p>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                          <span>Gross margin: <b>{rec.gross_margin_pct ?? "—"}%</b></span><span>Markup: <b>{rec.markup_pct ?? "—"}%</b></span>
                          <span>Verified sources: <b>{rec.market?.sources ?? 0}</b></span><span>Confidence: <b>{rec.market?.confidence ?? 0}</b></span>
                          <span>Low: <b>{fmt(rec.market?.low)}</b></span><span>High: <b>{fmt(rec.market?.high)}</b></span><span>Median: <b>{fmt(rec.market?.median)}</b></span><span>Excluded prices: <b>{rec.market?.excluded ?? 0}</b></span>
                        </div>
                        {rec.blocked_reasons?.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-amber-500">{rec.blocked_reasons.map((b) => <li key={b}>{b}</li>)}</ul>}
                      </div>}
                      <div className="rounded-xl border border-border bg-card p-4">
                        <div className="flex items-center justify-between"><div className="font-medium">Competitor and market prices</div><Button size="sm" variant="outline" onClick={() => setPriceOpen(true)}><Plus className="mr-1 h-3 w-3" />Add price</Button></div>
                        {detail.prices.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No market prices yet.</p> : (
                          <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[640px] text-xs">
                            <thead className="text-left text-muted-foreground"><tr><th className="py-1">Competitor</th><th>Price</th><th>Diff vs ours</th><th>Type</th><th>Verified</th><th>Retrieved</th><th>Source</th></tr></thead>
                            <tbody className="divide-y divide-border">{detail.prices.map((p) => (
                              <tr key={p.id}><td className="py-1.5">{p.competitor_name || "—"}<span className="block text-muted-foreground">{p.product_name}</span></td>
                                <td>{fmt(p.price)}</td><td>{pctFmt(((item.current_price - p.price) / p.price) * 100)}</td>
                                <td className="capitalize">{(p.price_type || "").replace("_", " ")}{p.is_promotional ? " · promo" : ""}</td>
                                <td title={p.verification_note}>{p.verified ? <span className="text-emerald-500">Yes</span> : <span className="text-amber-500">No</span>}</td>
                                <td>{p.retrieved_at ? new Date(p.retrieved_at).toLocaleString() : "—"}</td>
                                <td><a href={p.source_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-primary underline">{p.source_provider}<ExternalLink className="h-3 w-3" /></a></td></tr>
                            ))}</tbody>
                          </table></div>
                        )}
                      </div>
                      <div className="rounded-xl border border-border bg-card p-4">
                        <div className="font-medium">Price history</div>
                        {chartData.length > 1 && <div className="mt-3 h-48"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Line type="monotone" dataKey="price" name="Our price" stroke="#1E9BFF" strokeWidth={2} /><Line type="monotone" dataKey="market" name="Market avg" stroke="#F59E0B" strokeWidth={2} connectNulls /></LineChart></ResponsiveContainer></div>}
                        {detail.history.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No price changes yet.</p> : (
                          <ul className="mt-2 divide-y divide-border text-xs">{detail.history.map((h) => (
                            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                              <span><b className="capitalize">{h.action.replace("_", " ")}</b> {fmt(h.old_price)} → {fmt(h.new_price)} · margin {h.gross_margin_pct ?? "—"}% · {new Date(h.created_date).toLocaleString()} · {h.approved_by}</span>
                              {h.old_price != null && <Button size="sm" variant="ghost" onClick={() => restore(h)} disabled={!!busy}><RotateCcw className="mr-1 h-3 w-3" />Restore {fmt(h.old_price)}</Button>}
                            </li>
                          ))}</ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 font-heading font-semibold"><Bell className="h-4 w-4" />Pricing alerts</h2>
        {alerts.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No alerts.</p> : (
          <ul className="mt-3 divide-y divide-border text-sm">{alerts.map((a) => (
            <li key={a.id} className={`flex items-start justify-between gap-3 py-2 ${a.read ? "opacity-60" : ""}`}>
              <div><div className="font-medium"><Activity className={`mr-1 inline h-3 w-3 ${a.severity === "critical" ? "text-red-500" : a.severity === "warning" ? "text-amber-500" : "text-primary"}`} />{a.title}</div><div className="text-xs text-muted-foreground">{a.message}</div><div className="text-xs text-muted-foreground">{new Date(a.created_date).toLocaleString()}</div></div>
              {!a.read && <Button size="sm" variant="ghost" onClick={() => markRead(a)}>Mark read</Button>}
            </li>
          ))}</ul>
        )}
      </section>

      <Dialog open={itemOpen} onOpenChange={setItemOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add product or service to monitor</DialogTitle></DialogHeader>
          <form onSubmit={saveItem} className="grid gap-3">
            <div className="grid gap-2"><Label>Name</Label><Input required value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} placeholder="e.g. 5-page small business website" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label>Type</Label><RadixSelect value={itemForm.kind} onValueChange={(v) => setItemForm({ ...itemForm, kind: v })} options={["service", "product"]} className="h-10 capitalize" /></div>
              <div className="grid gap-2"><Label>Current price ($)</Label><Input required type="number" step="0.01" min="0.01" value={itemForm.current_price} onChange={(e) => setItemForm({ ...itemForm, current_price: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2"><Label>Unit cost</Label><Input type="number" step="0.01" min="0" value={itemForm.unit_cost} onChange={(e) => setItemForm({ ...itemForm, unit_cost: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Operating</Label><Input type="number" step="0.01" min="0" value={itemForm.operating_cost} onChange={(e) => setItemForm({ ...itemForm, operating_cost: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Delivery</Label><Input type="number" step="0.01" min="0" value={itemForm.delivery_cost} onChange={(e) => setItemForm({ ...itemForm, delivery_cost: e.target.value })} /></div>
            </div>
            <div className="grid gap-2"><Label>Region</Label><Input value={itemForm.region} onChange={(e) => setItemForm({ ...itemForm, region: e.target.value })} placeholder="e.g. Beaumont, TX" /></div>
            <div className="grid gap-2"><Label>Search phrase for market research</Label><Input value={itemForm.search_query} onChange={(e) => setItemForm({ ...itemForm, search_query: e.target.value })} placeholder="e.g. small business website design price Beaumont TX" /></div>
            <DialogFooter><Button type="submit" disabled={!!busy}>Save item</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={priceOpen} onOpenChange={setPriceOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add a market price</DialogTitle></DialogHeader>
          <form onSubmit={savePrice} className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label>Competitor</Label><Input value={priceForm.competitor_name} onChange={(e) => setPriceForm({ ...priceForm, competitor_name: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Price ($)</Label><Input required type="number" step="0.01" min="0.01" value={priceForm.price} onChange={(e) => setPriceForm({ ...priceForm, price: e.target.value })} /></div>
            </div>
            <div className="grid gap-2"><Label>Their product or service</Label><Input value={priceForm.product_name} onChange={(e) => setPriceForm({ ...priceForm, product_name: e.target.value })} /></div>
            <div className="grid gap-2"><Label>Source URL (where the price is published)</Label><Input required type="url" value={priceForm.source_url} onChange={(e) => setPriceForm({ ...priceForm, source_url: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label>Location</Label><Input value={priceForm.location} onChange={(e) => setPriceForm({ ...priceForm, location: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Price type</Label><RadixSelect value={priceForm.price_type} onValueChange={(v) => setPriceForm({ ...priceForm, price_type: v })} options={[{ value: "advertised", label: "Advertised" }, { value: "transaction", label: "Actual transaction" }, { value: "estimate", label: "Estimate" }]} className="h-10" /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={priceForm.verified} onChange={(e) => setPriceForm({ ...priceForm, verified: e.target.checked })} />I confirmed this price on the source page today</label>
            <DialogFooter><Button type="submit" disabled={!!busy}>Save price</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={autoConfirm.open} onOpenChange={(o) => setAutoConfirm({ open: o, phrase: "" })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Turn on automatic price changes?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Prices will change without approval when every rule passes: enough verified sources, fresh data, within your increase/decrease and daily limits, outside the cooldown, and above your minimum margin. Everything else still waits for you. Save your rules first.</p>
          <div className="grid gap-2"><Label>Type <b>{phrase}</b> to confirm</Label><Input value={autoConfirm.phrase} onChange={(e) => setAutoConfirm({ ...autoConfirm, phrase: e.target.value })} autoComplete="off" /></div>
          <DialogFooter><Button variant="destructive" disabled={autoConfirm.phrase !== phrase || !!busy} onClick={confirmAuto}>Enable automatic pricing</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
