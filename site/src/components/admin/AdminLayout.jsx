import { useRef, useCallback } from "react";
import { NavLink, Link, Navigate } from "react-router-dom";
import { useAuth } from '@/lib/AuthContext';
import { LayoutDashboard, Users, FileText, Receipt, Wallet, Sparkles, CreditCard, Calculator, Zap, ArrowLeft, LogOut, MessageCircle, Loader2, TrendingUp } from "lucide-react";
import { api } from '@/api/client';
import { Button } from "@/components/ui/button";
import MobileBottomNav from "@/components/MobileBottomNav";
import AnimatedOutlet from "@/components/AnimatedOutlet";
import NestedPageHeader from '@/components/navigation/NestedPageHeader';
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

const nav = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/leads", label: "Leads", icon: Users },
  { to: "/admin/quotes", label: "Quotes", icon: FileText },
  { to: "/admin/estimator", label: "AI Estimator", icon: Calculator },
  { to: "/admin/invoices", label: "Invoices", icon: Receipt },
  { to: "/admin/costs", label: "Costs", icon: Wallet },
  { to: "/admin/logo", label: "Logo Designer", icon: Sparkles },
  { to: "/admin/pos", label: "POS / Payments", icon: CreditCard },
  { to: "/admin/chat", label: "Live Chat", icon: MessageCircle },
  { to: "/admin/marketing-drafts", label: "Marketing Drafts", icon: Sparkles },
  { to: "/admin/pricing", label: "Market Pricing", icon: TrendingUp },
];

export default function AdminLayout() {
  const logout = async () => { await api.auth.logout(); window.location.href = "/login"; };
  const mainRef = useRef(null);
  const onRefresh = useCallback(() => window.location.reload(), []);
  const { pull, refreshing } = usePullToRefresh(mainRef, onRefresh);
  const { user } = useAuth();

  // The server already refuses admin data to clients; this keeps them out of the admin screens too.
  if (user && user.role !== 'admin') return <Navigate to="/portal" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-linear-to-br from-primary to-accent"><Zap className="h-5 w-5 text-white" /></span>
          <div className="leading-tight"><div className="font-heading font-bold">Vivid Engine</div><div className="text-xs text-muted-foreground">Business OS</div></div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/10 hover:text-foreground"}`}>
              <n.icon className="h-4 w-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-1 border-t border-border p-3">
          <Link to="/" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to site</Link>
          <Button variant="outline" size="sm" className="w-full" onClick={logout}><LogOut className="mr-2 h-4 w-4" /> Sign out</Button>
        </div>
      </aside>
      <main ref={mainRef} className="flex-1 overflow-auto pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <div style={{ height: refreshing ? 40 : pull }} className="flex items-center justify-center overflow-hidden">
          {refreshing && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
        </div>
        <div className="border-b border-border bg-card px-6 py-4 safe-top md:hidden">
          <div className="flex items-center justify-between">
            <span className="font-heading font-bold">Vivid Engine · Business OS</span>
            <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4" /></Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {nav.map((n) => <Link key={n.to} to={n.to} className="rounded-lg bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground">{n.label}</Link>)}
          </div>
        </div>
        <NestedPageHeader />
        <AnimatedOutlet />
      </main>
      <MobileBottomNav />
    </div>
  );
}