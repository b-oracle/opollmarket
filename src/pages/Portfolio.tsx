// Loader2 imported from lucide below
import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount } from "wagmi";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import BottomSheet from "@/components/BottomSheet";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Copy,
  BarChart3,
  DollarSign,
  Target,
  Percent,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  Trophy,
  Ban,
  Gift,
  FileEdit,
  Trash2,
  Edit,
  Share2,
  Shield,
  Info,
} from "lucide-react";
import ShareModal from "@/components/ShareModal";
import { PortfolioSummaryShareCard, PositionShareCard } from "@/components/PortfolioShareCards";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import WinCelebrationModal from "@/components/WinCelebrationModal";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import useAnalytics from "@/hooks/useAnalytics";
import { useUserLimitOrders, useCancelLimitOrder } from "@/hooks/useLimitOrders";
import CopySubscriptions from "@/components/CopySubscriptions";
import { useCommissionSettings } from "@/hooks/useCommissionSettings";
import { useUserBalance } from "@/hooks/useUserBalance";
import OutstandingDebtBanner from "@/components/OutstandingDebtBanner";
import { optionColors } from "@/lib/optionColors";

interface PositionRow {
  id: string;
  market_id: string;
  side: string;
  option_id: string | null;
  shares: number;
  avg_price: number;
  markets: {
    title: string;
    yes_price: number;
    no_price: number;
    category: string;
    end_date: string;
    status: string;
    market_type: string;
  } | null;
}

interface EnrichedPosition {
  id: string;
  marketId: string;
  marketTitle: string;
  side: "yes" | "no";
  optionId: string | null;
  optionLabel: string | null;
  optionSortOrder: number | null;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  invested: number;
  currentValue: number;
  unrealizedPnl: number;
  pnlPercent: number;
  maxPayout: number;
  category: string;
  endDate: string;
  status: string;
  marketType: string;
}

type FilterType = "active" | "all" | "profit" | "loss" | "resolved";
type PortfolioTab = "positions" | "orders" | "copy" | "drafts" | "insurance";

const Sparkline = ({ avgPrice, currentPrice, seed }: { avgPrice: number; currentPrice: number; seed: string }) => {
  const count = 20;
  const seedNum = seed.charCodeAt(seed.length - 1) + seed.charCodeAt(0);
  const points: number[] = [];
  for (let i = 0; i < count; i++) {
    const progress = i / (count - 1);
    const base = avgPrice + (currentPrice - avgPrice) * progress;
    const noise = Math.sin(i * 1.3 + seedNum) * 3 + Math.cos(i * 0.7 + seedNum * 2) * 2;
    points.push(base + noise);
  }
  points[points.length - 1] = currentPrice;

  const min = Math.min(...points) - 1;
  const max = Math.max(...points) + 1;
  const w = 120;
  const h = 28;
  const isUp = currentPrice >= avgPrice;
  const color = isUp ? "hsl(var(--neon-yes))" : "hsl(var(--neon-no))";

  const pathD = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / (max - min)) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const areaD = pathD + ` L${w},${h} L0,${h} Z`;

  return (
    <div className="my-2">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }}>
        <defs>
          <linearGradient id={`spark-${seed}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#spark-${seed})`} />
        <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={w} cy={h - ((currentPrice - min) / (max - min)) * h} r={2.5} fill={color} />
      </svg>
    </div>
  );
};

