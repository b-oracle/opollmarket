import { memo, useMemo, type MutableRefObject } from "react";
import type { OHLCCandle } from "@/lib/cryptoPriceProvider";
import type { Candle, LinePoint } from "@/lib/chartEngine";
import { Loader2, Timer } from "lucide-react";
import { isMarketOpen } from "@/lib/marketHours";
import TradingViewChart from "@/components/TradingViewChart";
import MarketClosedOverlay from "@/components/quick-trade/MarketClosedOverlay";
import SimpleAreaChart from "@/components/quick-trade/SimpleAreaChart";
import SimpleCandleChart from "@/components/quick-trade/SimpleCandleChart";

interface QuickTradeChartProps {
  chartType: "area" | "candle" | "tv";
  chartTimeframe: string;
  chartMs: number;
  priceHistory: { time: string; price: number; ts: number }[];
  ohlcData: OHLCCandle[];
  streamingPrice: number | null;
  streamingPriceRef?: MutableRefObject<number | null>;
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

const ENTRY_COLOR = "#f59e0b";

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

function BucketBadges({ bucketCountdown, bucketProgress }: { bucketCountdown?: number; bucketProgress?: number }) {
  if (!bucketCountdown && bucketProgress == null) return null;
  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}:${(s % 60).toString().padStart(2, "0")}` : `${s}s`;
  };
  return (
    <>
      {bucketCountdown != null && bucketCountdown > 0 && (
        <div className="absolute top-1 right-1 flex items-center gap-1 px-2 py-0.5 rounded-md bg-card/90 border border-border backdrop-blur-sm z-10">
          <Timer className="w-3 h-3 text-muted-foreground" />
          <span className="text-[9px] font-bold tabular-nums text-foreground">{fmt(bucketCountdown)}</span>
        </div>
      )}
      {bucketProgress != null && (
        <div className="absolute bottom-6 left-0 right-0 h-[2px] bg-muted/30">
          <div className="h-full bg-primary/50 transition-all duration-1000 ease-linear" style={{ width: `${bucketProgress * 100}%` }} />
        </div>
      )}
    </>
  );
}

function QuickTradeChart(props: QuickTradeChartProps) {
  const {
    chartType, chartMs, priceHistory, ohlcData, streamingPrice,
    streamingPriceRef,
    historyLoading, activeRound, userBet, resolveFlash, timeframeLabel, assetClass,
    bucketCountdown, bucketProgress,
  } = props;

  const entryPrice = userBet && activeRound?.open_price ? Number(activeRound.open_price) : null;

  // 1. Market closed
  if (chartType !== "tv" && !isMarketOpen(assetClass || "crypto")) {
    return <MarketClosedOverlay assetClass={assetClass || "crypto"} />;
  }

  // 2. TradingView
  if (chartType === "tv") {
    return (
      <TradingViewChart
        priceHistory={priceHistory}
        ohlcData={ohlcData}
        chartMs={chartMs}
        timeframeLabel={timeframeLabel}
        streamingPrice={streamingPrice}
        streamingPriceRef={streamingPriceRef}
        entryPrice={entryPrice}
        entrySide={userBet ? (userBet.side as "up" | "down") : null}
        roundEndTime={activeRound ? new Date(activeRound.created_at).getTime() + activeRound.duration_seconds * 1000 : null}
        targetPrice={entryPrice}
        resolveFlash={resolveFlash}
      />
    );
  }

  // 3. Loading
  if (historyLoading && priceHistory.length === 0) {
    return <ChartSkeleton text="Loading chart..." />;
  }

  // 4. No data at all
  if (priceHistory.length < 2 && streamingPrice == null) {
    return <ChartSkeleton text="Connecting to live feed..." />;
  }

  // 5. Candle chart — use ohlcData directly, or synthesize from priceHistory
  if (chartType === "candle") {
    if (ohlcData.length >= 2) {
      return (
        <div className="relative">
          <SimpleCandleChart
            ohlcData={ohlcData}
            entryPrice={entryPrice}
            assetClass={assetClass}
            streamingPrice={streamingPrice}
          />
          <BucketBadges bucketCountdown={bucketCountdown} bucketProgress={bucketProgress} />
          <p className="text-[10px] text-muted-foreground text-center mt-1">Last {timeframeLabel}</p>
        </div>
      );
    }
    // Not enough OHLC data — show skeleton briefly
    if (priceHistory.length < 2) {
      return <ChartSkeleton text="Building chart..." />;
    }
    // Fallback: synthesize candles from price history
    return (
      <div className="relative">
        <SimpleCandleChart
          priceHistory={priceHistory}
          entryPrice={entryPrice}
          assetClass={assetClass}
          streamingPrice={streamingPrice}
          chartMs={chartMs}
        />
        <BucketBadges bucketCountdown={bucketCountdown} bucketProgress={bucketProgress} />
        <p className="text-[10px] text-muted-foreground text-center mt-1">Last {timeframeLabel}</p>
      </div>
    );
  }

  // 6. Area chart — always renders from priceHistory (which gets streaming appends)
  if (priceHistory.length < 2) {
    return <ChartSkeleton text="Building chart..." />;
  }

  return (
    <div className="relative">
      <SimpleAreaChart
        priceHistory={priceHistory}
        entryPrice={entryPrice}
        assetClass={assetClass}
        userBet={userBet}
        activeRound={activeRound}
      />
      <BucketBadges bucketCountdown={bucketCountdown} bucketProgress={bucketProgress} />
      <p className="text-[10px] text-muted-foreground text-center mt-1">Last {timeframeLabel}</p>
    </div>
  );
}

export default memo(QuickTradeChart);
