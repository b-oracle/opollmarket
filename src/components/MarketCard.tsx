import { Heart, MessageCircle, Share2, TrendingUp, Users, Clock, BarChart3, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { Market, categoryIcons } from "@/data/markets";
import { useNavigate } from "react-router-dom";

interface MarketCardProps {
  market: Market;
  isActive: boolean;
}

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

const MarketCard = ({ market, isActive }: MarketCardProps) => {
  const navigate = useNavigate();
  const yesPercent = Math.round(market.yesPrice * 100);
  const noPercent = Math.round(market.noPrice * 100);
  const isMulti = market.marketType === "multi" || market.marketType === "range";

  return (
    <div className="snap-item relative h-[calc(100dvh-5rem)] w-full flex items-end pb-6 px-4">
      <div className="absolute inset-0 bg-gradient-to-br from-secondary/50 via-background to-background" />

      {/* Probability ring or multi-option indicator */}
      <div className="absolute top-8 right-4 z-10">
        {isMulti ? (
          <div className="glass rounded-xl px-3 py-2 flex flex-col items-center gap-1">
            <BarChart3 className="w-5 h-5 text-primary" />
            <span className="text-[10px] font-bold text-primary uppercase">
              {market.options?.length} options
            </span>
          </div>
        ) : (
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
              <circle
                cx="40" cy="40" r="34"
                fill="none"
                stroke="hsl(var(--neon-yes))"
                strokeWidth="4"
                strokeDasharray={`${yesPercent * 2.136} ${213.6 - yesPercent * 2.136}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold neon-yes">{yesPercent}%</span>
              <span className="text-[10px] text-muted-foreground">YES</span>
            </div>
          </div>
        )}
      </div>

      {/* Category badge */}
      <div className="absolute top-8 left-4 z-10 flex items-center gap-2">
        <span className="glass px-3 py-1.5 rounded-full text-xs font-medium text-foreground/80">
          {categoryIcons[market.category]} {market.category}
        </span>
        {isMulti && (
          <span className="glass px-2 py-1.5 rounded-full text-[10px] font-bold text-primary">
            {market.marketType === "range" ? "📊 Range" : "🎯 Multi"}
          </span>
        )}
      </div>

      {/* Side actions */}
      <div className="absolute right-4 bottom-40 z-10 flex flex-col items-center gap-6">
        <button className="flex flex-col items-center gap-1 group">
          <div className="w-10 h-10 rounded-full glass flex items-center justify-center group-hover:bg-destructive/20 transition-colors">
            <Heart className="w-5 h-5 text-foreground/70 group-hover:text-destructive transition-colors" />
          </div>
          <span className="text-[10px] text-muted-foreground">2.4K</span>
        </button>
        <button className="flex flex-col items-center gap-1 group">
          <div className="w-10 h-10 rounded-full glass flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <MessageCircle className="w-5 h-5 text-foreground/70 group-hover:text-primary transition-colors" />
          </div>
          <span className="text-[10px] text-muted-foreground">482</span>
        </button>
        <button className="flex flex-col items-center gap-1 group">
          <div className="w-10 h-10 rounded-full glass flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Share2 className="w-5 h-5 text-foreground/70 group-hover:text-primary transition-colors" />
          </div>
          <span className="text-[10px] text-muted-foreground">Share</span>
        </button>
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-[calc(100%-4rem)]">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
            <span className="text-xs font-bold text-primary">{market.creatorName.charAt(0)}</span>
          </div>
          <span className="text-sm font-medium text-foreground/80">@{market.creatorName}</span>
          {market.trending && (
            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center gap-1">
              <Zap className="w-3 h-3" /> Boosted
            </span>
          )}
        </div>

        <h2
          className="text-xl font-bold leading-tight mb-3 cursor-pointer hover:text-primary transition-colors"
          onClick={() => navigate(`/market/${market.id}`)}
        >
          {market.title}
        </h2>

        <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" /> {formatVolume(market.volume)} vol
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" /> {market.participants.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> {getTimeRemaining(market.endDate)}
          </span>
        </div>

        {/* Prediction buttons */}
        {isActive && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            {isMulti && market.options ? (
              <div className="space-y-2">
                {market.options.slice(0, 4).map((opt, i) => {
                  const pct = Math.round(opt.price * 100);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => navigate(`/market/${market.id}`)}
                      className="w-full glass rounded-xl px-4 py-2.5 flex items-center justify-between transition-all active:scale-[0.98] hover:bg-accent/50"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: optionColors[i % optionColors.length] }}
                        />
                        <span className="text-sm font-medium">{opt.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: optionColors[i % optionColors.length],
                            }}
                          />
                        </div>
                        <span className="text-sm font-bold" style={{ color: optionColors[i % optionColors.length] }}>
                          {pct}¢
                        </span>
                      </div>
                    </button>
                  );
                })}
                {market.options.length > 4 && (
                  <button
                    onClick={() => navigate(`/market/${market.id}`)}
                    className="w-full text-center text-xs text-primary font-semibold py-1"
                  >
                    +{market.options.length - 4} more options →
                  </button>
                )}
              </div>
            ) : (
              <div className="flex gap-3">
                <button className="flex-1 btn-yes py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all active:scale-95">
                  YES {yesPercent}¢
                </button>
                <button className="flex-1 btn-no py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all active:scale-95">
                  NO {noPercent}¢
                </button>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default MarketCard;
