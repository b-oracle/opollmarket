import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import SignOutConfirmDialog from "@/components/SignOutConfirmDialog";
import { useSidebarState } from "@/hooks/useSidebarState";
import logo from "@/assets/logo.png";
import { User, LogOut, Shield, ArrowLeft } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const TopBar = () => {
  const { user, isSuperAdmin, isAdmin, hasAdminAccess, signOut, loading, displayName } = useAuth();
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

  const initial = displayName.charAt(0).toUpperCase();

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
        paddingTop: 'env(safe-area-inset-top)',
        background: scrolled ? 'hsl(var(--glass) / 0.9)' : 'hsl(var(--glass) / 0.8)',
        backdropFilter: scrolled ? 'blur(48px) saturate(1.4)' : 'blur(30px) saturate(1.2)',
        WebkitBackdropFilter: scrolled ? 'blur(48px) saturate(1.4)' : 'blur(30px) saturate(1.2)',
      }}
    >
        <div className="flex items-center justify-between h-14 max-w-lg lg:max-w-full mx-auto px-4">
        <div className="flex items-center gap-1.5 cursor-pointer lg:hidden" onClick={() => navigate("/")}>
          <img src={logo} alt="OPOLL" className="h-8 w-8" />
          <span className="text-[28px] font-bold tracking-tight text-primary leading-[32px] -ml-0.5">Poll</span>
        </div>
        <div className="hidden lg:block" />
        <div className="flex items-center gap-2">
          {/* Admin mode toggle for admin users */}
          {hasAdminAccess && user && (
            <AdminBadgeButton isAdminRoute={isAdminRoute} onClick={() => navigate(isAdminRoute ? "/" : "/admin")} userId={user.id} />
          )}
          <NotificationBell />
          <ThemeToggle />
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
    <SignOutConfirmDialog open={signOutOpen} onClose={() => setSignOutOpen(false)} />
    </>
  );
};

export default TopBar;
