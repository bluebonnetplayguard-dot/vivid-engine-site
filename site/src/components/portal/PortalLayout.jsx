import { useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { LayoutDashboard, Briefcase, Box, LogOut, Zap, Loader2 } from "lucide-react";
import { api } from '@/api/client';
import { Button } from "@/components/ui/button";
import MobileBottomNav from "@/components/MobileBottomNav";
import AnimatedOutlet from "@/components/AnimatedOutlet";
import NestedPageHeader from '@/components/navigation/NestedPageHeader';
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

export default function PortalLayout() {
  const logout = async () => {
    await api.auth.logout();
    window.location.href = "/login";
  };
  const mainRef = useRef(null);
  const onRefresh = useCallback(() => window.location.reload(), []);
  const { pull, refreshing } = usePullToRefresh(mainRef, onRefresh);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex items-center gap-2 px-6 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-linear-to-br from-primary to-accent"><Zap className="h-5 w-5 text-white" /></span>
          <span className="font-heading font-bold leading-tight">Vivid Engine</span>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          <Link to="/portal" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground"><LayoutDashboard className="h-4 w-4" /> Dashboard</Link>
          <Link to="/portal" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground"><Briefcase className="h-4 w-4" /> My Projects</Link>
          <Link to="/studio" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground"><Box className="h-4 w-4" /> 3D Design Studio</Link>
        </nav>
        <div className="p-3">
          <Button variant="outline" size="sm" className="w-full" onClick={logout}><LogOut className="mr-2 h-4 w-4" /> Sign out</Button>
        </div>
      </aside>
      <main ref={mainRef} className="flex-1 overflow-auto pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <div style={{ height: refreshing ? 40 : pull }} className="flex items-center justify-center overflow-hidden">
          {refreshing && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
        </div>
        <div className="border-b border-border bg-card px-6 py-4 safe-top md:hidden">
          <div className="flex items-center justify-between">
            <Link to="/portal" className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-primary to-accent"><Zap className="h-4 w-4 text-white" /></span><span className="font-heading font-bold">Vivid Engine</span></Link>
            <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
        <NestedPageHeader />
        <AnimatedOutlet />
      </main>
      <MobileBottomNav />
    </div>
  );
}