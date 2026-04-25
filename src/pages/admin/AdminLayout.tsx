import { useEffect, useState } from "react";
import { useNavigate, Outlet, NavLink, useLocation, useOutletContext } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard, ShoppingBag, MessageSquare, Users, LogOut, Loader2,
  ArrowLeft, PlusCircle, Receipt, Settings, Coins, Menu, X, ArrowUpFromLine, Zap, BarChart3, Rocket, FileCode2, ShieldAlert, Eye, History, ArrowDownToLine, UserCheck, TrendingUp, Presentation, Scale, Gift, Phone, Bell, ClipboardCheck, HelpCircle, Lock, Megaphone, RotateCcw,
} from "lucide-react";

type NavItem = {
  to: string;
  label: string;
  icon: any;
  end?: boolean;
  /** Which roles can see this nav item. super_admin sees everything. */
  roles?: ("super_admin" | "admin" | "moderator" | "support")[];
};

const navItems: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true, roles: ["super_admin", "admin", "moderator"] },
  { to: "/admin/markets", label: "Markets", icon: ShoppingBag, roles: ["super_admin", "admin", "moderator"] },
  { to: "/admin/create-market", label: "Create Market", icon: PlusCircle, roles: ["super_admin"] },
  { to: "/admin/predictions", label: "Predictions", icon: TrendingUp, roles: ["super_admin", "admin"] },
  { to: "/admin/quick-trade", label: "Quick Trade", icon: Zap, roles: ["super_admin", "admin"] },
  { to: "/admin/social", label: "Social & Profiles", icon: UserCheck, roles: ["super_admin", "admin"] },
  { to: "/admin/transactions", label: "Transactions", icon: Receipt, roles: ["super_admin", "admin"] },
  { to: "/admin/withdrawals", label: "Withdrawals", icon: ArrowUpFromLine, roles: ["super_admin", "admin"] },
  { to: "/admin/deposits", label: "Deposits", icon: ArrowDownToLine, roles: ["super_admin", "admin"] },
  { to: "/admin/reconciliation", label: "Reconciliation", icon: Scale, roles: ["super_admin", "admin"] },
  { to: "/admin/webhook-logs", label: "Webhook Logs", icon: History, roles: ["super_admin", "admin"] },
  { to: "/admin/webhook-events", label: "Webhook Retries", icon: RotateCcw, roles: ["super_admin", "admin"] },
  { to: "/admin/boosts", label: "Boosts", icon: Zap, roles: ["super_admin", "admin"] },
  { to: "/admin/moderation", label: "Moderation", icon: ShieldAlert, roles: ["super_admin", "admin", "moderator"] },
  { to: "/admin/comments", label: "Comments", icon: MessageSquare, roles: ["super_admin", "admin", "moderator"] },
  { to: "/admin/users", label: "Users", icon: Users, roles: ["super_admin", "admin", "moderator"] },
  { to: "/admin/referrals", label: "Referrals", icon: Gift, roles: ["super_admin", "admin"] },
  { to: "/admin/commissions", label: "Commissions", icon: Coins, roles: ["super_admin", "admin"] },
  { to: "/admin/settings", label: "Settings", icon: Settings, roles: ["super_admin", "admin"] },
  { to: "/admin/contracts", label: "Smart Contracts", icon: FileCode2, roles: ["super_admin"] },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3, roles: ["super_admin", "admin"] },
  { to: "/admin/checklist", label: "Launch Checklist", icon: Rocket, roles: ["super_admin"] },
  { to: "/admin/audit-log", label: "Audit Log", icon: History, roles: ["super_admin"] },
  { to: "/admin/fiat-settings", label: "Fiat Settings", icon: Coins, roles: ["super_admin"] },
  { to: "/admin/whatsapp", label: "WhatsApp", icon: Phone, roles: ["super_admin", "admin"] },
  { to: "/admin/telegram", label: "Telegram", icon: Phone, roles: ["super_admin", "admin"] },
  { to: "/admin/investor-deck", label: "Investor Deck", icon: Presentation, roles: ["super_admin"] },
  { to: "/admin/aimtell", label: "Aimtell Push", icon: Bell, roles: ["super_admin"] },
  { to: "/admin/notification-broadcast", label: "Broadcast Notifications", icon: Megaphone, roles: ["super_admin"] },
  { to: "/admin/api-keys", label: "API Keys", icon: FileCode2, roles: ["super_admin", "admin"] },
  { to: "/admin/kyc", label: "KYC Verification", icon: ClipboardCheck, roles: ["super_admin", "admin", "support"] },
  { to: "/admin/support", label: "Support Tickets", icon: HelpCircle, roles: ["super_admin", "admin", "support"] },
  { to: "/admin/escrows", label: "Escrows", icon: Lock, roles: ["super_admin"] },
];

