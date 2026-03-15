import { memo } from "react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip as RechartsTooltip } from "recharts";
import TradingViewChart from "@/components/TradingViewChart";
import type { OHLCCandle } from "@/lib/cryptoPriceProvider";
import type { Candle, LinePoint } from "@/lib/chartEngine";
import { Loader2, Timer } from "lucide-react";
import { isMarketOpen } from "@/lib/marketHours";
import SVGCandleChart from "@/components/quick-trade/SVGCandleChart";
import MarketClosedOverlay from "@/components/quick-trade/MarketClosedOverlay";

// ── Types ──

interface QuickTradeChartProps {
  chartType: "area" | "candle" | "tv";
  chartTimeframe: string;
  chartMs: number;
  priceHistory: { time: string; price: number; ts: number }[];
  ohlcData: OHLCCandle[];
  streamingPrice: number | null;
  historyLoading: boolean;
  activeRound: { open_price: number | null; created_at: string; duration_seconds: number } | null;
  userBet: { side: string } | null;
  resolveFlash: "win" | "lose" | null;
  timeframeLabel: string;
  assetClass?: "crypto" | "commodity" | "forex";
  engineCandles?: Candle[];
  engineLinePoints?: LinePoint[];
  engineActiveCandle?: Candle | null;
  bucketCountdown?: number;
  bucketProgress?: number;
  engineReady?: boolean;
}

// ── Constants ──

const UP_COLOR = "hsl(142, 76%, 36%)";
const DOWN_COLOR = "hsl(0, 84%, 60%)";
const ENTRY_COLOR = "#f59e0b";

// ── Helpers ──

function formatTooltipPrice(price: number, assetClass?: string): string {
  if (assetClass === "forex") return price.toFixed(4);
  if (assetClass === "commodity") return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1000) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m > 0) return `${m}:${s.toString().padStart(2, "0")}`;
  return `${s}s`;
}

// ── Skeleton (single DRY component) ──

function ChartSkeleton({ text }: { text: string }) {
  return (
    <div className="relative h-[220px] overflow-hidden rounded-lg bg-muted/30">
      <div className="absolute inset-0 flex items-end gap-[2px] px-1 pb-2">
        {Array.from({ length: 60 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-muted/50 animate-pulse"
            style={{
              height: `${15 + Math.sin(i * 0.3) * 12 + Math.random() * 8}%`,
              animationDelay: `${i * 30}ms`,
            }}
          />
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur-sm">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          <span className="text-[10px] font-medium text-muted-foreground">{text}</span>
        </div>
      </div>
    </div>
  );
}

// ── Bucket badges (shared by candle + area) ──

function BucketBadges({ bucketCountdown, bucketProgress }: { bucketCountdown?: number; bucketProgress?: number }) {
  return (
    <>
      {bucketCountdown != null && bucketCountdown > 0 && (
        <div className="absolute top-1 right-1 flex items-center gap-1 px-2 py-0.5 rounded-md bg-card/90 border border-border backdrop-blur-sm">
          <Timer className="w-3 h-3 text-muted-foreground" />
          <span className="text-[9px] font-bold tabular-nums text-foreground">{formatCountdown(bucketCountdown)}</span>
        </div>
      )}
      {bucketProgress != null && (
        <div className="absolute bottom-6 left-0 right-0 h-[2px] bg-muted/30">
          <div
            className="h-full bg-primary/50 transition-all duration-1000 ease-linear"
            style={{ width: `${bucketProgress * 100}%` }}
          />
        </div>
      )}
    </>
  );
}

// ── Area chart (engine-powered) ──

function EngineAreaChart({
  linePoints, entryPrice, assetClass, userBet, activeRound, timeframeLabel, bucketCountdown, bucketProgress,
}: {
  linePoints: LinePoint[];
  entryPrice: number | null;
  assetClass?: string;
  userBet: { side: string } | null;
  activeRound: { open_price: number | null } | null;
  timeframeLabel: string;
  bucketCountdown?: number;
  bucketProgress?: number;
}) {
  const color = (() => {
    if (userBet && activeRound?.open_price) {
      const entry = Number(activeRound.open_price);
      const current = linePoints[linePoints.length - 1].price;
      const inProfit = userBet.side === "down" ? current < entry : current > entry;
      return inProfit ? UP_COLOR : DOWN_COLOR;
    }
    return linePoints[linePoints.length - 1].price >= linePoints[0].price ? UP_COLOR : DOWN_COLOR;
  })();

  const tooltipContent = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-[11px]">
        <p className="font-semibold text-foreground">{formatTooltipPrice(Number(d.price), assetClass)}</p>
        <p className="text-muted-foreground">{new Date(d.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
      </div>
    );
  };

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={linePoints} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={[(d: number) => d - d * 0.001, (d: number) => d + d * 0.001]} hide />
          <XAxis dataKey="ts" hide />
          <RechartsTooltip content={tooltipContent} cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1, strokeDasharray: "3 3" }} />
          {entryPrice && (
            <ReferenceLine
              y={entryPrice}
              stroke={ENTRY_COLOR}
              strokeDasharray="4 3"
              strokeOpacity={0.8}
              label={{ value: `📍 ${formatTooltipPrice(entryPrice, assetClass)}`, position: "insideTopRight", fill: ENTRY_COLOR, fontSize: 9, fontWeight: 600 }}
            />
          )}
          <Area type="monotone" dataKey="price" stroke={color} strokeWidth={2} fill="url(#priceGradient)" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
      <BucketBadges bucketCountdown={bucketCountdown} bucketProgress={bucketProgress} />
      <p className="text-[10px] text-muted-foreground text-center mt-1">Last {timeframeLabel}</p>
    </div>
  );
}

