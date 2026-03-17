// App root – v2
import { lazy, Suspense, useState, useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { WagmiProvider } from "wagmi";
import { ThemeProvider } from "next-themes";
import { config } from "@/lib/wagmi";
import ErrorBoundary from "./components/ErrorBoundary";
import DesktopSidebar from "./components/DesktopSidebar";
import DesktopFooter from "./components/DesktopFooter";
import PWAUpdatePrompt from "./components/PWAUpdatePrompt";
import LogoLoader from "./components/LogoLoader";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { SidebarStateProvider, useSidebarState } from "./hooks/useSidebarState";
import SocialTutorial, { checkTutorialSeenFromDB } from "./components/SocialTutorial";
import { useFeatureToggles } from "./hooks/useFeatureToggles";
import PendingCopyTrades from "./components/PendingCopyTrades";
import { VerificationThresholdProvider } from "./components/NftBadge";
import AimtellProvider from "./components/AimtellProvider";

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
const AdminFiatSettings = lazy(() => import("./pages/admin/AdminFiatSettings"));
const AdminReferrals = lazy(() => import("./pages/admin/AdminReferrals"));
const AdminWhatsApp = lazy(() => import("./pages/admin/AdminWhatsApp"));
const AdminTelegram = lazy(() => import("./pages/admin/AdminTelegram"));
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

const queryClient = new QueryClient();

const isAdminRoute = (pathname: string) => pathname.startsWith("/admin");

const ConditionalFooter = () => {
  const location = useLocation();
  if (isAdminRoute(location.pathname)) return null;
  return <DesktopFooter />;
};

const ConditionalSidebar = () => {
  const location = useLocation();
  if (isAdminRoute(location.pathname)) return null;
  return <DesktopSidebar />;
};

const ConditionalLayout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const isAdmin = isAdminRoute(location.pathname);
  const { collapsed } = useSidebarState();
  const ml = isAdmin ? "" : collapsed ? "lg:ml-[4.5rem]" : "lg:ml-60";
  return <div className={`${ml} min-h-screen flex flex-col transition-all duration-300`}>{children}</div>;
};

const PageFallback = () => (
  <div className="flex items-center justify-center min-h-screen pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[calc(4rem+env(safe-area-inset-bottom))]">
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

  if (isLoading) return null;
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
  const [checked, setChecked] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const checkedUserRef = useRef<string | null>(null);
  const checkingRef = useRef(false);

  const allowedPaths = ["/setup-security", "/auth", "/reset-password", "/forgot-password", "/terms", "/privacy", "/disclaimer"];
  const isAllowed = allowedPaths.some(p => location.pathname.startsWith(p));

  // Use user.id as dep instead of user object to avoid re-fires on reference changes
  const userId = user?.id ?? null;

  // Listen for custom event from SetupSecurity page when setup completes
  useEffect(() => {
    const handler = () => {
      setNeedsSetup(false);
      checkedUserRef.current = userId;
      setChecked(true);
    };
    window.addEventListener("security-setup-complete", handler);
    return () => window.removeEventListener("security-setup-complete", handler);
  }, [userId]);

  useEffect(() => {
    if (!userId || loading) { setChecked(true); setNeedsSetup(false); return; }

    // If we already checked this user and determined setup is NOT needed, skip
    if (checkedUserRef.current === userId && !needsSetup) {
      setChecked(true);
      return;
    }

    if (checkingRef.current) return; // prevent concurrent checks
    checkingRef.current = true;

    import("@/integrations/supabase/client").then(({ supabase }) => {
      supabase
        .from("user_security_settings" as any)
        .select("security_setup_complete")
        .eq("user_id", userId)
        .maybeSingle()
        .then(({ data, error }) => {
          checkingRef.current = false;
          if (error) {
            setChecked(true);
            return;
          }
          const d = data as any;
          const needs = !d || d.security_setup_complete === false;
          setNeedsSetup(needs);
          checkedUserRef.current = userId;
          setChecked(true);
        });
    });
  }, [userId, loading, location.pathname]);

  if (!checked) return null;
  if (needsSetup && !isAllowed) return <Navigate to="/setup-security" replace />;
  return <>{children}</>;
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

const App = () => (
  <ErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <VerificationThresholdProvider>
          <AuthProvider>
            <SidebarStateProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <PWAUpdatePrompt />
                <BrowserRouter>
                <SocialTutorialTrigger />
                <AimtellProvider />
                <PendingCopyTrades />
                <ConditionalSidebar />
                <ConditionalLayout>
                  <div className="flex-1">
                    <Suspense fallback={<PageFallback />}>
                      <MaintenanceGuard>
                      <SecuritySetupGuard>
                      <Routes>
                        <Route path="/" element={<Index />} />
                        <Route path="/market/:id" element={<MarketDetail />} />
                        <Route path="/feed" element={<FeatureGate featureKey="feed"><Feed /></FeatureGate>} />
                        <Route path="/create" element={<FeatureGate featureKey="create_market"><Create /></FeatureGate>} />
                        <Route path="/rankings" element={<FeatureGate featureKey="rankings"><Rankings /></FeatureGate>} />
                        <Route path="/portfolio" element={<FeatureGate featureKey="portfolio"><Portfolio /></FeatureGate>} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/auth" element={<Auth />} />
                        <Route path="/reset-password" element={<ResetPassword />} />
                        <Route path="/forgot-password" element={<ForgotPassword />} />
                        <Route path="/setup-security" element={<SetupSecurity />} />
                        <Route path="/referrals" element={<FeatureGate featureKey="referrals"><Referrals /></FeatureGate>} />
                        <Route path="/commissions" element={<Commissions />} />
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
                        </Route>
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                      </SecuritySetupGuard>
                      </MaintenanceGuard>
                    </Suspense>
                  </div>
                  
                  <ConditionalFooter />
                </ConditionalLayout>
                </BrowserRouter>
              </TooltipProvider>
            </SidebarStateProvider>
          </AuthProvider>
          </VerificationThresholdProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