const Portfolio = () => {
  const { isConnected } = useAccount();
  const { user, loading: authLoading } = useAuth();
  const isAuthenticated = !!user || isConnected;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterType>("active");
  const [activeTab, setActiveTab] = useState<PortfolioTab>("positions");
  const [sellTarget, setSellTarget] = useState<EnrichedPosition | null>(null);
  const [sellStep, setSellStep] = useState<"confirm" | "executing" | "success" | "error">("confirm");
  const [winModal, setWinModal] = useState<{ open: boolean; market: string; side: string; payout: number; profit: number }>({
    open: false, market: "", side: "YES", payout: 0, profit: 0,
  });
  const { track } = useAnalytics();
  const { data: userLimitOrders = [], isLoading: limitOrdersLoading } = useUserLimitOrders();
  const cancelLimitOrder = useCancelLimitOrder();
  const { data: commission } = useCommissionSettings();
  const exitFeePercent = commission?.exit_fee_percent ?? 5;
  const { bonusBalance, insuranceBalance } = useUserBalance();
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareTitle, setShareTitle] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const activeCaptureRef = useRef<HTMLDivElement | null>(null);
  const portfolioCardRef = useRef<HTMLDivElement | null>(null);
  const positionCardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [sharePositionData, setSharePositionData] = useState<EnrichedPosition | null>(null);

  useEffect(() => { track("page_view", { page: "portfolio" }); }, []);

  const [draftBannerDismissed, setDraftBannerDismissed] = useState(() => {
    try { return sessionStorage.getItem("draft_banner_dismissed") === "1"; } catch { return false; }
  });

  // Fetch user drafts
  const { data: drafts = [], isLoading: draftsLoading, refetch: refetchDrafts } = useQuery({
    queryKey: ["user-drafts", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("markets")
        .select("id, title, category, image_url, created_at, updated_at, market_type")
        .eq("creator_wallet", user.id)
        .eq("status", "draft")
        .order("updated_at", { ascending: false });
      if (error) { console.error("Failed to fetch drafts:", error); return []; }
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Fetch insurance claims history
  const { data: insuranceClaims = [], isLoading: claimsLoading } = useQuery({
    queryKey: ["insurance-claims", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("insurance_claims")
        .select("id, tier, premium_paid, claim_amount, status, created_at, claimed_at, market_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) { console.error("Failed to fetch insurance claims:", error); return []; }
      // Fetch market titles
      const marketIds = [...new Set((data || []).map(c => c.market_id).filter(Boolean))];
      let titleMap = new Map<string, string>();
      if (marketIds.length > 0) {
        const { data: markets } = await supabase.from("markets").select("id, title").in("id", marketIds);
        if (markets) markets.forEach(m => titleMap.set(m.id, m.title));
      }
      return (data || []).map(c => ({ ...c, market_title: titleMap.get(c.market_id) || "Unknown Market" }));
    },
    enabled: !!user?.id,
  });

  const deleteDraft = useCallback(async (draftId: string) => {
    // Delete options first, then market
    await supabase.from("market_options").delete().eq("market_id", draftId);
    const { error } = await supabase.from("markets").delete().eq("id", draftId);
    if (error) { toast.error("Failed to delete draft"); return; }
    toast.success("Draft deleted");
    refetchDrafts();
  }, [refetchDrafts]);

  // Fetch real positions
  const { data: rawPositions = [], isLoading } = useQuery({
    queryKey: ["portfolio-positions", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("positions")
        .select("id, market_id, side, option_id, shares, avg_price, markets(title, yes_price, no_price, category, end_date, status, market_type, volume, liquidity), market_options(label, sort_order, price)")
        .eq("user_id", user.id)
        .gt("shares", 0)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Failed to fetch positions:", error);
        return [];
      }
      return (data || []) as unknown as PositionRow[];
    },
    enabled: !!user?.id,
  });

  // Fetch actual payouts for resolved markets to get real P&L (not theoretical $1/share)
  const resolvedMarketIds = rawPositions
    .filter((p) => p.markets && p.markets.status === "resolved")
    .map((p) => p.market_id);

  const { data: payoutMap = {} } = useQuery({
    queryKey: ["portfolio-payouts", user?.id, resolvedMarketIds.join(",")],
    queryFn: async () => {
      if (!user?.id || resolvedMarketIds.length === 0) return {};
      const { data, error } = await supabase
        .from("transactions")
        .select("market_id, amount, type")
        .eq("user_id", user.id)
        .in("market_id", resolvedMarketIds)
        .in("type", ["payout", "refund", "one_sided_refund"])
        .eq("status", "confirmed");
      if (error) return {};
      // Sum payouts per market
      const map: Record<string, number> = {};
      for (const tx of data || []) {
        if (tx.market_id) {
          map[tx.market_id] = (map[tx.market_id] || 0) + Number(tx.amount);
        }
      }
      return map;
    },
    enabled: !!user?.id && resolvedMarketIds.length > 0,
  });

  // Fetch pool breakdown for resolved multi/range markets
  const resolvedMultiRangeIds = rawPositions
    .filter((p) => p.markets && p.markets.status === "resolved" && (p.markets.market_type === "multi" || p.markets.market_type === "range"))
    .map((p) => p.market_id);

  const { data: poolBreakdownMap = {} } = useQuery({
    queryKey: ["portfolio-pool-breakdown", resolvedMultiRangeIds.join(",")],
    queryFn: async () => {
      if (resolvedMultiRangeIds.length === 0) return {};
      // Fetch all positions for these markets to compute pool stats
      const { data: allPositions, error } = await supabase
        .from("positions")
        .select("market_id, shares, avg_price, side, option_id")
        .in("market_id", resolvedMultiRangeIds)
        .gt("shares", 0);
      if (error || !allPositions) return {};

      // Fetch market winning info
      const { data: markets } = await supabase
        .from("markets")
        .select("id, resolved_side, winning_option_id, market_type")
        .in("id", resolvedMultiRangeIds);

      const map: Record<string, { totalPool: number; winnersCapital: number; loserPool: number; totalWinnerShares: number; profitPerShare: number }> = {};

      for (const mkt of markets || []) {
        const mktPositions = allPositions.filter((p) => p.market_id === mkt.id);
        const winners = mktPositions.filter((p) =>
          mkt.market_type === "binary"
            ? p.side === mkt.resolved_side
            : p.option_id === mkt.winning_option_id
        );
        const losers = mktPositions.filter((p) =>
          mkt.market_type === "binary"
            ? p.side !== mkt.resolved_side
            : p.option_id !== mkt.winning_option_id
        );
        const totalPool = mktPositions.reduce((s, p) => s + p.shares * p.avg_price, 0);
        const winnersCapital = winners.reduce((s, p) => s + p.shares * p.avg_price, 0);
        const loserPool = totalPool - winnersCapital;
        const totalWinnerShares = winners.reduce((s, p) => s + p.shares, 0);
        const profitPerShare = totalWinnerShares > 0 ? loserPool / totalWinnerShares : 0;
        map[mkt.id] = { totalPool, winnersCapital, loserPool, totalWinnerShares, profitPerShare };
      }
      return map;
    },
    enabled: resolvedMultiRangeIds.length > 0,
  });

  // Enrich positions with P&L
  const enriched: EnrichedPosition[] = rawPositions.map((p) => {
    const market = p.markets;
    const avgPriceCents = Math.round(p.avg_price * 100);
    const isResolved = market?.status === "resolved";
    const isMultiOrRange = market?.market_type === "multi" || market?.market_type === "range";
    const optionPrice = (p as any).market_options?.price;
    const currentPriceCents = market
      ? optionPrice != null
        ? Math.round(Number(optionPrice) * 100)
        : Math.round((p.side === "yes" ? market.yes_price : market.no_price) * 100)
      : avgPriceCents;
    const invested = p.shares * p.avg_price;

    // For resolved multi/range markets, use actual payout instead of theoretical shares × $1
    // payoutMap has entries only for markets with payouts; no entry = $0 payout (lost)
    let currentValue: number;
    if (isResolved && isMultiOrRange) {
      currentValue = payoutMap[p.market_id] ?? 0;
    } else if (!isResolved && market) {
      // Slippage-adjusted "realizable" value for active positions:
      // Simulate the AMM price impact of selling this position
      const rawPrice = currentPriceCents / 100;
      const grossProceeds = p.shares * rawPrice;
      const totalLiq = Number((market as any).volume || 0) + Number((market as any).liquidity || 0) + 100;
      const impact = Math.min(grossProceeds / totalLiq, 0.15);
      const adjustedPrice = Math.max(0.01, rawPrice - impact / 2); // avg execution price ≈ midpoint
      const adjustedGross = p.shares * adjustedPrice;
      const exitFeePct = exitFeePercent / 100;
      currentValue = adjustedGross * (1 - exitFeePct);
    } else {
      currentValue = p.shares * (currentPriceCents / 100);
    }

    const unrealizedPnl = currentValue - invested;
    const pnlPercent = invested > 0 ? (unrealizedPnl / invested) * 100 : 0;
    const maxPayout = isMultiOrRange && isResolved && payoutMap[p.market_id] !== undefined
      ? payoutMap[p.market_id]
      : p.shares; // $1 per share for binary

    const optionLabel = (p as any).market_options?.label || null;
    const optionSortOrder: number | null = (p as any).market_options?.sort_order ?? null;

    return {
      id: p.id,
      marketId: p.market_id,
      marketTitle: market?.title || "Unknown Market",
      side: p.side as "yes" | "no",
      optionId: p.option_id,
      optionLabel,
      optionSortOrder,
      shares: p.shares,
      avgPrice: avgPriceCents,
      currentPrice: currentPriceCents,
      invested,
      currentValue,
      unrealizedPnl,
      pnlPercent,
      maxPayout,
      category: market?.category || "",
      endDate: market?.end_date || "",
      status: market?.status || "active",
      marketType: market?.market_type || "binary",
    };
  });

  const filtered = enriched.filter((p) => {
    if (filter === "active") return p.status === "active";
    if (filter === "resolved") return p.status !== "active";
    if (filter === "profit") return p.unrealizedPnl > 0;
    if (filter === "loss") return p.unrealizedPnl < 0;
    return true;
  });

  const activePositions = enriched.filter((p) => p.status === "active");
  const resolvedPositions = enriched.filter((p) => p.status !== "active");

  const totalInvested = enriched.reduce((s, p) => s + p.invested, 0);
  const totalValue = enriched.reduce((s, p) => s + p.currentValue, 0);
  const totalPnl = totalValue - totalInvested;
  const totalPnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
  const totalMaxPayout = enriched.reduce((s, p) => s + p.maxPayout, 0);

  // Separate realized (resolved/ended markets) vs unrealized (active markets)
  const unrealizedPnlTotal = activePositions.reduce((s, p) => s + p.unrealizedPnl, 0);
  const realizedPnlTotal = resolvedPositions.reduce((s, p) => s + p.unrealizedPnl, 0);

  const getTimeRemaining = (endDate: string) => {
    if (!endDate) return "—";
    const diff = new Date(endDate).getTime() - Date.now();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return "Ended";
    if (days > 30) return `${Math.floor(days / 30)}mo`;
    return `${days}d`;
  };

  const SELL_LOCK_MS = 60 * 60 * 1000;
  const isSellLocked = (endDate: string) => {
    if (!endDate) return false;
    const diff = new Date(endDate).getTime() - Date.now();
    return diff > 0 && diff <= SELL_LOCK_MS;
  };


  const openSell = (pos: EnrichedPosition, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSellLocked(pos.endDate)) {
      toast.error("Selling is locked in the final hour before close. Hold until resolution.");
      return;
    }
    setSellTarget(pos);
    setSellStep("confirm");
  };


  const closeSell = () => {
    setSellTarget(null);
    setSellStep("confirm");
  };

  const executeSell = useCallback(async () => {
    if (!sellTarget || !user?.id) return;
    setSellStep("executing");

    try {
      const { data, error } = await supabase.functions.invoke("sell-position", {
        body: { positionId: sellTarget.id },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || "Sell failed");
      }

      setSellStep("success");
      toast.success(`Position closed! You received $${Number(data.netProceeds).toFixed(2)}`);

      queryClient.invalidateQueries({ queryKey: ["portfolio-positions"] });
      queryClient.invalidateQueries({ queryKey: ["user-balance"] });

      if (sellTarget.unrealizedPnl > 0) {
        setTimeout(() => {
          setWinModal({
            open: true,
            market: sellTarget.marketTitle,
            side: sellTarget.optionLabel || sellTarget.side.toUpperCase(),
            payout: data.grossProceeds ?? sellTarget.currentValue,
            profit: sellTarget.unrealizedPnl,
          });
        }, 600);
      }
    } catch (err: any) {
      console.error("Sell failed:", err);
      toast.error(err?.message || "Failed to close position");
      setSellStep("error");
    }
  }, [sellTarget, user?.id, queryClient]);

  const openPortfolioShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    activeCaptureRef.current = portfolioCardRef.current;
    setShareTitle("My Portfolio Performance");
    setShareUrl(`${window.location.origin}/portfolio`);
    setShareModalOpen(true);
  };

  const openPositionShare = (pos: EnrichedPosition, e: React.MouseEvent) => {
    e.stopPropagation();
    setSharePositionData(pos);
    const ref = positionCardRefs.current.get(pos.id);
    activeCaptureRef.current = ref || null;
    setShareTitle(`${pos.marketTitle} - ${pos.optionLabel || pos.side.toUpperCase()}`);
    setShareUrl(`${window.location.origin}/market/${pos.marketId}`);
    setShareModalOpen(true);
  };


  if (authLoading) {
    return (
      <div className="min-h-dvh bg-background" style={{ paddingBottom: 'calc(1rem + var(--content-bottom))' }}>
        <TopBar />
        <div className="max-w-lg md:max-w-4xl mx-auto px-4 flex items-center justify-center min-h-[60dvh]" style={{ paddingTop: 'calc(1.5rem + var(--content-top))' }}>
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
        <BottomNav />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-dvh bg-background" style={{ paddingBottom: 'calc(1rem + var(--content-bottom))' }}>
        <TopBar />
        <div className="max-w-lg md:max-w-4xl mx-auto px-4 flex flex-col items-center justify-center min-h-[60dvh]" style={{ paddingTop: 'calc(1.5rem + var(--content-top))' }}>
          <div className="glass rounded-2xl p-8 text-center max-w-sm">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Wallet className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-2">Sign In Required</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Sign in or connect your wallet to view your portfolio and active positions.
            </p>
            <button
              onClick={() => navigate("/auth")}
              className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Sign In
            </button>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="h-dvh bg-background overflow-y-auto overscroll-contain" style={{ paddingBottom: 'calc(1rem + var(--content-bottom))' }}>
      <TopBar />
      <div className="max-w-lg md:max-w-4xl mx-auto px-3 sm:px-4" style={{ paddingTop: 'calc(1.5rem + var(--content-top))' }}>
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
          <div className="flex items-center gap-3 mb-1">
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 rounded-xl glass flex items-center justify-center shrink-0 hover:bg-muted/50 active:scale-95 transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-bold">Portfolio</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading..." : `${enriched.length} active position${enriched.length !== 1 ? "s" : ""}`}
          </p>
        </motion.div>

        {/* Outstanding deposit debt — auto-settles on next deposit */}
        <OutstandingDebtBanner className="mb-4" />

        {/* Summary cards */}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass rounded-2xl p-4 mb-4"
        >
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Portfolio Value</p>
              <p className="text-2xl font-bold">${totalValue.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Total P&L</p>
              <p className={`text-2xl font-bold flex items-center justify-end gap-1 ${totalPnl >= 0 ? "neon-yes" : "neon-no"}`}>
                {totalPnl >= 0 ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                ${Math.abs(totalPnl).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Realized vs Unrealized P&L breakdown */}
          <div className="grid grid-cols-2 gap-3 pt-2.5 mt-2.5 border-t border-border/50">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Realized P&L</p>
              <p className={`text-sm font-bold flex items-center gap-0.5 ${realizedPnlTotal >= 0 ? "neon-yes" : "neon-no"}`}>
                {realizedPnlTotal >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                ${Math.abs(realizedPnlTotal).toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Unrealized P&L</p>
              <p className={`text-sm font-bold flex items-center justify-end gap-0.5 ${unrealizedPnlTotal >= 0 ? "neon-yes" : "neon-no"}`}>
                {unrealizedPnlTotal >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                ${Math.abs(unrealizedPnlTotal).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border">
            <div className="col-span-3 flex justify-end mb-1">
              <button
                onClick={openPortfolioShare}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold hover:bg-primary/20 transition-all active:scale-95"
              >
                <Share2 className="w-3 h-3" /> Share
              </button>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                <DollarSign className="w-3 h-3" />
                <span className="text-[10px]">Invested</span>
              </div>
              <p className="text-sm font-bold">${totalInvested.toFixed(0)}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                <Percent className="w-3 h-3" />
                <span className="text-[10px]">ROI</span>
              </div>
              <p className={`text-sm font-bold ${totalPnlPercent >= 0 ? "neon-yes" : "neon-no"}`}>
                {totalPnlPercent >= 0 ? "+" : ""}{totalPnlPercent.toFixed(1)}%
              </p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                <Target className="w-3 h-3" />
                <span className="text-[10px]">Max Payout</span>
              </div>
              <p className="text-sm font-bold">${totalMaxPayout.toFixed(0)}</p>
            </div>
          </div>

        </motion.div>

        {/* oSURE Protection Card */}
        {insuranceBalance > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-2xl p-4 mb-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold">oSURE Protection</p>
                  <p className="text-[10px] text-muted-foreground">Win a prediction to unlock to main balance</p>
                </div>
              </div>
              <span className="text-lg font-bold text-primary">${insuranceBalance.toFixed(2)}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border text-center">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Total Claims</p>
                <p className="text-sm font-bold">{insuranceClaims.filter(c => c.status === "claimed").length}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Premiums Paid</p>
                <p className="text-sm font-bold">${insuranceClaims.reduce((s, c) => s + Number(c.premium_paid), 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Total Claimed</p>
                <p className="text-sm font-bold neon-yes">${insuranceClaims.filter(c => c.status === "claimed").reduce((s, c) => s + Number(c.claim_amount), 0).toFixed(2)}</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Portfolio Tabs: Positions / Open Orders */}
        <div className="overflow-x-auto scrollbar-hide -mx-3 px-3 mb-4">
          <div className="flex gap-1 p-0.5 rounded-lg bg-muted/50 w-max min-w-full">
          <button
            onClick={() => setActiveTab("positions")}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === "positions"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BarChart3 className="w-3 h-3" />
            Positions
          </button>
          <button
            onClick={() => setActiveTab("orders")}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === "orders"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Clock className="w-3 h-3" />
            Orders
            {userLimitOrders.filter(o => o.status === "pending").length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-500 text-[9px] font-bold">
                {userLimitOrders.filter(o => o.status === "pending").length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("copy")}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === "copy"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Copy className="w-3 h-3" />
            Copy Trades
          </button>
          <button
            onClick={() => setActiveTab("drafts")}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === "drafts"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileEdit className="w-3 h-3" />
            Drafts
            {drafts.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-500 text-[9px] font-bold">
                {drafts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("insurance")}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === "insurance"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Shield className="w-3 h-3" />
            oSURE
            {insuranceClaims.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 text-[9px] font-bold">
                {insuranceClaims.length}
              </span>
            )}
          </button>
          </div>
        </div>

        {/* Draft Reminder Banner */}
        {activeTab !== "drafts" && drafts.length > 0 && !draftBannerDismissed && (
          <div className="flex items-center justify-between gap-2 p-3 mb-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-center gap-2 min-w-0">
              <FileEdit className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-xs text-amber-200 truncate">
                You have {drafts.length} unfinished draft{drafts.length > 1 ? "s" : ""} —{" "}
                <button
                  onClick={() => setActiveTab("drafts")}
                  className="underline font-semibold text-amber-400 hover:text-amber-300"
                >
                  Continue editing
                </button>
              </span>
            </div>
            <button
              onClick={() => {
                setDraftBannerDismissed(true);
                try { sessionStorage.setItem("draft_banner_dismissed", "1"); } catch {}
              }}
              className="text-amber-500/60 hover:text-amber-400"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {activeTab === "positions" && (
          <>
            {/* Filter tabs */}
            <div className="flex gap-1 p-0.5 rounded-lg bg-muted/50 mb-4 w-full sm:w-fit overflow-x-auto scrollbar-hide">
              {([
                { key: "active" as FilterType, label: "Active", icon: CheckCircle2 },
                { key: "profit" as FilterType, label: "In Profit", icon: TrendingUp },
                { key: "loss" as FilterType, label: "At Loss", icon: TrendingDown },
                { key: "resolved" as FilterType, label: "Resolved", icon: Trophy },
                { key: "all" as FilterType, label: "All" },
              ]).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
                    filter === f.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f.icon && <f.icon className="w-3 h-3" />}
                  {f.label}
                </button>
              ))}
            </div>

            {/* Loading state */}
            {isLoading && (
              <div className="space-y-3 animate-pulse">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="glass rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-muted/60 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-muted/60 rounded-lg w-2/3" />
                        <div className="h-3 bg-muted/40 rounded-lg w-1/3" />
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <div className="h-3 bg-muted/40 rounded w-20" />
                      <div className="h-3 bg-muted/40 rounded w-16" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!isLoading && enriched.length === 0 && (
              <div className="glass rounded-xl p-8 text-center">
                <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-base font-bold mb-1">No Positions Yet</h3>
                <p className="text-sm text-muted-foreground mb-4">Start predicting on markets to build your portfolio.</p>
                <button
                  onClick={() => navigate("/")}
                  className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  Browse Markets
                </button>
              </div>
            )}

            {/* Positions list */}
            {!isLoading && (
              <div className="space-y-3">
                {filtered.map((pos, i) => (
                  <motion.div
                    key={pos.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => navigate(`/market/${pos.marketId}`)}
                    className="w-full glass rounded-xl p-4 text-left transition-all active:scale-[0.98] hover:bg-accent/30 cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <p className="text-sm font-semibold leading-tight flex-1 line-clamp-2">{pos.marketTitle}</p>
                      {pos.optionLabel ? (
                        <span
                          className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase"
                          style={{
                            backgroundColor: optionColors[(pos.optionSortOrder ?? 0) % optionColors.length] + '22',
                            color: optionColors[(pos.optionSortOrder ?? 0) % optionColors.length],
                            borderWidth: 1,
                            borderColor: optionColors[(pos.optionSortOrder ?? 0) % optionColors.length] + '55',
                          }}
                        >
                          {pos.optionLabel}
                        </span>
                      ) : pos.marketType !== "binary" ? (
                        <span className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-muted text-muted-foreground border border-border">
                          Multi
                        </span>
                      ) : (
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                            pos.side === "yes"
                              ? "bg-green-500/15 text-green-500 border border-green-500/30"
                              : "bg-red-500/15 text-red-500 border border-red-500/30"
                          }`}
                        >
                          {pos.side}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase">Shares</p>
                        <p className="text-xs font-bold">{Number(pos.shares.toFixed(4))}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase">Avg Price</p>
                        <p className="text-xs font-bold">{pos.avgPrice}¢</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase">Current</p>
                        <p className={`text-xs font-bold ${pos.currentPrice > pos.avgPrice ? "neon-yes" : pos.currentPrice < pos.avgPrice ? "neon-no" : ""}`}>
                          {pos.currentPrice}¢
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase">Expires</p>
                        <p className="text-xs font-bold flex items-center gap-0.5">
                          {pos.status === "resolved" ? (
                            <><CheckCircle2 className="w-2.5 h-2.5 text-primary" /> Resolved</>
                          ) : pos.status === "ended" ? (
                            <><Clock className="w-2.5 h-2.5 text-yellow-500" /> Ended</>
                          ) : (
                            <><Clock className="w-2.5 h-2.5" /> {getTimeRemaining(pos.endDate)}</>
                          )}
                        </p>
                      </div>
                    </div>

                    <Sparkline avgPrice={pos.avgPrice} currentPrice={pos.currentPrice} seed={pos.id} />

                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">{pos.status === "active" ? "Est. P&L:" : "P&L:"}</span>
                          <span className={`text-xs font-bold flex items-center gap-0.5 ${pos.unrealizedPnl >= 0 ? "neon-yes" : "neon-no"}`}>
                            {pos.unrealizedPnl >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            ${Math.abs(pos.unrealizedPnl).toFixed(2)}
                          </span>
                          {pos.status === "active" && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  onClick={(e) => e.stopPropagation()}
                                  className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <Info className="w-3 h-3" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent side="top" align="start" className="w-56 p-3 text-xs space-y-1">
                                <p className="font-semibold text-foreground text-[11px]">Estimated Exit Value</p>
                                <p className="text-muted-foreground">This P&L accounts for price slippage from AMM impact and the exit fee. Actual payout may vary slightly.</p>
                              </PopoverContent>
                            </Popover>
                          )}
                          {pos.status === "resolved" && (pos.marketType === "multi" || pos.marketType === "range") && poolBreakdownMap[pos.marketId] && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  onClick={(e) => e.stopPropagation()}
                                  className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <Info className="w-3 h-3" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent side="top" align="start" className="w-64 p-3 text-xs space-y-2">
                                <p className="font-semibold text-foreground text-[11px]">Parimutuel Payout Breakdown</p>
                                {(() => {
                                  const bd = poolBreakdownMap[pos.marketId];
                                  const capital = pos.shares * pos.avgPrice / 100;
                                  const profit = pos.shares * bd.profitPerShare;
                                  const payout = payoutMap[pos.marketId] ?? 0;
                                  return (
                                    <div className="space-y-1.5">
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Total Pool</span>
                                        <span className="font-medium">${bd.totalPool.toFixed(2)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Winners' Capital</span>
                                        <span className="font-medium">${bd.winnersCapital.toFixed(2)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Losers' Pool (Profit)</span>
                                        <span className="font-medium">${bd.loserPool.toFixed(2)}</span>
                                      </div>
                                      <div className="border-t border-border pt-1.5 flex justify-between">
                                        <span className="text-muted-foreground">Winning Shares</span>
                                        <span className="font-medium">{bd.totalWinnerShares.toFixed(2)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Profit/Share</span>
                                        <span className="font-medium">${bd.profitPerShare.toFixed(4)}</span>
                                      </div>
                                      <div className="border-t border-border pt-1.5 space-y-1">
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Your Capital</span>
                                          <span className="font-medium">${capital.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Your Profit</span>
                                          <span className={`font-medium ${profit >= 0 ? "neon-yes" : "neon-no"}`}>${profit.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between font-semibold">
                                          <span className="text-foreground">Your Payout</span>
                                          <span className="text-foreground">${payout.toFixed(2)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => openPositionShare(pos, e)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold hover:bg-primary/20 transition-all active:scale-95"
                        >
                          <Share2 className="w-3 h-3" /> Share
                        </button>
                        {pos.status === "active" && (
                          <button
                            onClick={(e) => openSell(pos, e)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[10px] font-bold uppercase tracking-wider hover:bg-destructive/20 transition-all active:scale-95"
                          >
                            <LogOut className="w-3 h-3" />
                            Sell
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}

                {filtered.length === 0 && enriched.length > 0 && (
                  <div className="glass rounded-xl p-8 text-center">
                    <BarChart3 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No positions match this filter.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Open Orders Tab */}
        {activeTab === "orders" && (
          <div className="space-y-3">
            {limitOrdersLoading && (
              <div className="space-y-3 animate-pulse">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="glass rounded-xl p-4">
                    <div className="h-4 bg-muted/60 rounded-lg w-2/3 mb-2" />
                    <div className="h-3 bg-muted/40 rounded-lg w-1/3" />
                  </div>
                ))}
              </div>
            )}

            {!limitOrdersLoading && userLimitOrders.length === 0 && (
              <div className="glass rounded-xl p-8 text-center">
                <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-base font-bold mb-1">No Limit Orders</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Place a limit order on any market to buy at your target price.
                </p>
                <button
                  onClick={() => navigate("/")}
                  className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  Browse Markets
                </button>
              </div>
            )}

            {!limitOrdersLoading && userLimitOrders.map((order, i) => {
              const isPending = order.status === "pending";
              const isFilled = order.status === "filled";
              const isCancelled = order.status === "cancelled";
              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => navigate(`/market/${order.market_id}`)}
                  className="w-full glass rounded-xl p-4 text-left transition-all active:scale-[0.98] hover:bg-accent/30 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-sm font-semibold leading-tight flex-1 line-clamp-2">
                      {order.markets?.title || "Unknown Market"}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                          (order as any).market_options?.label
                            ? "bg-primary/15 text-primary border border-primary/30"
                            : order.side === "yes"
                              ? "bg-primary/15 text-primary border border-primary/30"
                              : "bg-destructive/15 text-destructive border border-destructive/30"
                        }`}
                      >
                        {(order as any).market_options?.label || order.side}
                      </span>
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                          isPending
                            ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                            : isFilled
                            ? "bg-primary/15 text-primary border border-primary/30"
                            : "bg-muted text-muted-foreground border border-border"
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div>
                      <p className="text-[9px] text-muted-foreground uppercase">Limit Price</p>
                      <p className="text-xs font-bold">{Math.round(Number(order.limit_price) * 100)}¢</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted-foreground uppercase">Amount</p>
                      <p className="text-xs font-bold">${Number(order.amount).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted-foreground uppercase">Shares</p>
                      <p className="text-xs font-bold">{Number(order.shares).toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(order.created_at).toLocaleDateString()}
                    </span>
                    {isPending && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (cancelLimitOrder.isPending) return;
                          cancelLimitOrder.mutate(order.id);
                          track("limit_order_cancelled", { marketId: order.market_id });
                        }}
                        disabled={cancelLimitOrder.isPending}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[10px] font-bold uppercase tracking-wider hover:bg-destructive/20 transition-all active:scale-95 disabled:opacity-50"
                      >
                        <Ban className="w-3 h-3" />
                        Cancel
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Copy Trades Tab */}
        {activeTab === "copy" && (
          <CopySubscriptions />
        )}

        {/* Drafts Tab */}
        {activeTab === "drafts" && (
          <div className="space-y-3">
            {draftsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : drafts.length === 0 ? (
              <div className="text-center py-12">
                <FileEdit className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No drafts yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Save a market as draft while creating it</p>
                <button
                  onClick={() => navigate("/create")}
                  className="mt-4 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
                >
                  Create Market
                </button>
              </div>
            ) : (
              drafts.map((draft) => (
                <motion.div
                  key={draft.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass rounded-xl p-4 flex items-start gap-3"
                >
                  {draft.image_url ? (
                    <img src={draft.image_url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0">
                      <FileEdit className="w-5 h-5 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold truncate">{draft.title || "Untitled Draft"}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">{draft.category}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium capitalize">{draft.market_type}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Updated {new Date(draft.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => navigate("/create", { state: { resumeDraftId: draft.id } })}
                      className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      title="Resume editing"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Delete this draft?")) deleteDraft(draft.id);
                      }}
                      className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                      title="Delete draft"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        )}

        {/* oSURE Protection Tab */}
        {activeTab === "insurance" && (
          <div className="space-y-3">
            {claimsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : insuranceClaims.length === 0 ? (
              <div className="text-center py-12">
                <Shield className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No protection claims yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Protect your predictions with oSURE Protection against losses</p>
              </div>
            ) : (
              insuranceClaims.map((claim: any) => (
                <motion.div
                  key={claim.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass rounded-xl p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0 mr-3">
                      <h4 className="text-sm font-semibold truncate">{claim.market_title}</h4>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(claim.created_at).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      claim.status === "claimed"
                        ? "bg-emerald-500/20 text-emerald-500"
                        : claim.status === "forfeited"
                        ? "bg-muted text-muted-foreground"
                        : "bg-amber-500/20 text-amber-500"
                    }`}>
                      {claim.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Coverage</p>
                      <p className="text-sm font-bold">{Math.round(claim.tier * 100)}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Premium</p>
                      <p className="text-sm font-bold text-destructive">-${Number(claim.premium_paid).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Claim</p>
                      <p className={`text-sm font-bold ${claim.status === "claimed" ? "text-emerald-500" : "text-muted-foreground"}`}>
                        {claim.status === "claimed" ? `+$${Number(claim.claim_amount).toFixed(2)}` : claim.status === "forfeited" ? "Forfeited" : "Pending"}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Sell Confirmation Modal */}
      {sellTarget && (
        <BottomSheet open={!!sellTarget} onClose={closeSell} className="p-5">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-4" />

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Close Position</h2>
            <button onClick={closeSell} className="w-8 h-8 rounded-full glass flex items-center justify-center">
              <X className="w-4 h-4" />
            </button>
          </div>

          <AnimatePresence mode="wait">
            {sellStep === "confirm" && (
              <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="text-xs text-muted-foreground mb-4 line-clamp-2">{sellTarget.marketTitle}</p>

                <div className="glass rounded-xl p-4 mb-4 space-y-2.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Side</span>
                    <span className={`font-bold uppercase ${sellTarget.optionLabel ? "text-primary" : sellTarget.side === "yes" ? "neon-yes" : "neon-no"}`}>
                      {sellTarget.optionLabel || sellTarget.side}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Shares</span>
                    <span className="font-semibold">{sellTarget.shares}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Avg Entry</span>
                    <span className="font-semibold">{sellTarget.avgPrice}¢</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Current Price</span>
                    <span className={`font-semibold ${sellTarget.currentPrice > sellTarget.avgPrice ? "neon-yes" : "neon-no"}`}>
                      {sellTarget.currentPrice}¢
                    </span>
                  </div>
                  <div className="border-t border-border pt-2 flex justify-between text-sm">
                    <span className="text-muted-foreground">Gross Proceeds</span>
                    <span className="font-semibold">${sellTarget.currentValue.toFixed(2)}</span>
                  </div>
                  {(() => {
                    const exitFeeTotal = sellTarget.currentValue * exitFeePercent / 100;
                    const bonusCover = Math.min(bonusBalance, exitFeeTotal);
                    const feeFromProceeds = exitFeeTotal - bonusCover;
                    const net = sellTarget.currentValue - feeFromProceeds;
                    return (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-destructive">Exit Fee ({exitFeePercent}%)</span>
                          <span className="font-semibold text-destructive">-${exitFeeTotal.toFixed(2)}</span>
                        </div>
                        {bonusCover > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-primary flex items-center gap-1">
                              <Gift className="w-3 h-3" /> Referral Bonus
                            </span>
                            <span className="font-semibold text-primary">+${bonusCover.toFixed(2)}</span>
                          </div>
                        )}
                        {feeFromProceeds > 0 && feeFromProceeds < exitFeeTotal && (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Remaining fee from proceeds</span>
                            <span className="font-medium text-destructive">-${feeFromProceeds.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Net Proceeds</span>
                          <span className="font-bold text-lg">${net.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Realized P&L</span>
                          <span className={`font-bold ${(net - sellTarget.invested) >= 0 ? "neon-yes" : "neon-no"}`}>
                            {(net - sellTarget.invested) >= 0 ? "+" : ""}${(net - sellTarget.invested).toFixed(2)}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 mb-5">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-[10px] text-destructive/70">
                    A {exitFeePercent}% exit fee is charged on early sells. This fee is returned to the market pool.{bonusBalance > 0 ? ` Your referral bonus ($${bonusBalance.toFixed(2)}) will be used first to offset the fee.` : ' Hold until resolution to avoid this fee.'}
                  </p>
                </div>

                <div className="flex gap-3">
                  <button onClick={closeSell} className="flex-1 glass py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95">
                    Cancel
                  </button>
                  <button
                    onClick={executeSell}
                    className="flex-1 bg-destructive text-destructive-foreground py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    Confirm Sell
                  </button>
                </div>
              </motion.div>
            )}

            {sellStep === "executing" && (
              <motion.div key="executing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-8">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <h3 className="text-lg font-bold mt-4 mb-1">Selling Position...</h3>
                <p className="text-sm text-muted-foreground">Processing your sell order</p>
              </motion.div>
            )}

            {sellStep === "success" && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-6">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 10 }}
                  className="w-16 h-16 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center mb-4"
                >
                  <CheckCircle2 className="w-8 h-8 text-primary" />
                </motion.div>
                <h3 className="text-lg font-bold mb-1">Position Closed!</h3>
                <p className="text-sm text-muted-foreground text-center mb-2">
                  Sold {sellTarget.shares} {sellTarget.side.toUpperCase()} shares
                </p>
                <p className={`text-xl font-bold mb-4 ${sellTarget.unrealizedPnl >= 0 ? "neon-yes" : "neon-no"}`}>
                  {sellTarget.unrealizedPnl >= 0 ? "+" : ""}${sellTarget.unrealizedPnl.toFixed(2)}
                </p>
                <div className="glass rounded-xl p-3 w-full space-y-1.5 mb-5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Gross Proceeds</span>
                    <span className="font-semibold">${sellTarget.currentValue.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-destructive">Exit Fee ({exitFeePercent}%)</span>
                    <span className="font-semibold text-destructive">-${(sellTarget.currentValue * exitFeePercent / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Net Proceeds</span>
                    <span className="font-bold">${(sellTarget.currentValue * (1 - exitFeePercent / 100)).toFixed(2)}</span>
                  </div>
                </div>
                <button onClick={closeSell} className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm transition-all active:scale-95">
                  Done
                </button>
              </motion.div>
            )}

            {sellStep === "error" && (
              <motion.div key="error" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-6">
                <div className="w-16 h-16 rounded-full bg-destructive/20 border border-destructive/40 flex items-center justify-center mb-4">
                  <AlertTriangle className="w-8 h-8 text-destructive" />
                </div>
                <h3 className="text-lg font-bold mb-1">Sale Failed</h3>
                <p className="text-sm text-muted-foreground text-center mb-5">Transaction failed. No shares were sold. Please try again.</p>
                <div className="flex gap-3 w-full">
                  <button onClick={closeSell} className="flex-1 glass py-3 rounded-xl font-semibold text-sm transition-all active:scale-95">Cancel</button>
                  <button onClick={() => setSellStep("confirm")} className="flex-1 bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm transition-all active:scale-95">Try Again</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </BottomSheet>
      )}

      <WinCelebrationModal
        open={winModal.open}
        onClose={() => setWinModal(prev => ({ ...prev, open: false }))}
        market={winModal.market}
        side={winModal.side}
        payout={winModal.payout}
        profit={winModal.profit}
      />

      {/* Off-screen share cards */}
      <PortfolioSummaryShareCard
        ref={portfolioCardRef}
        totalInvested={totalInvested}
        totalValue={totalValue}
        totalPnl={totalPnl}
        totalPnlPercent={totalPnlPercent}
        totalMaxPayout={totalMaxPayout}
        positionCount={enriched.length}
      />
      {filtered.map((pos) => (
        <PositionShareCard
          key={`share-${pos.id}`}
          ref={(el) => { positionCardRefs.current.set(pos.id, el); }}
          marketTitle={pos.marketTitle}
          side={pos.optionLabel || pos.side}
          shares={pos.shares}
          avgPrice={pos.avgPrice}
          currentPrice={pos.currentPrice}
          invested={pos.invested}
          currentValue={pos.currentValue}
          unrealizedPnl={pos.unrealizedPnl}
          pnlPercent={pos.pnlPercent}
          maxPayout={pos.maxPayout}
        />
      ))}

      <ShareModal
        open={shareModalOpen}
        onOpenChange={setShareModalOpen}
        title={shareTitle}
        marketUrl={shareUrl}
        captureRef={activeCaptureRef as React.RefObject<HTMLElement | null>}
      />

      <BottomNav />
    </div>
  );
};

export default Portfolio;