// ── Main component ──

function QuickTradeChart({
  chartType, chartMs, priceHistory, ohlcData, streamingPrice,
  historyLoading, activeRound, userBet, resolveFlash, timeframeLabel, assetClass,
  engineCandles, engineLinePoints, engineActiveCandle, bucketCountdown, bucketProgress, engineReady,
}: QuickTradeChartProps) {

  const entryPrice = userBet && activeRound?.open_price ? Number(activeRound.open_price) : null;
  const hasEngineData = engineCandles && engineCandles.length >= 2 && engineReady;

  // ── 1. Market closed (forex/commodity only, not TV) ──
  if (chartType !== "tv" && !isMarketOpen(assetClass || "crypto")) {
    return <MarketClosedOverlay assetClass={assetClass || "crypto"} />;
  }

  // ── 2. TradingView mode ──
  if (chartType === "tv") {
    return (
      <TradingViewChart
        priceHistory={priceHistory}
        ohlcData={ohlcData}
        chartMs={chartMs}
        timeframeLabel={timeframeLabel}
        streamingPrice={streamingPrice}
        entryPrice={entryPrice}
        entrySide={userBet ? (userBet.side as "up" | "down") : null}
        roundEndTime={activeRound ? new Date(activeRound.created_at).getTime() + activeRound.duration_seconds * 1000 : null}
        targetPrice={entryPrice}
        resolveFlash={resolveFlash}
      />
    );
  }

  // ── 3. History loading ──
  if (historyLoading) {
    return <ChartSkeleton text="Loading chart..." />;
  }

  // ── 4. No streaming price yet ──
  if (streamingPrice == null) {
    return <ChartSkeleton text="Connecting to live feed..." />;
  }

  // ── 5. Engine not ready ──
  if (!hasEngineData) {
    return <ChartSkeleton text="Building chart..." />;
  }

  // ── 6. Candle chart ──
  if (chartType === "candle") {
    return (
      <div className="relative">
        <SVGCandleChart
          candles={engineCandles!}
          entryPrice={entryPrice}
          assetClass={assetClass}
          timeframeLabel={timeframeLabel}
        />
        <BucketBadges bucketCountdown={bucketCountdown} bucketProgress={bucketProgress} />
        <p className="text-[10px] text-muted-foreground text-center mt-1">Last {timeframeLabel}</p>
      </div>
    );
  }

  // ── 7. Area chart ──
  if (engineLinePoints && engineLinePoints.length >= 2) {
    return (
      <EngineAreaChart
        linePoints={engineLinePoints}
        entryPrice={entryPrice}
        assetClass={assetClass}
        userBet={userBet}
        activeRound={activeRound}
        timeframeLabel={timeframeLabel}
        bucketCountdown={bucketCountdown}
        bucketProgress={bucketProgress}
      />
    );
  }

  // ── Fallback (shouldn't reach here) ──
  return <ChartSkeleton text="Preparing chart..." />;
}

export default memo(QuickTradeChart);
