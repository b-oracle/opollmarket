// App root
import { lazy, Suspense, useState, useEffect } from "react";
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
import SocialTutorial, { shouldShowTutorial } from "./components/SocialTutorial";

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
const AdminQuickTrade = lazy(() => import("./pages/admin/AdminQuickTrade"));
const AdminSocial = lazy(() => import("./pages/admin/AdminSocial"));
const Referrals = lazy(() => import("./pages/Referrals"));
const FAQ = lazy(() => import("./pages/FAQ"));
const Disclaimer = lazy(() => import("./pages/Disclaimer"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Maintenance = lazy(() => import("./pages/Maintenance"));
const QuickTrade = lazy(() => import("./pages/QuickTrade"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const Followers = lazy(() => import("./pages/Followers"));

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
  const ml = isAdmin ? "" : collapsed ? "md:ml-[4.5rem]" : "md:ml-60";
  return <div className={`${ml} min-h-screen flex flex-col transition-all duration-300`}>{children}</div>;
};

const PageFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <LogoLoader />
  </div>
);

const SocialTutorialTrigger = () => {
  const { user } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (user && shouldShowTutorial()) {
      const timer = setTimeout(() => setShow(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [user]);

  return (
    <AnimatePresence>
      {show && <SocialTutorial onComplete={() => setShow(false)} />}
    </AnimatePresence>
  );
};

const App = () => (
  <ErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SidebarStateProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <PWAUpdatePrompt />
                <BrowserRouter>
                <SocialTutorialTrigger />
                <ConditionalSidebar />
                <ConditionalLayout>
                  <div className="flex-1">
                    <Suspense fallback={<PageFallback />}>
                      <Routes>
                        <Route path="/" element={<Index />} />
                        <Route path="/feed" element={<Feed />} />
                        <Route path="/market/:id" element={<MarketDetail />} />
                        <Route path="/create" element={<Create />} />
                        <Route path="/rankings" element={<Rankings />} />
                        <Route path="/portfolio" element={<Portfolio />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/auth" element={<Auth />} />
                        <Route path="/reset-password" element={<ResetPassword />} />
                        <Route path="/forgot-password" element={<ForgotPassword />} />
                        <Route path="/referrals" element={<Referrals />} />
                        <Route path="/faq" element={<FAQ />} />
                        <Route path="/disclaimer" element={<Disclaimer />} />
                        <Route path="/terms" element={<Terms />} />
                        <Route path="/privacy" element={<Privacy />} />
                        <Route path="/maintenance" element={<Maintenance />} />
                        <Route path="/quick-trade" element={<QuickTrade />} />
                        <Route path="/user/:id" element={<UserProfile />} />
                        <Route path="/followers" element={<Followers />} />
                        <Route path="/admin" element={<AdminLayout />}>
                          <Route index element={<AdminDashboard />} />
                          <Route path="markets" element={<AdminMarkets />} />
                          <Route path="create-market" element={<AdminCreateMarket />} />
                          <Route path="comments" element={<AdminComments />} />
                          <Route path="transactions" element={<AdminTransactions />} />
                          <Route path="withdrawals" element={<AdminWithdrawals />} />
                          <Route path="deposits" element={<AdminDeposits />} />
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
                          <Route path="social" element={<AdminSocial />} />
                        </Route>
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </Suspense>
                  </div>
                  
                  <ConditionalFooter />
                </ConditionalLayout>
                </BrowserRouter>
              </TooltipProvider>
            </SidebarStateProvider>
          </AuthProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
