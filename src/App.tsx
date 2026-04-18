// App root – v5 (login security gate)
import { lazy, Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useSecuritySettings, useInvalidateSecuritySettings } from "./hooks/useSecuritySettings";
import { ActiveSpaceProvider, useActiveSpace } from "./hooks/useActiveSpace";
import { SpaceReplayProvider } from "./hooks/useSpaceReplay";
import SpaceRoom from "./components/social/SpaceRoom";
const SpaceReplayModal = lazy(() => import("./components/social/SpaceReplayModal"));
const SpaceReplayMiniPlayer = lazy(() => import("./components/social/SpaceReplayMiniPlayer"));
const LiveSpaceFloatingButton = lazy(() => import("./components/social/LiveSpaceFloatingButton"));
const SecurityVerificationModal = lazy(() => import("./components/SecurityVerificationModal"));

import { Navigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import ConditionalWagmiProvider from "./components/ConditionalWagmiProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import DesktopSidebar from "./components/DesktopSidebar";
import DesktopFooter from "./components/DesktopFooter";
import PWAUpdatePrompt from "./components/PWAUpdatePrompt";
import LogoLoader from "./components/LogoLoader";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { SidebarStateProvider, useSidebarState } from "./hooks/useSidebarState";
import SocialTutorial, { checkTutorialSeenFromDB } from "./components/SocialTutorial";
import { useFeatureToggles } from "./hooks/useFeatureToggles";
import DeferredMount from "./components/DeferredMount";
import { VerificationThresholdProvider } from "./components/NftBadge";

const PendingCopyTrades = lazy(() => import("./components/PendingCopyTrades"));
const AimtellProvider = lazy(() => import("./components/AimtellProvider"));
const IncomingCallBanner = lazy(() => import("./components/chat/IncomingCallBanner"));

// Lazy-loaded pages
const Index = lazy(() => import("./pages/Index"));
const Feed = lazy(() => import("./pages/Feed"));
const MarketDetail = lazy(() => import("./pages/MarketDetail"));
const Create = lazy(() => import("./pages/Create"));
const Rankings = lazy(() => import("./pages/Rankings"));
const Profile = lazy(() => import("./pages/Profile"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const BusinessLayout = lazy(() => import("./pages/business/BusinessLayout"));
const BusinessDashboard = lazy(() => import("./pages/business/BusinessDashboard"));
const BusinessApiKeys = lazy(() => import("./pages/business/BusinessApiKeys"));
const BusinessCustomization = lazy(() => import("./pages/business/BusinessCustomization"));
const BusinessDeposits = lazy(() => import("./pages/business/BusinessDeposits"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminMarkets = lazy(() => import("./pages/admin/AdminMarkets"));
const AdminComments = lazy(() => import("./pages/admin/AdminComments"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminCreateMarket = lazy(() => import("./pages/admin/AdminCreateMarket"));
const AdminTransactions = lazy(() => import("./pages/admin/AdminTransactions"));
const AdminWithdrawals = lazy(() => import("./pages/admin/AdminWithdrawals"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminCommissions = lazy(() => import("./pages/admin/AdminCommissions"));
const AdminBoosts = lazy(() => import("./pages/admin/AdminBoosts"));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics"));
const AdminChecklist = lazy(() => import("./pages/admin/AdminChecklist"));
const AdminContracts = lazy(() => import("./pages/admin/AdminContracts"));
const AdminModeration = lazy(() => import("./pages/admin/AdminModeration"));
const AdminAuditLog = lazy(() => import("./pages/admin/AdminAuditLog"));
const AdminDeposits = lazy(() => import("./pages/admin/AdminDeposits"));
const AdminReconciliation = lazy(() => import("./pages/admin/AdminReconciliation"));
const AdminQuickTrade = lazy(() => import("./pages/admin/AdminQuickTrade"));
const AdminPredictions = lazy(() => import("./pages/admin/AdminPredictions"));
const AdminSocial = lazy(() => import("./pages/admin/AdminSocial"));
const InvestorDeck = lazy(() => import("./pages/admin/InvestorDeck"));
const AdminAimtell = lazy(() => import("./pages/admin/AdminAimtell"));
const AdminNotificationBroadcast = lazy(() => import("./pages/admin/AdminNotificationBroadcast"));
const AdminApiKeys = lazy(() => import("./pages/admin/AdminApiKeys"));
const AdminKyc = lazy(() => import("./pages/admin/AdminKyc"));
const AdminFiatSettings = lazy(() => import("./pages/admin/AdminFiatSettings"));
const AdminReferrals = lazy(() => import("./pages/admin/AdminReferrals"));
const AdminWhatsApp = lazy(() => import("./pages/admin/AdminWhatsApp"));
const AdminTelegram = lazy(() => import("./pages/admin/AdminTelegram"));
const AdminSupport = lazy(() => import("./pages/admin/AdminSupport"));
const AdminEscrows = lazy(() => import("./pages/admin/AdminEscrows"));
const Referrals = lazy(() => import("./pages/Referrals"));
const Commissions = lazy(() => import("./pages/Commissions"));
const FAQ = lazy(() => import("./pages/FAQ"));
const Disclaimer = lazy(() => import("./pages/Disclaimer"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Maintenance = lazy(() => import("./pages/Maintenance"));
const QuickTrade = lazy(() => import("./pages/QuickTrade"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const Followers = lazy(() => import("./pages/Followers"));
const SetupSecurity = lazy(() => import("./pages/SetupSecurity"));
const SalesDeck = lazy(() => import("./pages/SalesDeck"));
const EmbedMarket = lazy(() => import("./pages/EmbedMarket"));
const EmbedTicker = lazy(() => import("./pages/EmbedTicker"));
const Developers = lazy(() => import("./pages/Developers"));
const MyPromotions = lazy(() => import("./pages/MyPromotions"));
const TransactionHistory = lazy(() => import("./pages/TransactionHistory"));
const Messages = lazy(() => import("./pages/Messages"));
const MessageThread = lazy(() => import("./pages/MessageThread"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "always",
    },
    mutations: {
      networkMode: "always",
    },
  },
});

// Some mobile/PWA environments incorrectly report offline and pause all react-query fetches.
// Keep query execution unblocked and rely on per-request errors instead of navigator.onLine.
if (typeof window !== "undefined") {
  onlineManager.setEventListener((setOnline) => {
    const markOnline = () => setOnline(true);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOnline);
    markOnline();

    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOnline);
    };
  });
}

const isAdminRoute = (pathname: string) => pathname.startsWith("/admin");
const isBusinessRoute = (pathname: string) => pathname.startsWith("/business");
const isEmbedRoute = (pathname: string) => pathname.startsWith("/embed/") || pathname === "/embed";

const noFooterRoutes = ["/feed", "/quick-trade", "/messages"];

const isFullscreenRoute = (pathname: string) => pathname.startsWith("/messages");

const ConditionalFooter = () => {
  const location = useLocation();
  if (isAdminRoute(location.pathname) || isBusinessRoute(location.pathname) || isEmbedRoute(location.pathname)) return null;
  if (noFooterRoutes.includes(location.pathname) || isFullscreenRoute(location.pathname)) return null;
  return <DesktopFooter />;
};

const ConditionalSidebar = () => {
  const location = useLocation();
  if (isAdminRoute(location.pathname) || isBusinessRoute(location.pathname) || isEmbedRoute(location.pathname)) return null;
  return <DesktopSidebar />;
};

const ConditionalLayout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const isAdmin = isAdminRoute(location.pathname);
  const isBusiness = isBusinessRoute(location.pathname);
  const isEmbed = isEmbedRoute(location.pathname);
  const isFullscreen = isFullscreenRoute(location.pathname);
  const { collapsed } = useSidebarState();
  const ml = (isAdmin || isBusiness || isEmbed) ? "" : collapsed ? "lg:ml-[4.5rem]" : "lg:ml-60";
  return <div className={`${ml} ${isFullscreen ? "h-[100dvh] overflow-hidden" : "min-h-screen"} flex flex-col transition-all duration-300`}>{children}</div>;
};

const PageFallback = () => (
  <div className="flex items-center justify-center min-h-screen pt-[var(--content-top)] pb-[var(--content-bottom)]">
    <LogoLoader />
  </div>
);

const FeatureGate = ({ featureKey, children }: { featureKey: string; children: React.ReactNode }) => {
  const { isFeatureEnabled } = useFeatureToggles();
  if (!isFeatureEnabled(featureKey)) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const MaintenanceGuard = ({ children }: { children: React.ReactNode }) => {
  const { isMaintenanceActive, isLoading } = useFeatureToggles();
  const { isAdmin, isSuperAdmin } = useAuth();
  const location = useLocation();

  if (isLoading) return <PageFallback />;
  if (isAdmin || isSuperAdmin) return <>{children}</>;

  const allowedPaths = ["/maintenance", "/auth", "/terms", "/privacy", "/disclaimer", "/reset-password", "/forgot-password"];
  if (isMaintenanceActive() && !allowedPaths.some((p) => location.pathname.startsWith(p))) {
    return <Navigate to="/maintenance" replace />;
  }

  return <>{children}</>;
};

const SecuritySetupGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const userId = user?.id ?? null;

  const allowedPaths = ["/setup-security", "/auth", "/reset-password", "/forgot-password", "/terms", "/privacy", "/disclaimer"];
  const isAllowed = allowedPaths.some(p => location.pathname.startsWith(p));

  // Check localStorage cache first (instant, no network)
  const hasLocalCache = userId ? (() => { try { return localStorage.getItem(`security_ok_${userId}`) === "1"; } catch { return false; } })() : false;

  const { data: secSettings, isLoading: secLoading } = useSecuritySettings(
    // Skip the query entirely if localStorage already confirms setup is done
    hasLocalCache ? null : userId
  );

  // Listen for custom event from SetupSecurity page when setup completes
  const invalidate = useInvalidateSecuritySettings();
  useEffect(() => {
    const handler = () => {
      if (userId) {
        try { localStorage.setItem(`security_ok_${userId}`, "1"); } catch {}
        invalidate(userId);
      }
    };
    window.addEventListener("security-setup-complete", handler);
    return () => window.removeEventListener("security-setup-complete", handler);
  }, [userId, invalidate]);

  // Persist to localStorage when we learn setup is complete
  useEffect(() => {
    if (secSettings?.security_setup_complete && userId) {
      try { localStorage.setItem(`security_ok_${userId}`, "1"); } catch {}
    }
  }, [secSettings?.security_setup_complete, userId]);

  if (loading) return <PageFallback />;
  if (!userId) return <>{children}</>;
  if (hasLocalCache) return <>{children}</>;
  if (secLoading) return <PageFallback />;

  const needsSetup = !secSettings || secSettings.security_setup_complete === false;
  if (needsSetup && !isAllowed) return <Navigate to="/setup-security" replace />;
  return <>{children}</>;
};

// Gate that requires PIN/TOTP verification on login for ALL auth methods (OAuth, session restore, email/password)
const LOGIN_SECURITY_VERIFIED_KEY = "login_sec_verified_";

const SESSION_PIN_TIMEOUT_MS = 1_800_000; // 30 minutes
const SESSION_LOGOUT_TIMEOUT_MS = 86_400_000; // 24 hours
const LAST_ACTIVE_KEY = "last_active_";

const LoginSecurityGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const userId = user?.id ?? null;
  const { isFeatureEnabled } = useFeatureToggles();

  const [showModal, setShowModal] = useState(false);
  const [secReqs, setSecReqs] = useState({ require_pin: false, require_totp: false });
  const processedUserRef = useRef<string | null>(null);

  const loginAllowedPaths = ["/auth", "/reset-password", "/forgot-password", "/setup-security", "/terms", "/privacy", "/disclaimer"];
  const isLoginAllowed = loginAllowedPaths.some(p => location.pathname.startsWith(p));

  const isSessionVerified = useCallback((uid: string) => {
    try {
      const val = localStorage.getItem(`${LOGIN_SECURITY_VERIFIED_KEY}${uid}`);
      if (!val) return false;
      if (val === "1") return false;
      const ts = Number(val);
      if (isNaN(ts)) return false;
      if (isFeatureEnabled("session_timeout")) {
        // Check inactivity — only expire if user has been INACTIVE for 1 hour
        const lastActive = localStorage.getItem(`${LAST_ACTIVE_KEY}${uid}`);
        if (lastActive && lastActive !== "1") {
          const inactiveMs = Date.now() - Number(lastActive);
          return inactiveMs < SESSION_PIN_TIMEOUT_MS;
        }
        // No activity recorded yet — fall back to verification timestamp
        return Date.now() - ts < SESSION_PIN_TIMEOUT_MS;
      }
      return true;
    } catch {
      return false;
    }
  }, [isFeatureEnabled]);

  const markSessionVerified = useCallback((uid: string) => {
    try {
      localStorage.setItem(`${LOGIN_SECURITY_VERIFIED_KEY}${uid}`, Date.now().toString());
    } catch {}
  }, []);

  // Skip the DB query if session is already verified via localStorage
  const skipQuery = !userId || (userId ? isSessionVerified(userId) : false);

  const { data: secSettings, isLoading: secLoading, isError } = useSecuritySettings(
    skipQuery ? null : userId
  );

  // Update last_active timestamp on activity & check 24-hour logout
  useEffect(() => {
    if (!userId || !isFeatureEnabled("session_timeout")) return;

    const updateActivity = () => {
      try { localStorage.setItem(`${LAST_ACTIVE_KEY}${userId}`, Date.now().toString()); } catch {}
    };

    const checkTimeouts = async () => {
      try {
        const lastActive = localStorage.getItem(`${LAST_ACTIVE_KEY}${userId}`);
        if (lastActive && lastActive !== "1") {
          const elapsed = Date.now() - Number(lastActive);
          if (elapsed > SESSION_LOGOUT_TIMEOUT_MS) {
            const { supabase } = await import("@/integrations/supabase/client");
            await supabase.auth.signOut();
            return;
          }
        }
      } catch {}

      // 1-hour PIN re-verification — if expired, reset so we re-evaluate
      if (!isSessionVerified(userId)) {
        processedUserRef.current = null;
      }
    };

    updateActivity();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        checkTimeouts();
        updateActivity();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    const interval = setInterval(() => { updateActivity(); checkTimeouts(); }, 60_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(interval);
    };
  }, [userId, isFeatureEnabled, isSessionVerified]);

  // Process security settings once loaded — determine if modal is needed
  useEffect(() => {
    if (!userId || loading || skipQuery) return;
    if (secLoading) return;
    if (processedUserRef.current === userId) return;

    if (isError) {
      // On error, sign out for safety
      import("@/integrations/supabase/client").then(({ supabase }) => supabase.auth.signOut({ scope: "local" })).catch(() => {});
      processedUserRef.current = userId;
      return;
    }

    const needPin = secSettings?.pin_enabled && secSettings?.require_pin_login;
    const needTotp = secSettings?.totp_enabled && secSettings?.require_totp_login;

    if (needPin || needTotp) {
      setSecReqs({ require_pin: !!needPin, require_totp: !!needTotp });
      setShowModal(true);
    } else {
      markSessionVerified(userId);
    }
    processedUserRef.current = userId;
  }, [userId, loading, skipQuery, secLoading, isError, secSettings, markSessionVerified]);

  const handleVerified = useCallback(() => {
    setShowModal(false);
    if (userId) markSessionVerified(userId);
  }, [userId, markSessionVerified]);

  const handleClose = useCallback(async () => {
    setShowModal(false);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      await supabase.auth.signOut({ scope: "local" });
    } catch {}
    processedUserRef.current = null;
  }, []);

  const isReady = !userId || loading || skipQuery || !secLoading || processedUserRef.current === userId;
  if (!isReady && !isLoginAllowed) return <PageFallback />;

  return (
    <>
      {children}
      {showModal && (
        <Suspense fallback={null}>
          <SecurityVerificationModal
            open={showModal}
            onClose={handleClose}
            onVerified={handleVerified}
            requirePin={secReqs.require_pin}
            requireTotp={secReqs.require_totp}
          />
        </Suspense>
      )}
    </>
  );
};

const SocialTutorialTrigger = () => {
  const { user } = useAuth();
  const { isFeatureEnabled } = useFeatureToggles();
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const location = useLocation();

  // Don't show tutorial while on security setup or auth pages
  const isOnSetupOrAuth = ["/setup-security", "/auth", "/reset-password", "/forgot-password"].some(
    p => location.pathname.startsWith(p)
  );

  useEffect(() => {
    if (dismissed || isOnSetupOrAuth) { setShow(false); return; }
    if (!isFeatureEnabled("social_tutorial")) return;
    if (!user) { setShow(false); return; }

    let cancelled = false;
    checkTutorialSeenFromDB(user.id).then((seen) => {
      if (cancelled) return;
      if (!seen) {
        setTimeout(() => { if (!cancelled) setShow(true); }, 1200);
      } else {
        setShow(false);
      }
    });
    return () => { cancelled = true; };
  }, [user, dismissed, isFeatureEnabled, isOnSetupOrAuth]);

  const handleComplete = () => {
    setShow(false);
    setDismissed(true);
  };

  return (
    <AnimatePresence>
      {show && <SocialTutorial onComplete={handleComplete} userId={user?.id} />}
    </AnimatePresence>
  );
};

const GlobalSpaceRoom = () => {
  const { activeSpace, leaveSpace } = useActiveSpace();
  if (!activeSpace) return null;
  return (
    <SpaceRoom
      spaceId={activeSpace.id}
      spaceTitle={activeSpace.title}
      hostId={activeSpace.hostId}
      onClose={leaveSpace}
    />
  );
};

const App = () => {
  useEffect(() => {
    try {
      window.sessionStorage?.removeItem("chunk_reload");
    } catch {
      // ignore storage access errors
    }
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <QueryClientProvider client={queryClient}>
          <VerificationThresholdProvider>
          <AuthProvider>
            <ActiveSpaceProvider>
            <SpaceReplayProvider>
            <SidebarStateProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <PWAUpdatePrompt />
                <BrowserRouter>
                {/* IncomingCallBanner must be OUTSIDE ConditionalWagmiProvider so it persists across all route changes */}
                <Suspense fallback={null}><IncomingCallBanner /></Suspense>
                <ConditionalWagmiProvider>
                {/* Deferred: these components trigger network requests but aren't needed for first paint */}
                <DeferredMount delay={2000}>
                  <Suspense fallback={null}><AimtellProvider /></Suspense>
                  <SocialTutorialTrigger />
                  <Suspense fallback={null}><PendingCopyTrades /></Suspense>
                </DeferredMount>
                <GlobalSpaceRoom />
                <Suspense fallback={null}><SpaceReplayModal /></Suspense>
                <Suspense fallback={null}><SpaceReplayMiniPlayer /></Suspense>
                <Suspense fallback={null}><LiveSpaceFloatingButton /></Suspense>
                <ConditionalSidebar />
                <ConditionalLayout>
                  <div className="flex-1">
                    <Suspense fallback={<PageFallback />}>
                      <MaintenanceGuard>
                      <SecuritySetupGuard>
                      <LoginSecurityGuard>
                      <Routes>
                        <Route path="/" element={<Index />} />
                        <Route path="/index" element={<Navigate to="/" replace />} />
                        <Route path="/market/:id" element={<MarketDetail />} />
                        <Route path="/feed" element={<FeatureGate featureKey="feed"><Feed /></FeatureGate>} />
                        <Route path="/create" element={<FeatureGate featureKey="create_market"><Create /></FeatureGate>} />
                        <Route path="/rankings" element={<FeatureGate featureKey="rankings"><Rankings /></FeatureGate>} />
                        <Route path="/portfolio" element={<FeatureGate featureKey="portfolio"><Portfolio /></FeatureGate>} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/transactions" element={<TransactionHistory />} />
                        <Route path="/messages" element={<FeatureGate featureKey="dm_chat"><Messages /></FeatureGate>} />
                        <Route path="/messages/:conversationId" element={<FeatureGate featureKey="dm_chat"><MessageThread /></FeatureGate>} />
                        <Route path="/auth" element={<Auth />} />
                        <Route path="/reset-password" element={<ResetPassword />} />
                        <Route path="/forgot-password" element={<ForgotPassword />} />
                        <Route path="/setup-security" element={<SetupSecurity />} />
                        <Route path="/referrals" element={<FeatureGate featureKey="referrals"><Referrals /></FeatureGate>} />
                        <Route path="/commissions" element={<Commissions />} />
                        <Route path="/my-promotions" element={<MyPromotions />} />
                        <Route path="/faq" element={<FeatureGate featureKey="faq"><FAQ /></FeatureGate>} />
                        <Route path="/disclaimer" element={<Disclaimer />} />
                        <Route path="/terms" element={<Terms />} />
                        <Route path="/privacy" element={<Privacy />} />
                        <Route path="/maintenance" element={<Maintenance />} />
                        <Route path="/quick-trade" element={<FeatureGate featureKey="quick_trade"><QuickTrade /></FeatureGate>} />
                        <Route path="/user/:id" element={<UserProfile />} />
                        <Route path="/followers/:userId" element={<Followers />} />
                        <Route path="/followers" element={<Followers />} />
                        <Route path="/sales-deck" element={<FeatureGate featureKey="sales_deck"><SalesDeck /></FeatureGate>} />
                        <Route path="/admin" element={<AdminLayout />}>
                          <Route index element={<AdminDashboard />} />
                          <Route path="markets" element={<AdminMarkets />} />
                          <Route path="create-market" element={<AdminCreateMarket />} />
                          <Route path="comments" element={<AdminComments />} />
                          <Route path="transactions" element={<AdminTransactions />} />
                          <Route path="withdrawals" element={<AdminWithdrawals />} />
                          <Route path="deposits" element={<AdminDeposits />} />
                          <Route path="reconciliation" element={<AdminReconciliation />} />
                          <Route path="boosts" element={<AdminBoosts />} />
                          <Route path="users" element={<AdminUsers />} />
                          <Route path="commissions" element={<AdminCommissions />} />
                          <Route path="settings" element={<AdminSettings />} />
                          <Route path="analytics" element={<AdminAnalytics />} />
                          <Route path="contracts" element={<AdminContracts />} />
                          <Route path="moderation" element={<AdminModeration />} />
                          <Route path="checklist" element={<AdminChecklist />} />
                          <Route path="audit-log" element={<AdminAuditLog />} />
                          <Route path="quick-trade" element={<AdminQuickTrade />} />
                          <Route path="predictions" element={<AdminPredictions />} />
                          <Route path="social" element={<AdminSocial />} />
                          <Route path="fiat-settings" element={<AdminFiatSettings />} />
                          <Route path="referrals" element={<AdminReferrals />} />
                          <Route path="whatsapp" element={<AdminWhatsApp />} />
                          <Route path="telegram" element={<AdminTelegram />} />
                          <Route path="investor-deck" element={<InvestorDeck />} />
                          <Route path="aimtell" element={<AdminAimtell />} />
                          <Route path="notification-broadcast" element={<AdminNotificationBroadcast />} />
                          <Route path="api-keys" element={<AdminApiKeys />} />
                          <Route path="kyc" element={<AdminKyc />} />
                          <Route path="support" element={<AdminSupport />} />
                          <Route path="escrows" element={<AdminEscrows />} />
                        </Route>
                        <Route path="/business" element={<BusinessLayout />}>
                          <Route index element={<BusinessDashboard />} />
                          <Route path="deposits" element={<BusinessDeposits />} />
                          <Route path="api-keys" element={<BusinessApiKeys />} />
                          <Route path="customize" element={<BusinessCustomization />} />
                        </Route>
                        <Route path="/developers" element={<Developers />} />
                        <Route path="/embed/market/:id" element={<EmbedMarket />} />
                        <Route path="/embed/ticker" element={<EmbedTicker />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                      </LoginSecurityGuard>
                      </SecuritySetupGuard>
                      </MaintenanceGuard>
                    </Suspense>
                  </div>
                  
                  <ConditionalFooter />
                </ConditionalLayout>
                </ConditionalWagmiProvider>
                </BrowserRouter>
              </TooltipProvider>
            </SidebarStateProvider>
            </SpaceReplayProvider>
            </ActiveSpaceProvider>
          </AuthProvider>
          </VerificationThresholdProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
