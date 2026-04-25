import { useState } from "react";
import { Home, Compass, PlusCircle, BarChart3, User, Trophy, Gift, HelpCircle, LogIn, LogOut, ChevronsLeft, ChevronsRight, LineChart, Briefcase, LayoutDashboard } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import SignOutConfirmDialog from "@/components/SignOutConfirmDialog";
import { useSidebarState } from "@/hooks/useSidebarState";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import logo from "@/assets/logo.png";

const allNavItems: { icon: typeof Home; label: string; path: string; featureKey: string | null; requiresAuth?: boolean }[] = [
{ icon: Home, label: "Home", path: "/", featureKey: null },
{ icon: Compass, label: "Feed", path: "/feed", featureKey: "feed" },
{ icon: LineChart, label: "Quick Trade", path: "/quick-trade", featureKey: "quick_trade" },
{ icon: PlusCircle, label: "Create", path: "/create", featureKey: "create_market" },
{ icon: LayoutDashboard, label: "Creator", path: "/creator", featureKey: "create_market", requiresAuth: true },
{ icon: BarChart3, label: "Portfolio", path: "/portfolio", featureKey: "portfolio" },
{ icon: User, label: "Profile", path: "/profile", featureKey: "social_profiles" },
{ icon: Trophy, label: "Leaderboard", path: "/rankings", featureKey: "rankings" },
{ icon: Gift, label: "Referrals", path: "/referrals", featureKey: "referrals" },
{ icon: HelpCircle, label: "FAQ", path: "/faq", featureKey: "faq" }];


const DesktopSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isBusiness } = useAuth();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const { collapsed, toggle } = useSidebarState();
  const { isFeatureEnabled } = useFeatureToggles();

  const baseNavItems = allNavItems.filter(
    (item) => (!item.featureKey || isFeatureEnabled(item.featureKey)) && (!item.requiresAuth || !!user)
  );
  const navItems = isBusiness && user
    ? [...baseNavItems, { icon: Briefcase, label: "Business", path: "/business", featureKey: null }]
    : baseNavItems;

  return (
    <>
    <aside
        className={`hidden lg:flex fixed left-0 top-0 bottom-0 z-40 flex-col border-r border-border bg-background/95 backdrop-blur-md transition-all duration-300 ${
        collapsed ? "w-[4.5rem]" : "w-60"}`
        }>
        
      {/* Logo */}
      <div
          className={`flex items-center h-16 cursor-pointer shrink-0 ${collapsed ? "justify-center px-2" : "gap-2 px-5"}`}
          onClick={() => navigate("/")}>
          
        <img src={logo} alt="OPOLL" className="h-8 w-8 shrink-0 object-fill border-0 border-none rounded-none" />
        {!collapsed &&
          <span className="font-bold tracking-tight text-primary leading-none text-3xl mx-0 px-0 text-left">Pollmarket</span>
          }
      </div>

      {/* Nav items */}
      <nav className={`flex-1 py-2 space-y-1 overflow-y-auto ${collapsed ? "px-2" : "px-3"}`}>
        {navItems.map(({ icon: Icon, label, path }) => {
            const isActive = location.pathname === path;
            const isCreate = path === "/create";

            if (path === "/profile" && !user) return null;

            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                title={collapsed ? label : undefined}
                className={`w-full flex items-center rounded-xl text-sm font-medium transition-all ${
                collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"} ${

                isActive ?
                "bg-primary/10 text-primary border border-primary/20" :
                "text-muted-foreground hover:text-foreground hover:bg-muted/50"} ${
                isCreate ? "mt-2" : ""}`}>
                
              <Icon className={`w-5 h-5 shrink-0 ${isActive ? "text-primary" : ""}`} />
              {!collapsed && label}
            </button>);

          })}
      </nav>

      {/* Collapse toggle */}
      <div className={`${collapsed ? "px-2" : "px-3"} py-2`}>
        <button
            onClick={toggle}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            
          {collapsed ? <ChevronsRight className="w-4 h-4" /> : <><ChevronsLeft className="w-4 h-4" /> Collapse</>}
        </button>
      </div>

      {/* Auth button at bottom */}
      <div className={`border-t border-border ${collapsed ? "p-2" : "p-3"}`}>
        {user ?
          <button
            onClick={() => setSignOutOpen(true)}
            title={collapsed ? "Sign Out" : undefined}
            className={`w-full flex items-center justify-center rounded-xl text-sm font-semibold bg-destructive/10 text-destructive border border-destructive/20 transition-all hover:bg-destructive/20 active:scale-95 ${
            collapsed ? "px-2 py-2.5" : "gap-2 px-4 py-2.5"}`
            }>
            
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && "Sign Out"}
          </button> :

          <button
            onClick={() => navigate("/auth")}
            title={collapsed ? "Sign In" : undefined}
            className={`w-full flex items-center justify-center rounded-xl text-sm font-semibold bg-primary text-primary-foreground transition-all active:scale-95 ${
            collapsed ? "px-2 py-2.5" : "gap-2 px-4 py-2.5"}`
            }>
            
            <LogIn className="w-4 h-4 shrink-0" />
            {!collapsed && "Sign In"}
          </button>
          }
      </div>
    </aside>
    <SignOutConfirmDialog open={signOutOpen} onClose={() => setSignOutOpen(false)} />
    </>);

};

export default DesktopSidebar;