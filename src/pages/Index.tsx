import { Loader2, Clock, CheckCircle2, XCircle } from "lucide-react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import PullToRefreshIndicator from "@/components/PullToRefreshIndicator";
import { toast } from "sonner";
import SEOHead from "@/components/SEOHead";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useMarkets } from "@/hooks/useMarkets";
import { TrendingUp, Users, Zap, MessageCircle, Search, X, Heart, Flame, Crown } from "lucide-react";
import { getBoostTierConfig } from "@/lib/boostTiers";
import CategoryIcon from "@/components/CategoryIcon";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useActiveBoosts } from "@/hooks/useActiveBoosts";
import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import BoostCountdown from "@/components/BoostCountdown";
import BoostedCarousel from "@/components/BoostedCarousel";
import CategoryCarousel from "@/components/CategoryCarousel";
import LivePriceBadge from "@/components/LivePriceBadge";
import { Gem, ArrowLeftRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import BoostMarketModal from "@/components/BoostMarketModal";
import { useBatchCounts } from "@/hooks/useBatchCounts";
import useAnalytics from "@/hooks/useAnalytics";
import { useQuery } from "@tanstack/react-query";
import { createStatelessReadClient } from "@/lib/statelessSupabase";


const formatVolume = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
};

// getMarketImage replaced by CategoryIcon component

const CommentBadge = ({ count }: { count: number }) => {
  if (count === 0) return null;
  return (
    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
      <MessageCircle className="w-3 h-3" />
      {count}
    </span>
  );
};

const LikeBadge = ({ count }: { count: number }) => {
  if (count === 0) return null;
  return (
    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
      <Heart className="w-3 h-3" />
      {count}
    </span>
  );
};

