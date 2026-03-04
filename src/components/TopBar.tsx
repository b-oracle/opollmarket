import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import logo from "@/assets/logo.png";
import { User, LogOut, Shield, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const TopBar = () => {
  const { user, isAdmin, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showMenu, setShowMenu] = useState(false);

  const isAdminRoute = location.pathname.startsWith("/admin");

  const displayName =
    user?.user_metadata?.display_name ||
    user?.email?.split("@")[0] ||
    "User";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-strong md:left-60">
      <div className="flex items-center justify-between h-14 max-w-lg md:max-w-full mx-auto px-4">
        <div className="flex items-center gap-1.5 cursor-pointer md:hidden" onClick={() => navigate("/")}>
          <img src={logo} alt="OPOLL" className="h-8 w-8" />
          <span className="text-2xl font-bold tracking-tight text-primary leading-none">Poll</span>
        </div>
        <div className="hidden md:block" />
        <div className="flex items-center gap-2">
          {/* Admin mode toggle for admin users */}
          {isAdmin && user && (
            <button
              onClick={() => navigate(isAdminRoute ? "/" : "/admin")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
                isAdminRoute
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "bg-muted/50 text-muted-foreground border border-border hover:border-primary/30 hover:text-primary"
              }`}
            >
              {isAdminRoute ? (
                <>
                  <ArrowLeft className="w-3.5 h-3.5" />
                  User Mode
                </>
              ) : (
                <>
                  <Shield className="w-3.5 h-3.5" />
                  Admin
                </>
              )}
            </button>
          )}
          <NotificationBell />
          <ThemeToggle />
          {loading ? null : user ? (
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-sm font-bold text-primary transition-all active:scale-95"
              >
                {initial}
              </button>
              <AnimatePresence>
                {showMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    className="absolute right-0 top-12 w-56 glass-strong rounded-xl p-2 z-50"
                  >
                    <div className="px-3 py-2 border-b border-border mb-1">
                      <p className="text-sm font-semibold truncate">{displayName}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <button
                      onClick={() => { navigate("/profile"); setShowMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent/50 transition-colors text-sm"
                    >
                      <User className="w-4 h-4" /> Profile
                    </button>
                    <button
                      onClick={async () => { await signOut(); setShowMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-destructive/10 transition-colors text-sm text-destructive"
                    >
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <button
              onClick={() => navigate("/auth")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground transition-all active:scale-95"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopBar;
