// App root
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { WagmiProvider } from "wagmi";
import { ThemeProvider } from "next-themes";
import { config } from "@/lib/wagmi";
import Index from "./pages/Index";
import Feed from "./pages/Feed";
import MarketDetail from "./pages/MarketDetail";
import Create from "./pages/Create";
import Rankings from "./pages/Rankings";
import Profile from "./pages/Profile";
import Portfolio from "./pages/Portfolio";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminMarkets from "./pages/admin/AdminMarkets";
import AdminComments from "./pages/admin/AdminComments";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminCreateMarket from "./pages/admin/AdminCreateMarket";
import AdminTransactions from "./pages/admin/AdminTransactions";
import AdminWithdrawals from "./pages/admin/AdminWithdrawals";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminCommissions from "./pages/admin/AdminCommissions";
import AdminBoosts from "./pages/admin/AdminBoosts";
import Referrals from "./pages/Referrals";
import FAQ from "./pages/FAQ";
import Disclaimer from "./pages/Disclaimer";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import NotFound from "./pages/NotFound";

import DesktopSidebar from "./components/DesktopSidebar";
import DesktopFooter from "./components/DesktopFooter";
const queryClient = new QueryClient();

const isFooterShown = (pathname: string) => pathname === "/";

const ConditionalFooter = () => {
  const location = useLocation();
  if (!isFooterShown(location.pathname)) return null;
  return <DesktopFooter />;
};

const ConditionalPadding = () => {
  const location = useLocation();
  if (!isFooterShown(location.pathname)) return null;
  return <div className="hidden md:block pb-44" />;
};

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          
          <BrowserRouter>
            <DesktopSidebar />
            <div className="md:ml-60 min-h-screen flex flex-col">
              <div className="flex-1">
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
                  <Route path="/referrals" element={<Referrals />} />
                  <Route path="/faq" element={<FAQ />} />
                  <Route path="/disclaimer" element={<Disclaimer />} />
                  <Route path="/terms" element={<Terms />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<AdminDashboard />} />
                    <Route path="markets" element={<AdminMarkets />} />
                    <Route path="create-market" element={<AdminCreateMarket />} />
                    <Route path="comments" element={<AdminComments />} />
                    <Route path="transactions" element={<AdminTransactions />} />
                    <Route path="withdrawals" element={<AdminWithdrawals />} />
                    <Route path="boosts" element={<AdminBoosts />} />
                    <Route path="users" element={<AdminUsers />} />
                    <Route path="commissions" element={<AdminCommissions />} />
                    <Route path="settings" element={<AdminSettings />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </div>
              <ConditionalPadding />
              <ConditionalFooter />
            </div>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </ThemeProvider>
);

export default App;
