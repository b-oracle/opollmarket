import { Loader2, Clock } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useMarkets } from "@/hooks/useMarkets";
import { TrendingUp, Users, Zap, MessageCircle, Search, X } from "lucide-react";
import CategoryIcon from "@/components/CategoryIcon";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useActiveBoosts } from "@/hooks/useActiveBoosts";
import { useMemo, useState, useEffect } from "react";
import BoostCountdown from "@/components/BoostCountdown";
import BoostedCarousel from "@/components/BoostedCarousel";
import BoostMarketModal from "@/components/BoostMarketModal";
import { useCommentCount } from "@/hooks/useCommentCount";
import useAnalytics from "@/hooks/useAnalytics";


const formatVolume = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
};

// getMarketImage replaced by CategoryIcon component

const CommentBadge = ({ marketId }: { marketId: string }) => {
  const count = useCommentCount(marketId);
  if (count === 0) return null;
  return (
    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
      <MessageCircle className="w-3 h-3" />
      {count}
    </span>
  );
};

const Index = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: markets = [], isLoading, isError } = useMarkets();
  const { boostedMarketIds, boostDetails } = useActiveBoosts();
  const [filter, setFilter] = useState<"trending" | "boosted" | "all">("trending");
  const [boostModalMarket, setBoostModalMarket] = useState<{ id: string; title: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { track } = useAnalytics();

  useEffect(() => { track("page_view", { page: "home" }); }, []);
  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  // Capture referral param on landing
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      localStorage.setItem("referral_id", ref);
    }
  }, [searchParams]);

  const boostedMarkets = useMemo(() => {
    const boosted = markets.filter((m) => boostedMarketIds.has(m.id));
    if (boosted.length > 0) return boosted;
    return markets.filter((m) => m.trending).slice(0, 5);
  }, [markets, boostedMarketIds]);

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
    }
    if (categoryFilter !== "All") {
      filtered = filtered.filter((m) => m.category === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((m) => m.title.toLowerCase().includes(q) || m.category.toLowerCase().includes(q));
    }
    return filtered.sort((a, b) => {
      const aBoost = boostedMarketIds.has(a.id) ? 1 : 0;
      const bBoost = boostedMarketIds.has(b.id) ? 1 : 0;
      return bBoost - aBoost;
    });
  }, [markets, boostedMarketIds, filter, searchQuery, categoryFilter]);

  const totalVolume = markets.reduce((s, m) => s + m.volume, 0);
  const totalTraders = markets.reduce((s, m) => s + m.participants, 0);

  // No blocking loader — render page immediately, show inline spinner in content area

  return (
    <div className="min-h-dvh bg-background" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
      <SEOHead title="Home" description="Swipe through markets. Predict. Win big. Trade on real-world events with OPOLL." path="/" />
      <TopBar />
      <div className="max-w-lg md:max-w-4xl xl:max-w-6xl mx-auto px-3 sm:px-4" style={{ paddingTop: 'calc(5rem + env(safe-area-inset-top))' }}>
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold leading-tight mb-2">
            Predict the <span className="text-primary">future</span>,<br />earn from it.
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">Swipe through markets. Predict. Win big.</p>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { icon: TrendingUp, label: "Volume", value: formatVolume(totalVolume) },
            { icon: Users, label: "Traders", value: totalTraders.toLocaleString() },
            { icon: Zap, label: "Markets", value: markets.length.toString() },
          ].map(({ icon: Icon, label, value }, i) => (
            <motion.div key={label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.1 }} className="glass rounded-xl p-3 text-center">
              <Icon className="w-4 h-4 text-primary mx-auto mb-1" />
              <p className="text-lg font-bold">{value}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </motion.div>
          ))}
        </div>

        <motion.button
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
          onClick={() => navigate("/feed")}
          className="w-full btn-yes py-4 rounded-2xl font-bold text-base mb-8 transition-all active:scale-95"
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

        {/* Search */}
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
            { key: "trending" as const, label: "🔥 Trending" },
            { key: "boosted" as const, label: "⚡ Boosted" },
            { key: "all" as const, label: "All" },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                filter === tab.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
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
          {!isLoading && filteredMarkets.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">No markets found.</div>
          )}
          {filteredMarkets.map((market, i) => {
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
                className={`glass rounded-xl p-3 cursor-pointer transition-all active:scale-[0.98] flex items-center gap-3 group md:p-4 md:rounded-2xl hover:border-primary/20 hover:bg-accent/20 ${isBoosted ? 'ring-1 ring-primary/30 bg-primary/5' : ''}`}
              >
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-xl bg-secondary/80 border border-border shrink-0 relative overflow-hidden transition-transform duration-300 group-hover:scale-105 group-hover:shadow-md">
                  {market.imageUrl ? (
                    <img src={market.imageUrl} alt={market.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <CategoryIcon category={market.category} className="w-6 h-6 md:w-7 md:h-7 text-muted-foreground transition-transform duration-300 group-hover:scale-110" />
                    </div>
                  )}
                  {isBoosted && (
                    <div className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-bl-lg rounded-tr-xl bg-primary/90 flex items-center justify-center animate-pulse shadow-[0_0_8px_hsl(var(--primary)/0.6)]">
                      <Zap className="w-3 h-3 text-primary-foreground" fill="currentColor" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1.5 py-0.5 rounded bg-muted/80 border border-border">{market.category}</span>
                    {isBoosted && boost && <BoostCountdown endsAt={boost.ends_at} tier={boost.tier} compact />}
                    {!isBoosted && market.trending && (
                      <span className="text-[10px] font-bold text-primary flex items-center gap-0.5"><Zap className="w-3 h-3" /> Trending</span>
                    )}
                    <CommentBadge marketId={market.id} />
                    <span className="text-[10px] text-muted-foreground font-mono ml-auto">{formatVolume(market.volume)} Vol</span>
                  </div>
                  <h4 className="text-sm font-bold leading-snug truncate mb-1.5 group-hover:text-primary transition-colors">{market.title}</h4>
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
                  onClick={(e) => { e.stopPropagation(); setBoostModalMarket({ id: market.id, title: market.title }); }}
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
      </div>
      <BoostMarketModal open={!!boostModalMarket} onClose={() => setBoostModalMarket(null)} marketId={boostModalMarket?.id || ""} marketTitle={boostModalMarket?.title || ""} />
      
      <BottomNav />
    </div>
  );
};

export default Index;
