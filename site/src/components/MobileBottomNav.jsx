import { NavLink } from "react-router-dom";
import { useMobileTabNavigation } from '@/components/MobileTabProvider';
import { LayoutDashboard, MessageCircle, CreditCard, Settings } from "lucide-react";

const items = [
  { to: "/portal", label: "Portal", icon: LayoutDashboard },
  { to: "/admin/chat", label: "Chat", icon: MessageCircle },
  { to: "/admin/pos", label: "POS", icon: CreditCard },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function MobileBottomNav() {
  const selectTab = useMobileTabNavigation();
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-50 flex border-t border-border bg-card/95 backdrop-blur-sm md:hidden">
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          onClick={event => selectTab?.(event, i.to)}
          end={i.end}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`
          }
        >
          <i.icon className="h-5 w-5" />
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}