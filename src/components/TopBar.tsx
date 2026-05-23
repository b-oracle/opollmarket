import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import ChatIcon from "@/components/chat/ChatIcon";
import SignOutConfirmDialog from "@/components/SignOutConfirmDialog";
import { useSidebarState } from "@/hooks/useSidebarState";
import logo from "@/assets/logo.png";
import { User, LogOut, Shield, ArrowLeft, Moon, Sun } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { Switch } from "@/components/ui/switch";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { getAvatarInitials } from "@/lib/utils";

const AdminBadgeButton = ({ isAdminRoute, onClick, userId, label }: { isAdminRoute: boolean; onClick: () => void; userId: string; label?: string }) => {
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["admin-pending-count", userId],
    queryFn: async () => {
      const [withdrawals, markets, moderation] = await Promise.all([
        supabase.from("transactions").select("id", { count: "exact", head: true }).eq("type", "withdrawal").eq("status", "pending"),
        supabase.from("markets").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("moderation_logs").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      return (withdrawals.count || 0) + (markets.count || 0) + (moderation.count || 0);
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
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
          {label || "Admin"}
        </>
      )}
      {pendingCount > 0 && !isAdminRoute && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1 animate-pulse">
          {pendingCount > 99 ? "99+" : pendingCount}
        </span>
      )}
    </button>
  );
};

const TopBar = () => {
  const { user, isSuperAdmin, isAdmin, isModerator, isSupport, hasAdminAccess, isBusiness, signOut, loading, displayName } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [showMenu, setShowMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const { collapsed } = useSidebarState();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isAdminRoute = location.pathname.startsWith("/admin");

  const initial = getAvatarInitials(displayName);

  const { data: avatarUrl } = useQuery({
    queryKey: ["user-avatar", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("avatar_url").eq("id", user!.id).maybeSingle();
      return data?.avatar_url || null;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <>
    <header
      ref={headerRef}
      className={`fixed top-0 left-0 right-0 z-50 border-0 transition-all duration-300 ${collapsed ? "lg:left-[4.5rem]" : "lg:left-60"} ${
        scrolled
          ? "shadow-[0_2px_12px_-3px_hsl(var(--foreground)/0.12)]"
          : "shadow-[0_1px_8px_-2px_hsl(var(--foreground)/0.08)]"
      }`}
      style={{
        paddingTop: 'var(--safe-top)',
        background: scrolled ? 'hsl(var(--glass) / 0.9)' : 'hsl(var(--glass) / 0.8)',
        backdropFilter: scrolled ? 'blur(48px) saturate(1.4)' : 'blur(30px) saturate(1.2)',
        WebkitBackdropFilter: scrolled ? 'blur(48px) saturate(1.4)' : 'blur(30px) saturate(1.2)',
      }}
    >
        <div className="flex items-center justify-between h-14 max-w-lg lg:max-w-full mx-auto px-4">
        <div className="flex items-center gap-1.5 cursor-pointer lg:hidden" onClick={() => navigate("/")}>
          <img src={logo} alt="OPollmarket" className="h-8 w-8" />
          <span className="text-[28px] font-bold tracking-tight text-primary leading-[32px] -ml-0.5">Pollmarket</span>
        </div>
        <div className="hidden lg:block" />
        <div className="flex items-center gap-2">
          {/* Business mode toggle */}
          {isBusiness && user && !hasAdminAccess && (
            <button
              onClick={() => navigate(location.pathname.startsWith("/business") ? "/" : "/business")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
                location.pathname.startsWith("/business")
                  ? "bg-violet-500/20 text-violet-500 border border-violet-500/30"
                  : "bg-muted/50 text-muted-foreground border border-border hover:border-violet-500/30 hover:text-violet-500"
              }`}
            >
              {location.pathname.startsWith("/business") ? (
                <><ArrowLeft className="w-3.5 h-3.5" /> User Mode</>
              ) : (
                <><Shield className="w-3.5 h-3.5" /> Business</>
              )}
            </button>
          )}
          {/* Admin mode toggle for admin users */}
          {hasAdminAccess && user && (
            <AdminBadgeButton isAdminRoute={isAdminRoute} onClick={() => navigate(isAdminRoute ? "/" : "/admin")} userId={user.id} label={!isSuperAdmin && !isAdmin && !isModerator && isSupport ? "Support" : "Admin"} />
          )}
          <ChatIcon />
          <NotificationBell />
          {loading ? null : user ? (
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-sm font-bold text-primary transition-all active:scale-95 overflow-hidden"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  initial
                )}
              </button>
              <AnimatePresence>
                {showMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    className="absolute right-0 top-12 w-56 rounded-xl p-2 z-50 border border-border shadow-lg"
                    style={{ background: 'hsl(var(--card))', backdropFilter: 'blur(30px)' }}
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
                    <div className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-accent/50 transition-colors text-sm cursor-pointer" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                      <span className="flex items-center gap-2">
                        {theme === "dark" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                        Dark Mode
                      </span>
                      <Switch checked={theme === "dark"} onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")} className="scale-90" />
                    </div>
                    <button
                      onClick={() => { setShowMenu(false); setSignOutOpen(true); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-destructive/10 transition-colors text-sm text-destructive"
                    >
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <>
              <ThemeToggle />
              <button
                onClick={() => navigate("/auth")}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground transition-all active:scale-95"
              >
                Sign In
              </button>
            </>
          )}
        </div>
      </div>
    </header>
    <SignOutConfirmDialog open={signOutOpen} onClose={() => setSignOutOpen(false)} />
    </>
  );
};

export default TopBar;
