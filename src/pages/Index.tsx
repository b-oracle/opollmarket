import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { mockMarkets } from "@/data/markets";
import { categoryIcons } from "@/data/markets";
import { TrendingUp, Users, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const formatVolume = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
};

const Index = () => {
  const navigate = useNavigate();
  const trending = mockMarkets.filter((m) => m.trending);
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

        {/* Trending */}
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          🔥 Trending Markets
        </h3>
        <div className="space-y-3">
          {trending.map((market, i) => {
            const yesPercent = Math.round(market.yesPrice * 100);
            return (
              <motion.div
                key={market.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.1 }}
                onClick={() => navigate(`/market/${market.id}`)}
                className="glass rounded-xl p-4 cursor-pointer hover:bg-accent/50 transition-colors active:scale-[0.98]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <span className="text-[10px] text-muted-foreground">
                      {categoryIcons[market.category]} {market.category}
                    </span>
                    <h4 className="text-sm font-semibold mt-1 leading-snug">{market.title}</h4>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                      <span>{formatVolume(market.volume)} vol</span>
                      <span>{market.participants.toLocaleString()} traders</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="neon-yes text-xl font-bold">{yesPercent}%</span>
                    <p className="text-[10px] text-muted-foreground">chance</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
      <BottomNav />
    </div>
  );
};

export default Index;
