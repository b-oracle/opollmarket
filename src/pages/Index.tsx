import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { mockMarkets } from "@/data/markets";
import { categoryIcons } from "@/data/markets";
import { TrendingUp, Users, Zap, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useActiveBoosts } from "@/hooks/useActiveBoosts";
import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import BoostCountdown from "@/components/BoostCountdown";
import BoostedCarousel from "@/components/BoostedCarousel";
import BoostMarketModal from "@/components/BoostMarketModal";
import { useCommentCount } from "@/hooks/useCommentCount";

const formatVolume = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
};

// Deterministic placeholder image based on market id
const getMarketImage = (id: string, category: string) => {
  const icons: Record<string, string> = {
    Crypto: "₿", "AI & Tech": "🤖", Science: "🚀", Economy: "📈",
    Entertainment: "🎵", Sports: "⚽", Politics: "🏛️", Other: "💡",
  };
  return icons[category] || "💡";
};

const Index = () => {
  const navigate = useNavigate();
  const { boostedMarketIds, boostDetails } = useActiveBoosts();
  const [filter, setFilter] = useState<"trending" | "boosted" | "all">("trending");
  const [boostModalMarket, setBoostModalMarket] = useState<{ id: string; title: string } | null>(null);
  
  const boostedMarkets = useMemo(() => {
    const boosted = mockMarkets.filter((m) => boostedMarketIds.has(m.id));
    if (boosted.length > 0) return boosted;
    // Fallback: show trending markets in carousel when no boosts active
    return mockMarkets.filter((m) => m.trending).slice(0, 5);
  }, [boostedMarketIds]);

  const filteredMarkets = useMemo(() => {
    let filtered: typeof mockMarkets;
    if (filter === "boosted") {
      filtered = mockMarkets.filter((m) => boostedMarketIds.has(m.id));
    } else if (filter === "trending") {
      filtered = mockMarkets.filter((m) => m.trending || boostedMarketIds.has(m.id));
    } else {
      filtered = [...mockMarkets];
    }
    return filtered.sort((a, b) => {
      const aBoost = boostedMarketIds.has(a.id) ? 1 : 0;
      const bBoost = boostedMarketIds.has(b.id) ? 1 : 0;
      return bBoost - aBoost;
    });
  }, [boostedMarketIds, filter]);
  
  const totalVolume = mockMarkets.reduce((s, m) => s + m.volume, 0);
  const totalTraders = mockMarkets.reduce((s, m) => s + m.participants, 0);

  return (
    <div className="min-h-dvh bg-background pb-20">
      <TopBar />
      <div className="max-w-lg mx-auto px-4 pt-20">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <h2 className="text-3xl font-bold leading-tight mb-2">
            Predict the <span className="text-primary">future</span>,
            <br />earn from it.
          </h2>
          <p className="text-sm text-muted-foreground">
            Swipe through markets. Place your bets. Win big.
          </p>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { icon: TrendingUp, label: "Volume", value: formatVolume(totalVolume) },
            { icon: Users, label: "Traders", value: totalTraders.toLocaleString() },
            { icon: Zap, label: "Markets", value: mockMarkets.length.toString() },
          ].map(({ icon: Icon, label, value }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.1 }}
              className="glass rounded-xl p-3 text-center"
            >
              <Icon className="w-4 h-4 text-primary mx-auto mb-1" />
              <p className="text-lg font-bold">{value}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </motion.div>
          ))}
        </div>

        {/* Start Feed CTA */}
        <motion.button
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
          onClick={() => navigate("/feed")}
          className="w-full btn-yes py-4 rounded-2xl font-bold text-base mb-8 transition-all active:scale-95"
        >
          🔥 Start Swiping
        </motion.button>

        {/* Boosted carousel */}
        <BoostedCarousel
          markets={boostedMarkets}
          boostDetails={boostDetails}
          navigate={navigate}
          formatVolume={formatVolume}
          getMarketImage={getMarketImage}
          onBoost={(market) => setBoostModalMarket({ id: market.id, title: market.title })}
        />

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
                filter === tab.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {filteredMarkets.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No boosted markets right now. Be the first to boost one!
            </div>
          )}
          {filteredMarkets.map((market, i) => {
            const yesPercent = Math.round(market.yesPrice * 100);
            const noPercent = 100 - yesPercent;
            const isMulti = market.marketType !== "binary";
            const topOption = isMulti && market.options
              ? market.options.reduce((a, b) => (a.price > b.price ? a : b))
              : null;
            const displayPercent = isMulti && topOption
              ? Math.round(topOption.price * 100)
              : yesPercent;
            const isBoosted = boostedMarketIds.has(market.id);
            const boost = boostDetails.get(market.id);
            return (
              <motion.div
                key={market.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.08 }}
                onClick={() => navigate(`/market/${market.id}`)}
                className={`glass rounded-xl p-3 cursor-pointer hover:bg-accent/30 transition-all active:scale-[0.98] flex items-center gap-3 ${
                  isBoosted ? 'ring-1 ring-primary/30 bg-primary/5' : ''
                }`}
              >
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-xl bg-secondary/80 border border-border shrink-0 relative overflow-hidden">
                  {market.imageUrl ? (
                    <img
                      src={market.imageUrl}
                      alt={market.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-2xl">{getMarketImage(market.id, market.category)}</span>
                    </div>
                  )}
                  {isBoosted && (
                    <div className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-bl-lg rounded-tr-xl bg-primary/90 flex items-center justify-center animate-pulse shadow-[0_0_8px_hsl(var(--primary)/0.6)]">
                      <Zap className="w-3 h-3 text-primary-foreground" fill="currentColor" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Top row: category + volume */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1.5 py-0.5 rounded bg-muted/80 border border-border">
                      {market.category}
                    </span>
                    {isBoosted && boost && (
                      <BoostCountdown endsAt={boost.ends_at} tier={boost.tier} compact />
                    )}
                    {!isBoosted && market.trending && (
                      <span className="text-[10px] font-bold text-primary flex items-center gap-0.5">
                        <Zap className="w-3 h-3" /> Trending
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground font-mono ml-auto">
                      {formatVolume(market.volume)} Vol
                    </span>
                  </div>

                  {/* Title */}
                  <h4 className="text-sm font-bold leading-snug truncate mb-1.5">{market.title}</h4>

                  {/* Progress bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full overflow-hidden flex bg-muted">
                      {isMulti && market.options ? (
                        market.options.map((opt, oi) => (
                          <div
                            key={opt.id}
                            className="h-full transition-all"
                            style={{
                              width: `${opt.price * 100}%`,
                              backgroundColor: [
                                "hsl(var(--neon-yes))",
                                "hsl(var(--neon-no))",
                                "hsl(var(--primary))",
                                "hsl(45, 93%, 58%)",
                                "hsl(280, 70%, 60%)",
                                "hsl(var(--muted-foreground))",
                              ][oi % 6],
                            }}
                          />
                        ))
                      ) : (
                        <>
                          <div
                            className="h-full rounded-l-full transition-all"
                            style={{
                              width: `${yesPercent}%`,
                              backgroundColor: "hsl(var(--neon-yes))",
                            }}
                          />
                          <div
                            className="h-full rounded-r-full transition-all"
                            style={{
                              width: `${noPercent}%`,
                              backgroundColor: "hsl(var(--neon-no))",
                            }}
                          />
                        </>
                      )}
                    </div>
                    <span className="text-sm font-bold neon-yes shrink-0">{displayPercent}%</span>
                  </div>
                </div>

                {/* Boost button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setBoostModalMarket({ id: market.id, title: market.title });
                  }}
                  className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
                    isBoosted
                      ? 'bg-primary/20 text-primary'
                      : 'glass hover:bg-primary/10 text-muted-foreground hover:text-primary'
                  }`}
                  title="Boost this market"
                >
                  <Zap className="w-4 h-4" />
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>
      <BoostMarketModal
        open={!!boostModalMarket}
        onClose={() => setBoostModalMarket(null)}
        marketId={boostModalMarket?.id || ""}
        marketTitle={boostModalMarket?.title || ""}
      />
      <BottomNav />
    </div>
  );
};

export default Index;
