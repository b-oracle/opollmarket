import { Home, Compass, PlusCircle, BarChart3, User, Trophy, Gift, HelpCircle, LogIn, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import logo from "@/assets/logo.png";

const navItems = [
  { icon: Home, label: "Home", path: "/" },
  { icon: Compass, label: "Feed", path: "/feed" },
  { icon: PlusCircle, label: "Create", path: "/create" },
  { icon: BarChart3, label: "Portfolio", path: "/portfolio" },
  { icon: User, label: "Profile", path: "/profile" },
  { icon: Trophy, label: "Leaderboard", path: "/rankings" },
  { icon: Gift, label: "Referrals", path: "/referrals" },
  { icon: HelpCircle, label: "FAQ", path: "/faq" },
];

const DesktopSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-60 z-40 flex-col border-r border-border bg-background/95 backdrop-blur-md">
      {/* Logo */}
      <div
        className="flex items-center gap-2 px-5 h-16 cursor-pointer shrink-0"
        onClick={() => navigate("/")}
      >
        <img src={logo} alt="OPOLL" className="h-8 w-8" />
        <span className="text-2xl font-bold tracking-tight text-primary leading-none">Poll</span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {navItems.map(({ icon: Icon, label, path }) => {
          const isActive = location.pathname === path;
          const isCreate = path === "/create";

          if (path === "/profile" && !user) return null;

          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              } ${isCreate ? "mt-2" : ""}`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Auth button at bottom */}
      <div className="p-3 border-t border-border">
        {user ? (
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              toast.success("Signed out successfully");
              navigate("/");
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-destructive/10 text-destructive border border-destructive/20 transition-all hover:bg-destructive/20 active:scale-95"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        ) : (
          <button
            onClick={() => navigate("/auth")}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground transition-all active:scale-95"
          >
            <LogIn className="w-4 h-4" />
            Sign In
          </button>
        )}
      </div>
    </aside>
  );
};

export default DesktopSidebar;
