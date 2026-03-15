import { memo, useState, type MutableRefObject } from "react";
import type { OHLCCandle } from "@/lib/cryptoPriceProvider";
import type { Candle, LinePoint } from "@/lib/chartEngine";
import { Loader2, Timer, Maximize2, Minimize2 } from "lucide-react";
import { isMarketOpen } from "@/lib/marketHours";
import TradingViewChart from "@/components/TradingViewChart";
import MarketClosedOverlay from "@/components/quick-trade/MarketClosedOverlay";
import SimpleAreaChart from "@/components/quick-trade/SimpleAreaChart";
import SimpleCandleChart from "@/components/quick-trade/SimpleCandleChart";
import ChartZoomWrapper from "@/components/quick-trade/ChartZoomWrapper";

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

  const [isFullscreen, setIsFullscreen] = useState(false);

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

  // Render native chart content
  let chartContent: React.ReactNode = null;

  if (chartType === "candle") {
    if (ohlcData.length >= 2) {
      chartContent = (
        <SimpleCandleChart
          ohlcData={ohlcData}
          entryPrice={entryPrice}
          assetClass={assetClass}
          streamingPrice={streamingPrice}
        />
      );
    } else if (priceHistory.length < 2) {
      return <ChartSkeleton text="Building chart..." />;
    } else {
      chartContent = (
        <SimpleCandleChart
          priceHistory={priceHistory}
          entryPrice={entryPrice}
          assetClass={assetClass}
          streamingPrice={streamingPrice}
          chartMs={chartMs}
        />
      );
    }
  } else {
    // Area chart
    if (priceHistory.length < 2) {
      return <ChartSkeleton text="Building chart..." />;
    }
    chartContent = (
      <SimpleAreaChart
        priceHistory={priceHistory}
        entryPrice={entryPrice}
        assetClass={assetClass}
        userBet={userBet}
        activeRound={activeRound}
      />
    );
  }

  // Fullscreen wrapper
  if (isFullscreen) {
    return (
      <div
        className="fixed inset-0 z-50 bg-background flex flex-col"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        <div className="relative flex-1">
          <ChartZoomWrapper className="w-full h-full" style={{ height: "100%" }} defaultZoom={3}>
            <div className="w-full h-full flex items-center justify-center">
              {chartContent}
            </div>
          </ChartZoomWrapper>
          <BucketBadges bucketCountdown={bucketCountdown} bucketProgress={bucketProgress} />
        </div>
        <button
          onClick={() => setIsFullscreen(false)}
          className="absolute left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm shadow-lg active:scale-95 transition-transform"
          style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
          title="Exit fullscreen"
        >
          <Minimize2 className="w-4 h-4" />
          <span>Close Fullscreen</span>
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <ChartZoomWrapper defaultZoom={3}>
        {chartContent}
      </ChartZoomWrapper>
      <BucketBadges bucketCountdown={bucketCountdown} bucketProgress={bucketProgress} />
      <p className="text-[10px] text-muted-foreground text-center mt-1">Last {timeframeLabel}</p>

      {/* Expand button — same style as TradingView chart */}
      <button
        onClick={() => setIsFullscreen(true)}
        className="absolute bottom-7 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/80 backdrop-blur-sm border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-all shadow-md active:scale-95"
        title="Expand chart"
      >
        <Maximize2 className="w-3.5 h-3.5" />
        <span className="text-[10px] font-semibold">Expand</span>
      </button>
    </div>
  );
}

export default memo(QuickTradeChart);
