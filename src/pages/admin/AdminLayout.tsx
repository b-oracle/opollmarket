import { useEffect, useState } from "react";
import { useNavigate, Outlet, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard, ShoppingBag, MessageSquare, Users, LogOut, Loader2,
  ArrowLeft, PlusCircle, Receipt, Settings, Coins, Menu, X, ArrowUpFromLine, Zap, BarChart3, Rocket, FileCode2, ShieldAlert,
} from "lucide-react";

type NavItem = { to: string; label: string; icon: any; end?: boolean; adminOnly?: boolean };

const navItems: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/markets", label: "Markets", icon: ShoppingBag },
  { to: "/admin/create-market", label: "Create Market", icon: PlusCircle },
  { to: "/admin/transactions", label: "Transactions", icon: Receipt, adminOnly: true },
  { to: "/admin/withdrawals", label: "Withdrawals", icon: ArrowUpFromLine, adminOnly: true },
  { to: "/admin/boosts", label: "Boosts", icon: Zap },
  { to: "/admin/moderation", label: "Moderation", icon: ShieldAlert, adminOnly: true },
  { to: "/admin/comments", label: "Comments", icon: MessageSquare },
  { to: "/admin/users", label: "Users", icon: Users, adminOnly: true },
  { to: "/admin/commissions", label: "Commissions", icon: Coins, adminOnly: true },
  { to: "/admin/settings", label: "Settings", icon: Settings, adminOnly: true },
  { to: "/admin/contracts", label: "Smart Contracts", icon: FileCode2, adminOnly: true },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3, adminOnly: true },
  { to: "/admin/checklist", label: "Launch Checklist", icon: Rocket, adminOnly: true },
];

const AdminLayout = () => {
  const { user, loading, isAdmin, hasAdminAccess, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !hasAdminAccess)) {
      navigate("/auth");
    }
  }, [user, loading, hasAdminAccess, navigate]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const filteredNavItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  if (loading) {
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
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-border">
          <h1 className="text-lg font-bold text-primary">Admin Panel</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
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
        <div className="sticky top-0 z-30 flex items-center gap-3 px-4 border-b border-border bg-card/95 backdrop-blur-sm lg:hidden" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.25rem)", minHeight: "calc(3.5rem + env(safe-area-inset-top))" }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-muted transition-colors -ml-2"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold text-primary">Admin</span>
        </div>
        <div className="max-w-5xl mx-auto p-4 sm:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
