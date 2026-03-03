import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Share2, Heart, TrendingUp, Users, Clock, Droplets, BarChart3 } from "lucide-react";
import { mockMarkets, categoryIcons } from "@/data/markets";
import BottomNav from "@/components/BottomNav";
import BetModal from "@/components/BetModal";
import OrderBook from "@/components/OrderBook";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";

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

const optionColors = [
  "hsl(var(--primary))",
  "hsl(var(--destructive))",
  "hsl(45, 93%, 58%)",
  "hsl(280, 70%, 60%)",
  "hsl(30, 80%, 55%)",
  "hsl(var(--muted-foreground))",
];

const MarketDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const market = mockMarkets.find((m) => m.id === id);

  const isMulti = market?.marketType === "multi" || market?.marketType === "range";
  const yesPercent = market ? Math.round(market.yesPrice * 100) : 0;
  const noPercent = market ? Math.round(market.noPrice * 100) : 0;

  const [timePeriod, setTimePeriod] = useState<"1D" | "1W" | "1M" | "All">("1M");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const pointsMap = { "1D": 24, "1W": 7, "1M": 30, "All": 90 };

  const chartData = useMemo(() => {
    if (!market) return [];
    const points = pointsMap[timePeriod];

    if (isMulti && market.options) {
      // Generate chart data for each option
      return Array.from({ length: points }, (_, i) => {
        const entry: Record<string, number> = { day: i + 1 };
        market.options!.forEach((opt, oi) => {
          const volatility = { "1D": 2, "1W": 4, "1M": 5, "All": 8 }[timePeriod];
          const base = opt.price * 100 - volatility;
          const seed = i * 0.8 + points + oi * 7;
          const noise = Math.sin(seed) * volatility + Math.cos(seed * 0.3) * (volatility * 0.4);
          const trend = ((opt.price * 100 - base) / points) * i;
          entry[opt.label] = i === points - 1
            ? Math.round(opt.price * 100)
            : Math.max(1, Math.min(95, Math.round(base + trend + noise)));
        });
        return entry;
      });
    }

    const volatility = { "1D": 3, "1W": 6, "1M": 8, "All": 12 }[timePeriod];
    const base = yesPercent - volatility * 1.5;
    return Array.from({ length: points }, (_, i) => {
      const seed = i * 0.8 + points;
      const noise = Math.sin(seed) * volatility + Math.cos(seed * 0.3) * (volatility * 0.6);
      const trend = ((yesPercent - base) / points) * i;
      const value = Math.max(5, Math.min(95, Math.round(base + trend + noise)));
      return {
        day: i + 1,
        yes: i === points - 1 ? yesPercent : value,
        no: i === points - 1 ? noPercent : 100 - value,
      };
    });
  }, [market, yesPercent, noPercent, timePeriod, isMulti]);

  const [betSide, setBetSide] = useState<"yes" | "no">("yes");
  const [betOpen, setBetOpen] = useState(false);

  if (!market) return <div className="h-dvh flex items-center justify-center text-muted-foreground">Market not found</div>;

  return (
    <div className="h-dvh bg-background overflow-y-auto pb-20">
      {/* Header */}
      <div className="sticky top-0 z-20 glass-strong">
        <div className="flex items-center justify-between h-14 px-4 max-w-lg mx-auto">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full glass flex items-center justify-center">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              {categoryIcons[market.category]} {market.category}
            </span>
            {isMulti && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                {market.marketType === "range" ? "Range" : "Multi"}
              </span>
            )}
          </div>
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
        <h1 className="text-2xl font-bold leading-tight mb-2">{market.title}</h1>
        <p className="text-sm text-muted-foreground mb-6">{market.description}</p>

        {/* Chart */}
        <div className="glass rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">
              {isMulti ? "Option Probabilities" : "Probability"}
            </span>
            {!isMulti && (
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-destructive">NO {noPercent}¢</span>
                <span className="text-2xl font-bold neon-yes">YES {yesPercent}¢</span>
              </div>
            )}
          </div>

          <div className="flex gap-1 p-0.5 rounded-lg bg-muted/50 mb-3 w-fit">
            {(["1D", "1W", "1M", "All"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setTimePeriod(p)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  timePeriod === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  {isMulti && market.options ? (
                    market.options.map((opt, i) => (
                      <linearGradient key={opt.id} id={`grad-${opt.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={optionColors[i % optionColors.length]} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={optionColors[i % optionColors.length]} stopOpacity={0.02} />
                      </linearGradient>
                    ))
                  ) : (
                    <>
                      <linearGradient id="yesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--neon-yes))" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="hsl(var(--neon-yes))" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="noGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--neon-no))" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(var(--neon-no))" stopOpacity={0.05} />
                      </linearGradient>
                    </>
                  )}
                </defs>
                <XAxis dataKey="day" hide />
                <YAxis domain={[0, 100]} hide />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.75rem",
                    fontSize: "12px",
                  }}
                  formatter={(value: number, name: string) => [`${value}¢`, name]}
                  labelFormatter={(label) => `Day ${label}`}
                />
                {isMulti && market.options ? (
                  market.options.map((opt, i) => (
                    <Area
                      key={opt.id}
                      type="monotone"
                      dataKey={opt.label}
                      stroke={optionColors[i % optionColors.length]}
                      strokeWidth={selectedOption === opt.id || !selectedOption ? 2 : 0.5}
                      fill={`url(#grad-${opt.id})`}
                      fillOpacity={selectedOption === opt.id || !selectedOption ? 1 : 0.1}
                      animationDuration={1500 + i * 200}
                      animationEasing="ease-in-out"
                    />
                  ))
                ) : (
                  <>
                    <Area type="monotone" dataKey="yes" stroke="hsl(var(--neon-yes))" strokeWidth={2} fill="url(#yesGrad)" animationDuration={1500} />
                    <Area type="monotone" dataKey="no" stroke="hsl(var(--neon-no))" strokeWidth={1.5} fill="url(#noGrad)" animationDuration={1800} />
                  </>
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Multi-option legend */}
          {isMulti && market.options && (
            <div className="flex flex-wrap gap-2 mt-3">
              {market.options.map((opt, i) => (
                <button
                  key={opt.id}
                  onClick={() => setSelectedOption(selectedOption === opt.id ? null : opt.id)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                    selectedOption === opt.id ? "bg-secondary ring-1 ring-primary/30" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: optionColors[i % optionColors.length] }} />
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Multi-option pricing cards */}
        {isMulti && market.options && (
          <div className="space-y-2 mb-4">
            {market.options.map((opt, i) => {
              const pct = Math.round(opt.price * 100);
              return (
                <motion.div
                  key={opt.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass rounded-xl p-3.5 flex items-center gap-3"
                >
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: optionColors[i % optionColors.length] }}
                  />
                  <span className="text-sm font-semibold flex-1">{opt.label}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, delay: i * 0.1 }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: optionColors[i % optionColors.length] }}
                      />
                    </div>
                    <span className="text-sm font-bold w-10 text-right" style={{ color: optionColors[i % optionColors.length] }}>
                      {pct}¢
                    </span>
                    <button
                      onClick={() => { setBetSide("yes"); setBetOpen(true); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95"
                      style={{
                        backgroundColor: `${optionColors[i % optionColors.length]}20`,
                        color: optionColors[i % optionColors.length],
                      }}
                    >
                      Buy
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

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

        {/* Order Book (binary only) */}
        {!isMulti && (
          <OrderBook yesPrice={yesPercent} noPrice={noPercent} liquidity={market.liquidity} />
        )}

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

        {/* Discussion */}
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

        {/* Bet buttons (binary only) */}
        {!isMulti && (
          <div className="sticky bottom-20 flex gap-3 pb-4">
            <button
              onClick={() => { setBetSide("yes"); setBetOpen(true); }}
              className="flex-1 btn-yes py-4 rounded-xl font-bold text-base tracking-wide transition-all active:scale-95"
            >
              YES {yesPercent}¢
            </button>
            <button
              onClick={() => { setBetSide("no"); setBetOpen(true); }}
              className="flex-1 btn-no py-4 rounded-xl font-bold text-base tracking-wide transition-all active:scale-95"
            >
              NO {noPercent}¢
            </button>
          </div>
        )}
      </div>

      <BetModal
        open={betOpen}
        onClose={() => setBetOpen(false)}
        side={betSide}
        price={betSide === "yes" ? yesPercent : noPercent}
        marketTitle={market.title}
      />

      <BottomNav />
    </div>
  );
};

export default MarketDetail;
