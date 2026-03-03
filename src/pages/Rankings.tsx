import { useState } from "react";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { mockMarkets } from "@/data/markets";
import { Trophy, TrendingUp, TrendingDown, Medal, Crown, Award } from "lucide-react";
import { motion } from "framer-motion";

const formatVolume = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
};

interface Trader {
  rank: number;
  name: string;
  address: string;
  avatar: string;
  winRate: number;
  pnl: number;
  trades: number;
  volume: number;
  streak: number;
}

const mockTraders: Trader[] = [
  { rank: 1, name: "CryptoWhale", address: "0x1a2b...3c4d", avatar: "🐋", winRate: 87.5, pnl: 12450, trades: 156, volume: 89200, streak: 8 },
  { rank: 2, name: "DeFiDegen", address: "0x5e6f...7g8h", avatar: "🦊", winRate: 82.3, pnl: 8920, trades: 203, volume: 67500, streak: 5 },
  { rank: 3, name: "AlphaHunter", address: "0x9i0j...1k2l", avatar: "🎯", winRate: 79.1, pnl: 7340, trades: 91, volume: 45800, streak: 3 },
  { rank: 4, name: "MoonShot", address: "0x3m4n...5o6p", avatar: "🚀", winRate: 76.8, pnl: 5670, trades: 178, volume: 52100, streak: 4 },
  { rank: 5, name: "SatoshiFan", address: "0x7q8r...9s0t", avatar: "₿", winRate: 74.2, pnl: 4210, trades: 134, volume: 38900, streak: 2 },
  { rank: 6, name: "PredictoorX", address: "0xab12...cd34", avatar: "🔮", winRate: 71.5, pnl: 3180, trades: 267, volume: 71200, streak: 1 },
  { rank: 7, name: "OracleNode", address: "0xef56...gh78", avatar: "⚡", winRate: 69.9, pnl: 2540, trades: 89, volume: 28400, streak: 0 },
  { rank: 8, name: "YieldFarmer", address: "0xij90...kl12", avatar: "🌾", winRate: 67.3, pnl: 1890, trades: 312, volume: 95600, streak: 2 },
  { rank: 9, name: "GasOptimizer", address: "0xmn34...op56", avatar: "⛽", winRate: 65.0, pnl: -420, trades: 45, volume: 12300, streak: 0 },
  { rank: 10, name: "BearishBob", address: "0xqr78...st90", avatar: "🐻", winRate: 58.2, pnl: -1250, trades: 67, volume: 18700, streak: 0 },
];

type Tab = "traders" | "markets";
type SortBy = "winRate" | "pnl" | "volume";

const rankBadge = (rank: number) => {
  if (rank === 1) return <Crown className="w-5 h-5" style={{ color: "hsl(45, 93%, 58%)" }} />;
  if (rank === 2) return <Medal className="w-5 h-5" style={{ color: "hsl(0, 0%, 78%)" }} />;
  if (rank === 3) return <Award className="w-5 h-5" style={{ color: "hsl(30, 75%, 40%)" }} />;
  return <span className="text-sm font-bold text-muted-foreground w-5 text-center">#{rank}</span>;
};

const Rankings = () => {
  const [tab, setTab] = useState<Tab>("traders");
  const [sortBy, setSortBy] = useState<SortBy>("pnl");

  const sortedTraders = [...mockTraders].sort((a, b) => {
    if (sortBy === "winRate") return b.winRate - a.winRate;
    if (sortBy === "pnl") return b.pnl - a.pnl;
    return b.volume - a.volume;
  });

  const sortedMarkets = [...mockMarkets].sort((a, b) => b.volume - a.volume);

  return (
    <div className="min-h-dvh bg-background pb-20">
      <TopBar />
      <div className="max-w-lg mx-auto px-4 pt-20">
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" /> Leaderboard
        </h2>
        <p className="text-xs text-muted-foreground mb-5">Top performers on the platform</p>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {(["traders", "markets"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold capitalize transition-all ${
                tab === t ? "bg-primary text-primary-foreground" : "glass text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "traders" && (
          <>
            {/* Sort options */}
            <div className="flex gap-2 mb-4">
              {([
                { key: "pnl", label: "PnL" },
                { key: "winRate", label: "Win Rate" },
                { key: "volume", label: "Volume" },
              ] as { key: SortBy; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                    sortBy === key
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Top 3 Podium */}
            <div className="flex items-end justify-center gap-3 mb-6">
              {[sortedTraders[1], sortedTraders[0], sortedTraders[2]].map((trader, i) => {
                const heights = ["h-24", "h-32", "h-20"];
                const sizes = ["w-12 h-12", "w-16 h-16", "w-12 h-12"];
                return (
                  <motion.div
                    key={trader.rank}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex flex-col items-center"
                  >
                    <div className={`${sizes[i]} rounded-full glass border-2 ${i === 1 ? "border-primary" : "border-border"} flex items-center justify-center text-xl mb-2`}>
                      {trader.avatar}
                    </div>
                    <p className="text-xs font-bold mb-0.5">{trader.name}</p>
                    <p className={`text-[11px] font-bold ${trader.pnl >= 0 ? "text-primary" : "text-destructive"}`}>
                      {trader.pnl >= 0 ? "+" : ""}${Math.abs(trader.pnl).toLocaleString()}
                    </p>
                    <div className={`${heights[i]} w-20 glass rounded-t-xl mt-2 flex items-center justify-center`}>
                      {rankBadge(trader.rank)}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Full list */}
            <div className="space-y-2">
              {sortedTraders.map((trader, i) => (
                <motion.div
                  key={trader.address}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="glass rounded-xl p-3.5 flex items-center gap-3"
                >
                  <div className="w-8 flex justify-center shrink-0">
                    {rankBadge(trader.rank)}
                  </div>

                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-lg shrink-0">
                    {trader.avatar}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold truncate">{trader.name}</span>
                      {trader.streak > 0 && (
                        <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-bold">
                          🔥{trader.streak}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                      <span>{trader.address}</span>
                      <span>·</span>
                      <span>{trader.trades} trades</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold flex items-center gap-1 justify-end ${
                      trader.pnl >= 0 ? "text-primary" : "text-destructive"
                    }`}>
                      {trader.pnl >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      {trader.pnl >= 0 ? "+" : ""}${Math.abs(trader.pnl).toLocaleString()}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{trader.winRate}% win</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}

        {tab === "markets" && (
          <div className="space-y-3">
            {sortedMarkets.map((market, i) => (
              <motion.div
                key={market.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="glass rounded-xl p-4 flex items-center gap-4"
              >
                <span className={`text-lg font-bold w-8 text-center ${i < 3 ? "text-primary" : "text-muted-foreground"}`}>
                  #{i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold truncate">{market.title}</h4>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                    <span>@{market.creatorName}</span>
                    <span>•</span>
                    <span className="flex items-center gap-0.5">
                      <TrendingUp className="w-3 h-3" /> {formatVolume(market.volume)}
                    </span>
                  </div>
                </div>
                <span className="neon-yes text-lg font-bold">{Math.round(market.yesPrice * 100)}%</span>
              </motion.div>
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
};

export default Rankings;
