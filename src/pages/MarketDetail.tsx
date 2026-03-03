import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Share2, Heart, TrendingUp, Users, Clock, Droplets } from "lucide-react";
import { mockMarkets, categoryIcons } from "@/data/markets";
import BottomNav from "@/components/BottomNav";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useMemo } from "react";

const formatVolume = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
};

const getTimeRemaining = (endDate: string) => {
  const diff = new Date(endDate).getTime() - Date.now();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 365) return `${Math.floor(days / 365)}y left`;
  if (days > 30) return `${Math.floor(days / 30)}mo left`;
  return `${days}d left`;
};

const MarketDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const market = mockMarkets.find((m) => m.id === id);

  if (!market) return <div className="h-dvh flex items-center justify-center text-muted-foreground">Market not found</div>;

  const yesPercent = Math.round(market.yesPrice * 100);
  const noPercent = Math.round(market.noPrice * 100);

  // Generate realistic chart data
  const chartData = useMemo(() => {
    const points = 30;
    const base = yesPercent - 15;
    return Array.from({ length: points }, (_, i) => {
      const noise = Math.sin(i * 0.8) * 8 + Math.cos(i * 0.3) * 5 + (Math.random() - 0.5) * 6;
      const trend = ((yesPercent - base) / points) * i;
      const value = Math.max(5, Math.min(95, Math.round(base + trend + noise)));
      return {
        day: i + 1,
        yes: i === points - 1 ? yesPercent : value,
        no: i === points - 1 ? noPercent : 100 - value,
      };
    });
  }, [yesPercent, noPercent]);

  return (
    <div className="h-dvh bg-background overflow-y-auto pb-20">
      {/* Header */}
      <div className="sticky top-0 z-20 glass-strong">
        <div className="flex items-center justify-between h-14 px-4 max-w-lg mx-auto">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full glass flex items-center justify-center">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium text-muted-foreground">
            {categoryIcons[market.category]} {market.category}
          </span>
          <div className="flex gap-2">
            <button className="w-10 h-10 rounded-full glass flex items-center justify-center">
              <Heart className="w-5 h-5" />
            </button>
            <button className="w-10 h-10 rounded-full glass flex items-center justify-center">
              <Share2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        {/* Title */}
        <h1 className="text-2xl font-bold leading-tight mb-2">{market.title}</h1>
        <p className="text-sm text-muted-foreground mb-6">{market.description}</p>

        {/* Price chart mock */}
        <div className="glass rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-muted-foreground">Price History</span>
            <span className="neon-yes text-2xl font-bold">{yesPercent}¢</span>
          </div>
          <div className="h-32 flex items-end gap-1">
            {chartPoints.map((point, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-sm transition-all"
                  style={{
                    height: `${point * 1.2}%`,
                    background: i === chartPoints.length - 1
                      ? "hsl(var(--neon-yes))"
                      : "hsl(var(--neon-yes) / 0.3)",
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="glass rounded-xl p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="text-xs">Volume</span>
            </div>
            <span className="text-lg font-bold">{formatVolume(market.volume)}</span>
          </div>
          <div className="glass rounded-xl p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Droplets className="w-3.5 h-3.5" />
              <span className="text-xs">Liquidity</span>
            </div>
            <span className="text-lg font-bold">{formatVolume(market.liquidity)}</span>
          </div>
          <div className="glass rounded-xl p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="w-3.5 h-3.5" />
              <span className="text-xs">Traders</span>
            </div>
            <span className="text-lg font-bold">{market.participants.toLocaleString()}</span>
          </div>
          <div className="glass rounded-xl p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-xs">Ends</span>
            </div>
            <span className="text-lg font-bold">{getTimeRemaining(market.endDate)}</span>
          </div>
        </div>

        {/* Creator */}
        <div className="glass rounded-xl p-4 mb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
            <span className="font-bold text-primary">{market.creatorName.charAt(0)}</span>
          </div>
          <div>
            <p className="text-sm font-semibold">@{market.creatorName}</p>
            <p className="text-xs text-muted-foreground">{market.creatorAddress}</p>
          </div>
        </div>

        {/* Discussion mock */}
        <div className="glass rounded-xl p-4 mb-6">
          <h3 className="text-sm font-semibold mb-3">Discussion</h3>
          <div className="space-y-3">
            {[
              { user: "alpha_trader", text: "This is definitely going YES. Momentum is insane.", time: "2h" },
              { user: "bear_case", text: "Everyone's too bullish. Classic contrarian signal.", time: "1h" },
              { user: "data_nerd", text: "Historical data suggests ~40% probability. Market is overpriced.", time: "45m" },
            ].map((comment, i) => (
              <div key={i} className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-secondary-foreground">{comment.user.charAt(0).toUpperCase()}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">@{comment.user}</span>
                    <span className="text-[10px] text-muted-foreground">{comment.time}</span>
                  </div>
                  <p className="text-xs text-foreground/80">{comment.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bet buttons - sticky bottom */}
        <div className="sticky bottom-20 flex gap-3 pb-4">
          <button className="flex-1 btn-yes py-4 rounded-xl font-bold text-base tracking-wide transition-all active:scale-95">
            YES {yesPercent}¢
          </button>
          <button className="flex-1 btn-no py-4 rounded-xl font-bold text-base tracking-wide transition-all active:scale-95">
            NO {noPercent}¢
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default MarketDetail;
