import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { mockMarkets } from "@/data/markets";
import { Trophy, TrendingUp } from "lucide-react";

const formatVolume = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
};

const Rankings = () => {
  const sorted = [...mockMarkets].sort((a, b) => b.volume - a.volume);

  return (
    <div className="min-h-dvh bg-background pb-20">
      <TopBar />
      <div className="max-w-lg mx-auto px-4 pt-20">
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" /> Leaderboard
        </h2>
        <p className="text-xs text-muted-foreground mb-6">Top markets by volume</p>

        <div className="space-y-3">
          {sorted.map((market, i) => (
            <div key={market.id} className="glass rounded-xl p-4 flex items-center gap-4">
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
            </div>
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  );
};

export default Rankings;