const Index = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: allMarkets = [], isLoading, isError, refetch } = useMarkets();
  const { boostedMarketIds, boostDetails, loading: boostsLoading } = useActiveBoosts();
  const { isFeatureEnabled } = useFeatureToggles();
  const [filter, setFilter] = useState<"trending" | "boosted" | "new" | "all" | "live">("all");
  const [boostModalMarket, setBoostModalMarket] = useState<{ id: string; title: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;
  const { track } = useAnalytics();
  const { user, loading: authLoading } = useAuth();

  // Category toggle map: category name → feature_key
  const categoryToggleMap: Record<string, string> = {
    "Twitter/X": "category_twitter_x",
  };

  // Filter out markets whose category is toggled off
  const markets = useMemo(() => {
    return allMarkets.filter((m) => {
      const toggleKey = categoryToggleMap[m.category];
      if (toggleKey && !isFeatureEnabled(toggleKey)) return false;
      return true;
    });
  }, [allMarkets, isFeatureEnabled]);

  // Batch fetch all comment + like counts in 2 queries instead of 2×N
  const marketIds = useMemo(() => markets.map(m => m.id), [markets]);
  const { data: batchCounts } = useBatchCounts(marketIds);

  useEffect(() => { track("page_view", { page: "home" }); }, []);

  // Pull-to-refresh
  const scrollRef = useRef<HTMLDivElement>(null);
  const { pulling, pullDistance, refreshing, pullProgress, spinControls, handlers: pullHandlers } = usePullToRefresh({
    onRefresh: async () => { await refetch(); },
    scrollRef,
  });
  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  // Capture referral param and redirect to signup (only if not already logged in)
  useEffect(() => {
    if (authLoading) return; // Wait for auth to resolve before deciding
    const ref = searchParams.get("ref");
    if (ref && !user) {
      localStorage.setItem("referral_id", ref);
      navigate(`/auth?ref=${encodeURIComponent(ref)}`, { replace: true });
    }
  }, [searchParams, navigate, user, authLoading]);

  const boostedMarkets = useMemo(() => {
    if (boostsLoading) return []; // wait for boosts to load before committing
    const boosted = markets.filter((m) => boostedMarketIds.has(m.id));
    if (boosted.length > 0) return boosted;
    return markets.filter((m) => m.trending).slice(0, 5);
  }, [markets, boostedMarketIds, boostsLoading]);

  const commodityMarkets = useMemo(() =>
    markets.filter((m) => m.category === "Commodities").slice(0, 8),
    [markets]
  );

  const forexMarkets = useMemo(() =>
    markets.filter((m) => m.category === "Forex").slice(0, 8),
    [markets]
  );

  const categories = useMemo(() => {
    const cats = new Set(markets.map((m) => m.category));
    return ["All", ...Array.from(cats).sort()];
  }, [markets]);

  const filteredMarkets = useMemo(() => {
    let filtered = [...markets];
    if (filter === "boosted") {
      filtered = markets.filter((m) => boostedMarketIds.has(m.id));
    } else if (filter === "trending") {
      filtered = markets.filter((m) => m.trending || boostedMarketIds.has(m.id));
    } else if (filter === "new") {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      filtered = markets.filter((m) => m.createdAt >= oneDayAgo);
    } else if (filter === "live") {
      filtered = markets.filter((m) => m.autoResolve && ((m.sportType && m.sportMatchId) || m.autoResolveAsset || (m.twitterResourceId && m.twitterMetricType)));
    }
    if (categoryFilter !== "All") {
      filtered = filtered.filter((m) => m.category === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((m) => m.title.toLowerCase().includes(q) || m.category.toLowerCase().includes(q));
    }
    if (filter === "new") {
      return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    // "all" tab: boosted first, then trending, then new (by date)
    return filtered.sort((a, b) => {
      const aBoost = boostedMarketIds.has(a.id) ? 2 : 0;
      const bBoost = boostedMarketIds.has(b.id) ? 2 : 0;
      const aTrend = a.trending ? 1 : 0;
      const bTrend = b.trending ? 1 : 0;
      const scoreDiff = (bBoost + bTrend) - (aBoost + aTrend);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [markets, boostedMarketIds, filter, searchQuery, categoryFilter]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchQuery, categoryFilter]);

  const totalPages = Math.ceil(filteredMarkets.length / ITEMS_PER_PAGE);
  const paginatedMarkets = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredMarkets.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredMarkets, currentPage]);

  const { data: platformStats } = useQuery({
    queryKey: ["platform-stats"],
    queryFn: async () => {
      const supabase = createStatelessReadClient();
      const [marketsRes, usersRes, volRes] = await Promise.all([
        supabase.from("markets").select("id", { count: "exact", head: true }),
        supabase.rpc("get_platform_user_count" as any),
        supabase.rpc("get_platform_volume"),
      ]);

      if (marketsRes.error) throw marketsRes.error;
      if (usersRes.error) throw usersRes.error;
      if (volRes.error) throw volRes.error;

      const volRow = volRes.data?.[0] as { prediction_volume: number; qt_volume: number } | undefined;
      const totalVol = Number(volRow?.prediction_volume ?? 0) + Number(volRow?.qt_volume ?? 0);
      return {
        totalVolume: totalVol,
        totalUsers: (usersRes.data as number) ?? 0,
        totalMarkets: marketsRes.count ?? 0,
        lastUpdated: new Date(),
      };
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const totalVolume = platformStats?.totalVolume ?? 0;
  const totalUsers = platformStats?.totalUsers ?? 0;
  const totalMarkets = platformStats?.totalMarkets ?? 0;
  const statsLastUpdated = platformStats?.lastUpdated;
  const liveCount = useMemo(() => markets.filter((m) => m.autoResolve && ((m.sportType && m.sportMatchId) || m.autoResolveAsset || (m.twitterResourceId && m.twitterMetricType))).length, [markets]);
  const marketErrorMessage = "Unable to load markets right now.";

  // No blocking loader — render page immediately, show inline spinner in content area

  return (
    <div
      className="min-h-dvh bg-background"
      style={{ paddingBottom: 'calc(1rem + var(--content-bottom))', touchAction: 'pan-y', overscrollBehavior: 'none' }}
      onTouchStart={pullHandlers.onTouchStart}
      onTouchMove={pullHandlers.onTouchMove}
      onTouchEnd={pullHandlers.onTouchEnd}
    >
      <SEOHead description="Predict the future, earn from it. Trade on real-world events across Web, Telegram & WhatsApp with OPoll Market." path="/" />
      <TopBar />

      <PullToRefreshIndicator pulling={pulling} refreshing={refreshing} pullDistance={pullDistance} pullProgress={pullProgress} spinControls={spinControls} />

      <div className="max-w-lg md:max-w-4xl xl:max-w-6xl mx-auto px-3 sm:px-4" style={{ paddingTop: 'calc(1.5rem + var(--content-top))' }}>
        {/* Mobile Hero */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-8 md:hidden">
          <h2 className="text-2xl sm:text-3xl font-bold leading-tight mb-2">
            Predict the <span className="text-primary">future</span>, earn from it.
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">Swipe through markets. Predict. Win big.</p>
        </motion.div>

        {/* Desktop Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="hidden md:block mb-10"
        >
          <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-accent/30 p-8 lg:p-10">
            {/* Animated background elements */}
            <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-primary/5 blur-3xl" />
            <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-primary/8 blur-2xl" />
            <motion.div
              animate={{ y: [0, -20, 0], x: [0, 10, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-12 right-[20%] w-3 h-3 rounded-full bg-primary/20"
            />
            <motion.div
              animate={{ y: [0, 15, 0], x: [0, -8, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              className="absolute top-24 right-[35%] w-2 h-2 rounded-full bg-primary/30"
            />
            <motion.div
              animate={{ y: [0, -12, 0], x: [0, 15, 0] }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
              className="absolute bottom-20 right-[25%] w-4 h-4 rounded-full bg-primary/10"
            />
            <motion.div
              animate={{ y: [0, 18, 0], rotate: [0, 180, 360] }}
              transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              className="absolute top-8 left-[40%] w-2.5 h-2.5 rounded-sm bg-primary/15 rotate-45"
            />
            <motion.div
              animate={{ y: [0, -15, 0], x: [0, -12, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 3 }}
              className="absolute bottom-12 left-[15%] w-2 h-2 rounded-full bg-primary/25"
            />
            <motion.div
              animate={{ scale: [1, 1.3, 1], opacity: [0.1, 0.25, 0.1] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
              className="absolute top-16 left-[60%] w-20 h-20 rounded-full bg-primary/5 blur-xl"
            />
            <motion.div
              animate={{ y: [0, 10, 0], rotate: [0, -90, 0] }}
              transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 4 }}
              className="absolute bottom-28 right-[45%] w-1.5 h-1.5 rounded-full bg-primary/20"
            />
            <div className="relative flex items-center justify-between gap-8">
              <div className="flex-1 max-w-xl">
                <h1 className="text-4xl lg:text-5xl font-bold leading-tight mb-3">
                  Predict the <span className="text-primary">future</span>,<br />earn from it.
                </h1>
                <p className="text-base text-muted-foreground mb-6 max-w-md">
                  Trade on real-world events across crypto, sports, politics & more. Join thousands of users making predictions that pay.
                </p>
                <div className="flex items-center gap-3">
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => navigate("/feed")}
                    className="btn-yes px-8 py-3 rounded-xl font-bold text-sm transition-all"
                  >
                    🔥 Explore Markets
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => navigate("/create")}
                    className="px-8 py-3 rounded-xl font-bold text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
                  >
                    + Create Market
                  </motion.button>
                </div>
              </div>
              <div className="hidden lg:grid grid-cols-3 gap-3 shrink-0">
                {[
                  { icon: TrendingUp, label: "Volume", value: formatVolume(totalVolume) },
                  { icon: Users, label: "Users", value: totalUsers.toLocaleString() },
                  { icon: Zap, label: "Markets", value: totalMarkets.toString() },
                ].map(({ icon: Icon, label, value }, i) => (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                    className="glass rounded-xl p-4 text-center min-w-[110px] border border-border"
                  >
                    <Icon className="w-5 h-5 text-primary mx-auto mb-1.5" />
                    <p className="text-xl font-bold">{value}</p>
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                  </motion.div>
                ))}
                {statsLastUpdated && (
                  <p className="col-span-3 text-[9px] text-muted-foreground/50 text-center mt-1">
                    Updated {statsLastUpdated.toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stats — mobile + tablet only (desktop stats are in hero) */}
        <div className="grid grid-cols-3 gap-3 mb-8 lg:hidden">
          {[
            { icon: TrendingUp, label: "Volume", value: formatVolume(totalVolume) },
            { icon: Users, label: "Users", value: totalUsers.toLocaleString() },
            { icon: Zap, label: "Markets", value: totalMarkets.toString() },
          ].map(({ icon: Icon, label, value }, i) => (
            <motion.div key={label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.1 }} className="glass rounded-xl p-3 text-center">
              <Icon className="w-4 h-4 text-primary mx-auto mb-1" />
              <p className="text-lg font-bold">{value}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </motion.div>
          ))}
          {statsLastUpdated && (
            <p className="col-span-3 text-[9px] text-muted-foreground/50 text-center -mt-2">
              Updated {statsLastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>

        <motion.button
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
          onClick={() => navigate("/feed")}
          className="w-full btn-yes py-4 rounded-2xl font-bold text-base mb-8 transition-all active:scale-95 md:hidden"
        >
          🔥 Start Swiping
        </motion.button>

        <BoostedCarousel
          markets={boostedMarkets}
          boostDetails={boostDetails}
          navigate={navigate}
          formatVolume={formatVolume}
          CategoryIcon={CategoryIcon}
          onBoost={(market) => setBoostModalMarket({ id: market.id, title: market.title })}
        />

        <CategoryCarousel
          title="Commodities"
          icon={<Gem className="w-3.5 h-3.5 text-amber-500" />}
          markets={commodityMarkets}
          formatVolume={formatVolume}
          onViewAll={() => { setCategoryFilter("Commodities"); setFilter("all"); }}
        />

        <CategoryCarousel
          title="Forex"
          icon={<ArrowLeftRight className="w-3.5 h-3.5 text-emerald-500" />}
          markets={forexMarkets}
          formatVolume={formatVolume}
          onViewAll={() => { setCategoryFilter("Forex"); setFilter("all"); }}
        />


        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search markets..."
            className="w-full bg-muted/50 border border-border rounded-xl pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category filter */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-4">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                categoryFilter === cat ? "bg-primary text-primary-foreground" : "glass text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 p-1 rounded-xl bg-muted/50 mb-4">
          {([
            { key: "all" as const, label: "All" },
            { key: "live" as const, label: "🔴 Live", count: liveCount },
            { key: "new" as const, label: "New", icon: true },
            { key: "boosted" as const, label: "⚡ Boosted" },
            { key: "trending" as const, label: "🔥 Trending" },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 ${
                filter === tab.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {'icon' in tab && tab.icon && <Clock className="w-3.5 h-3.5" />}
              {tab.label}
              {'count' in tab && (tab as any).count > 0 && (
                <span className="ml-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center animate-pulse">
                  {(tab as any).count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="space-y-3 md:grid md:grid-cols-2 xl:grid-cols-3 md:gap-4 md:space-y-0">
          {isLoading && (
            <>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="glass rounded-2xl p-4 animate-pulse">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-muted/60 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted/60 rounded-lg w-3/4" />
                      <div className="h-3 bg-muted/40 rounded-lg w-1/2" />
                    </div>
                  </div>
                  <div className="flex gap-2 mb-3">
                    <div className="flex-1 h-9 bg-muted/50 rounded-xl" />
                    <div className="flex-1 h-9 bg-muted/50 rounded-xl" />
                  </div>
                  <div className="flex justify-between">
                    <div className="h-3 bg-muted/40 rounded w-16" />
                    <div className="h-3 bg-muted/40 rounded w-20" />
                  </div>
                </div>
              ))}
            </>
          )}
          {!isLoading && isError && markets.length === 0 && (
            <div className="md:col-span-2 xl:col-span-3 glass rounded-2xl p-5 border border-border text-center">
              <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-destructive" />
              </div>
              <p className="text-sm text-foreground font-semibold mb-1">{marketErrorMessage}</p>
              <p className="text-xs text-muted-foreground mb-4">Check your connection and try again.</p>
              <button
                onClick={() => refetch()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
              >
                Retry loading markets
              </button>
            </div>
          )}
          {!isLoading && !isError && filteredMarkets.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">No markets found.</div>
          )}
          {paginatedMarkets.map((market, i) => {
            const yesPercent = Math.round(market.yesPrice * 100);
            const noPercent = 100 - yesPercent;
            const isMulti = market.marketType !== "binary";
            const topOption = isMulti && market.options
              ? market.options.reduce((a, b) => (a.price > b.price ? a : b))
              : null;
            const displayPercent = isMulti && topOption ? Math.round(topOption.price * 100) : yesPercent;
            const isBoosted = boostedMarketIds.has(market.id);
            const boost = boostDetails.get(market.id);
            return (
              <motion.div
                key={market.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.08 }}
                whileHover={{ y: -4, boxShadow: "0 8px 30px -8px hsl(var(--primary) / 0.15)" }}
                onClick={() => navigate(`/market/${market.id}`)}
                className={`relative glass rounded-xl p-3 cursor-pointer transition-all active:scale-[0.98] flex items-center gap-3 group md:p-4 md:rounded-2xl hover:border-primary/20 hover:bg-accent/20 ${market.status === 'ended' ? 'opacity-75' : ''}`}
                style={isBoosted && boost ? {
                  boxShadow: getBoostTierConfig(boost.tier).glowShadow,
                  border: `1px solid ${getBoostTierConfig(boost.tier).ringClass}`,
                  background: getBoostTierConfig(boost.tier).bgTint,
                } : undefined}

              >
                {market.participants === 0 && user?.id === market.creatorAddress && !market.isCryptoRound && (
                  <div className="absolute inset-0 z-20 rounded-xl md:rounded-2xl bg-background/80 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 p-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                      <Zap className="w-3.5 h-3.5" /> First Prediction Needed
                    </span>
                    <p className="text-[11px] text-muted-foreground text-center max-w-[200px]">
                      Place your first prediction to make this market visible to everyone.
                    </p>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/market/${market.id}`); }}
                      className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all active:scale-95"
                    >
                      Predict Now →
                    </button>
                  </div>
                )}
                {(market.status === 'ended' || market.status === 'resolved') && (
                  <div className="absolute inset-0 z-10 rounded-xl md:rounded-2xl bg-background/60 backdrop-blur-[2px] flex items-center justify-center">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wider ${
                      market.status === 'resolved'
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-muted border-border text-muted-foreground'
                    }`}>
                      {market.status === 'resolved' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className={`w-3.5 h-3.5 ${market.isCryptoRound ? 'animate-spin' : ''}`} />}
                      {market.status === 'resolved' ? 'Resolution Completed' : (market.isCryptoRound ? 'Resolving…' : 'Awaiting Resolution')}
                    </span>
                  </div>
                )}
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-xl bg-secondary/80 border border-border shrink-0 relative overflow-hidden transition-transform duration-300 group-hover:scale-105 group-hover:shadow-md">
                  {market.imageUrl ? (
                    <img src={market.imageUrl} alt={market.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <CategoryIcon category={market.category} className="w-6 h-6 md:w-7 md:h-7 text-muted-foreground transition-transform duration-300 group-hover:scale-110" />
                    </div>
                  )}
                  {isBoosted && boost && (() => {
                    const tc = getBoostTierConfig(boost.tier);
                    const TierIcon = tc.icon;
                    return (
                      <div className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-bl-lg rounded-tr-xl flex items-center justify-center animate-pulse"
                        style={{ backgroundColor: tc.color, boxShadow: `0 0 8px ${tc.ringClass}` }}>
                        <TierIcon className="w-3 h-3 text-primary-foreground" fill="currentColor" />
                      </div>
                    );
                  })()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1.5 py-0.5 rounded bg-muted/80 border border-border">{market.category}</span>
                    {isBoosted && boost && user?.id === market.creatorAddress && <BoostCountdown endsAt={boost.ends_at} tier={boost.tier} compact />}
                    {!isBoosted && market.trending && (
                      <span className="text-[10px] font-bold text-primary flex items-center gap-0.5"><Zap className="w-3 h-3" /> Trending</span>
                    )}
                    <CommentBadge count={batchCounts?.comments.get(market.id) || 0} />
                    <LikeBadge count={batchCounts?.likes.get(market.id) || 0} />
                    <span className="text-[10px] text-muted-foreground font-mono ml-auto">{formatVolume(market.volume)} Vol</span>
                  </div>
                  <h4 className="text-sm font-bold leading-snug truncate mb-1.5 group-hover:text-primary transition-colors">{market.title}</h4>
                  {market.autoResolve && market.autoResolveAsset && !market.sportType && (
                    <div className="mb-1.5">
                      <LivePriceBadge
                        asset={market.autoResolveAsset}
                        targetPrice={market.autoResolveTargetPrice}
                        operator={market.autoResolveOperator}
                        marketId={market.id}
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full overflow-hidden flex bg-muted">
                      {isMulti && market.options ? (
                        market.options.map((opt, oi) => (
                          <div key={opt.id} className="h-full transition-all" style={{
                            width: `${opt.price * 100}%`,
                            backgroundColor: ["hsl(var(--neon-yes))","hsl(var(--neon-no))","hsl(var(--primary))","hsl(45, 93%, 58%)","hsl(280, 70%, 60%)","hsl(var(--muted-foreground))"][oi % 6],
                          }} />
                        ))
                      ) : (
                        <>
                          <div className="h-full rounded-l-full transition-all" style={{ width: `${yesPercent}%`, backgroundColor: "hsl(var(--neon-yes))" }} />
                          <div className="h-full rounded-r-full transition-all" style={{ width: `${noPercent}%`, backgroundColor: "hsl(var(--neon-no))" }} />
                        </>
                      )}
                    </div>
                    <span className="text-sm font-bold neon-yes shrink-0">{displayPercent}%</span>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); if (market.status === "ended" || market.status === "resolved" || market.status === "cancelled") { toast.info("This market has ended and is no longer available for boosting"); return; } setBoostModalMarket({ id: market.id, title: market.title }); }}
                  className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90 md:opacity-0 md:group-hover:opacity-100 ${
                    isBoosted ? 'bg-primary/20 text-primary md:opacity-100' : 'glass hover:bg-primary/10 text-muted-foreground hover:text-primary'
                  }`}
                  title="Boost this market"
                >
                  <Zap className="w-4 h-4 transition-transform group-hover:scale-110" />
                </button>
              </motion.div>
            );
          })}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 py-6">
            <button
              onClick={() => { setCurrentPage((p) => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted text-muted-foreground disabled:opacity-40 hover:bg-accent transition-colors"
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .reduce<(number | string)[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                acc.push(p);
                return acc;
              }, [])
              .map((item, idx) =>
                typeof item === "string" ? (
                  <span key={`ellipsis-${idx}`} className="text-xs text-muted-foreground px-1">…</span>
                ) : (
                  <button
                    key={item}
                    onClick={() => { setCurrentPage(item); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
                      currentPage === item ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {item}
                  </button>
                )
              )}
            <button
              onClick={() => { setCurrentPage((p) => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted text-muted-foreground disabled:opacity-40 hover:bg-accent transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
      <BoostMarketModal open={!!boostModalMarket} onClose={() => setBoostModalMarket(null)} marketId={boostModalMarket?.id || ""} marketTitle={boostModalMarket?.title || ""} />

      {/* Always-visible legal links (crawlable by Google verification) */}
      <nav
        aria-label="Legal"
        className="lg:hidden border-t border-border bg-background/95 px-4 py-4 pb-24 mt-4"
      >
        <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
          <li>
            <a href="/privacy" className="hover:text-primary transition-colors underline-offset-2 hover:underline">
              Privacy Policy
            </a>
          </li>
          <li aria-hidden="true">·</li>
          <li>
            <a href="/terms" className="hover:text-primary transition-colors underline-offset-2 hover:underline">
              Terms &amp; Conditions
            </a>
          </li>
          <li aria-hidden="true">·</li>
          <li>
            <a href="/disclaimer" className="hover:text-primary transition-colors underline-offset-2 hover:underline">
              Disclaimer
            </a>
          </li>
          <li aria-hidden="true">·</li>
          <li>
            <a href="/data-use" className="hover:text-primary transition-colors underline-offset-2 hover:underline">
              How We Use Your Data
            </a>
          </li>
        </ul>
        <p className="text-center text-[10px] text-muted-foreground mt-3">
          © {new Date().getFullYear()} OPOLL. All rights reserved.
        </p>
      </nav>

      <BottomNav />
    </div>
  );
};

export default Index;