const AdminLayout = () => {
  const { user, loading, isSuperAdmin, isAdmin, isModerator, isSupport, hasAdminAccess, canEdit, signOut, rolesLoaded } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    // Wait for both auth loading AND role checks to complete before redirecting
    if (!loading && rolesLoaded && (!user || !hasAdminAccess)) {
      navigate("/auth");
    }
    // Support-only users should only see /admin/support
    if (!loading && rolesLoaded && user && hasAdminAccess && !isSuperAdmin && !isAdmin && !isModerator && isSupport && location.pathname === "/admin") {
      navigate("/admin/support", { replace: true });
    }
  }, [user, loading, rolesLoaded, hasAdminAccess, isSuperAdmin, isAdmin, isModerator, isSupport, navigate, location.pathname]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Determine current user's role for nav filtering
  const userRole = isSuperAdmin ? "super_admin" : isAdmin ? "admin" : isModerator ? "moderator" : "support";

  const filteredNavItems = navItems.filter((item) => {
    if (!item.roles) return true; // visible to all roles
    return item.roles.includes(userRole);
  });

  const roleBadge = isSuperAdmin ? "Super Admin" : isAdmin ? "Admin" : isModerator ? "Moderator" : "Support";

  if (loading || (user && !rolesLoaded)) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!user || !hasAdminAccess) return null;

  return (
    <div className="min-h-dvh bg-background flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-60 border-r border-border bg-card flex flex-col shrink-0
          transition-transform duration-200 ease-in-out
          lg:static lg:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        style={{ paddingTop: "var(--safe-top)" }}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-border">
          <h1 className="text-lg font-bold text-primary">System-Mod Engine</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role badge */}
        <div className="px-3 pt-3 pb-1">
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold ${
            isSuperAdmin
              ? "bg-primary/15 text-primary"
              : isAdmin
              ? "bg-blue-500/15 text-blue-500"
              : "bg-amber-500/15 text-amber-500"
          }`}>
            {false && <Eye className="w-3.5 h-3.5" />}
            {roleBadge}
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {filteredNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border space-y-1">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-full"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to App
          </button>
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors w-full"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto min-w-0">
        {/* Mobile header */}
        <div className="sticky top-0 z-30 flex items-center gap-3 px-4 border-b border-border bg-card/95 backdrop-blur-sm lg:hidden" style={{ paddingTop: "calc(var(--safe-top) + 0.25rem)", minHeight: "var(--content-top)" }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-muted transition-colors -ml-2"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold text-primary">System-Mod Engine</span>
        </div>

        {/* View-only banner removed — admin now has edit access */}

        <div className="max-w-5xl mx-auto p-4 sm:p-6">
          <Outlet context={{ canEdit, isSuperAdmin }} />
        </div>
      </main>
    </div>
  );
};

export type AdminOutletContext = { canEdit: boolean; isSuperAdmin: boolean };
export const useAdminContext = () => useOutletContext<AdminOutletContext>();

export default AdminLayout;
