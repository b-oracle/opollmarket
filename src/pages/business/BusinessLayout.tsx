import { useEffect, useState } from "react";
import { useNavigate, Outlet, NavLink, useLocation, useOutletContext } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LayoutDashboard, Key, Palette, ArrowLeft, LogOut, Loader2, Menu, X, ArrowDownToLine } from "lucide-react";

const navItems = [
  { to: "/business", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/business/deposits", label: "Deposits", icon: ArrowDownToLine },
  { to: "/business/api-keys", label: "API Keys", icon: Key },
  { to: "/business/customize", label: "Customization", icon: Palette },
];

export type BusinessOutletContext = { userId: string };
export const useBusinessContext = () => useOutletContext<BusinessOutletContext>();

const BusinessLayout = () => {
  const { user, loading, rolesLoaded, isBusiness, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && rolesLoaded && (!user || !isBusiness)) {
      navigate("/auth");
    }
  }, [user, loading, rolesLoaded, isBusiness, navigate]);

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  if (loading || (user && !rolesLoaded)) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!user || !isBusiness) return null;

  return (
    <div className="min-h-dvh bg-background flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 border-r border-border bg-card flex flex-col shrink-0 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ paddingTop: "var(--safe-top)" }}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-border">
          <h1 className="text-lg font-bold text-primary">Business Portal</h1>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 rounded-lg hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-3 pt-3 pb-1">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-violet-500/15 text-violet-500">
            Business
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-border space-y-1">
          <button onClick={() => navigate("/")} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-full">
            <ArrowLeft className="w-4 h-4" /> Back to App
          </button>
          <button onClick={signOut} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors w-full">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto min-w-0">
        <div className="sticky top-0 z-30 flex items-center gap-3 px-4 border-b border-border bg-card/95 backdrop-blur-sm lg:hidden" style={{ paddingTop: "calc(var(--safe-top) + 0.25rem)", minHeight: "var(--content-top)" }}>
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-muted transition-colors -ml-2">
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold text-primary">Business Portal</span>
        </div>
        <div className="max-w-5xl mx-auto p-4 sm:p-6">
          <Outlet context={{ userId: user.id }} />
        </div>
      </main>
    </div>
  );
};

export default BusinessLayout;
