import { memo, useState, useMemo, useRef, useEffect, type MutableRefObject } from "react";
import type { OHLCCandle } from "@/lib/cryptoPriceProvider";
import type { Candle, LinePoint } from "@/lib/chartEngine";
import { Loader2, Timer, Maximize2, Minimize2 } from "lucide-react";
import { isMarketOpen } from "@/lib/marketHours";
import TradingViewChart from "@/components/TradingViewChart";
import MarketClosedOverlay from "@/components/quick-trade/MarketClosedOverlay";
import SimpleAreaChart from "@/components/quick-trade/SimpleAreaChart";
import PolylineChart from "@/components/quick-trade/PolylineChart";
import SimpleCandleChart from "@/components/quick-trade/SimpleCandleChart";
import ChartZoomWrapper from "@/components/quick-trade/ChartZoomWrapper";

interface QuickTradeChartProps {
  chartType: "area" | "candle" | "tv" | "poly";
  chartTimeframe: string;
  chartAssetKey: string;
  chartMs: number;
  priceHistory: { time: string; price: number; ts: number }[];
  ohlcData: OHLCCandle[];
  streamingPrice: number | null;
  streamingPriceRef?: MutableRefObject<number | null>;
  historyLoading: boolean;
  activeRound: { open_price: number | null; created_at: string; duration_seconds: number } | null;
  userBet: { side: string; amount?: number } | null;
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

function BucketBadges({ bucketCountdown }: { bucketCountdown?: number }) {
  if (!bucketCountdown) return null;
  const fmt = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    if (m > 0) return `${m}:${s.toString().padStart(2, "0")}`;
    return `${s}s`;
  };
  return (
    <div className="absolute top-1 right-1 flex items-center gap-1 px-2 py-0.5 rounded-md bg-card/90 border border-border backdrop-blur-sm z-10">
      <Timer className="w-3 h-3 text-muted-foreground" />
      <span className="text-[9px] font-bold tabular-nums text-foreground">{fmt(bucketCountdown)}</span>
    </div>
  );
}

/** Convert engine Candle[] (already includes active candle from getCandlesWithMAs) into OHLCCandle[] */
function engineCandlesToOHLC(candles: Candle[]): { ohlc: OHLCCandle[]; mas: { ma7?: number; ma14?: number }[] } {
  const ohlc: OHLCCandle[] = candles.map(c => ({
    time: c.ts / 1000,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
  const mas = candles.map(c => ({ ma7: c.ma7, ma14: c.ma14 }));
  return { ohlc, mas };
}

/** Convert engine LinePoint[] into priceHistory format for SimpleAreaChart */
function engineLinesToHistory(points: LinePoint[]): { time: string; price: number; ts: number }[] {
  return points.map(p => ({
    time: new Date(p.ts).toISOString(),
    price: p.price,
    ts: p.ts,
  }));
}

function QuickTradeChart(props: QuickTradeChartProps) {
  const {
    chartType, chartTimeframe, chartAssetKey, chartMs, priceHistory, ohlcData, streamingPrice,
    streamingPriceRef,
    historyLoading, activeRound, userBet, resolveFlash, timeframeLabel, assetClass,
    engineCandles, engineLinePoints,
    bucketCountdown, engineReady,
  } = props;

  const [isFullscreen, setIsFullscreen] = useState(false);
  const entryPrice = userBet && activeRound?.open_price ? Number(activeRound.open_price) : null;

  const MIN_STABLE_ENGINE_CANDLES = 12;
  const MIN_STABLE_ENGINE_POINTS = 24;
  const chartIdentity = `${chartAssetKey}:${chartTimeframe}`;

  // Once engine is active for this asset/timeframe, keep rendering from engine-only data.
  const engineWasReadyRef = useRef(false);
  const lastStableEngineOhlcRef = useRef<{ ohlc: OHLCCandle[]; mas: { ma7?: number; ma14?: number }[] } | null>(null);
  const lastStableEngineLineRef = useRef<{ time: string; price: number; ts: number }[] | null>(null);

  useEffect(() => {
    engineWasReadyRef.current = false;
    // DON'T null the stable refs — keep showing previous data until new data arrives
    // This prevents the "Building chart..." skeleton flash on timeframe switch
  }, [chartIdentity]);

  if (engineReady) engineWasReadyRef.current = true;
  const useEngineData = engineWasReadyRef.current;

  const liveEngineOhlcData = useMemo(() => {
    if (!useEngineData || !engineCandles || engineCandles.length < 2) return null;
    return engineCandlesToOHLC(engineCandles);
  }, [useEngineData, engineCandles]);

  const liveEnginePriceHistory = useMemo(() => {
    if (!useEngineData || !engineLinePoints || engineLinePoints.length < 2) return null;
    return engineLinesToHistory(engineLinePoints);
  }, [useEngineData, engineLinePoints]);

  // Cache only sufficiently dense engine datasets to prevent sparse "scatter" jumps.
  if (liveEngineOhlcData && liveEngineOhlcData.ohlc.length >= MIN_STABLE_ENGINE_CANDLES) {
    lastStableEngineOhlcRef.current = liveEngineOhlcData;
  }
  if (liveEnginePriceHistory && liveEnginePriceHistory.length >= MIN_STABLE_ENGINE_POINTS) {
    lastStableEngineLineRef.current = liveEnginePriceHistory;
  }

  const engineOhlcData = lastStableEngineOhlcRef.current;
  const enginePriceHistory = lastStableEngineLineRef.current;

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
  if (priceHistory.length < 2 && streamingPrice == null && !engineReady) {
    return <ChartSkeleton text="Connecting to live feed..." />;
  }

  // Render native chart content
  let chartContent: React.ReactNode = null;

  if (chartType === "candle") {
    const preferredEngineOhlc = liveEngineOhlcData ?? engineOhlcData;

    if (useEngineData && preferredEngineOhlc && preferredEngineOhlc.ohlc.length >= 2) {
      chartContent = (
        <SimpleCandleChart
          ohlcData={preferredEngineOhlc.ohlc}
          entryPrice={entryPrice}
          assetClass={assetClass}
          streamingPrice={null}
          precomputedMAs={preferredEngineOhlc.mas}
        />
      );
    } else if (ohlcData.length >= 2) {
      chartContent = (
        <SimpleCandleChart
          ohlcData={ohlcData}
          entryPrice={entryPrice}
          assetClass={assetClass}
          streamingPrice={streamingPrice}
        />
      );
    } else if (priceHistory.length >= 2) {
      chartContent = (
        <SimpleCandleChart
          priceHistory={priceHistory}
          entryPrice={entryPrice}
          assetClass={assetClass}
          streamingPrice={streamingPrice}
          chartMs={chartMs}
        />
      );
    } else {
      return <ChartSkeleton text="Building chart..." />;
    }
  } else {
    const areaHistory = useEngineData
      ? (liveEnginePriceHistory ?? enginePriceHistory ?? priceHistory)
      : (liveEnginePriceHistory ?? priceHistory);

    if (!areaHistory || areaHistory.length < 2) {
      return <ChartSkeleton text="Building chart..." />;
    }

    const ChartComponent = chartType === "poly" ? PolylineChart : SimpleAreaChart;

    // Round-anchored x-axis (Polymarket-style left → right) — applied only to SimpleAreaChart
    const roundStartMs = activeRound ? new Date(activeRound.created_at).getTime() : null;
    const roundEndMs = roundStartMs && activeRound ? roundStartMs + activeRound.duration_seconds * 1000 : null;

    chartContent = chartType === "poly" ? (
      <PolylineChart
        priceHistory={areaHistory}
        entryPrice={entryPrice}
        assetClass={assetClass}
        userBet={userBet}
        activeRound={activeRound}
      />
    ) : (
      <SimpleAreaChart
        priceHistory={areaHistory}
        entryPrice={entryPrice}
        assetClass={assetClass}
        userBet={userBet}
        activeRound={activeRound}
        windowStartMs={roundStartMs}
        windowEndMs={roundEndMs}
      />
    );
  }

  // Clone chart content with fullscreen prop
  const fullscreenChartContent = (() => {
    if (chartType === "candle") {
      const engineOhlc = lastStableEngineOhlcRef.current;
      if (useEngineData && engineOhlc && engineOhlc.ohlc.length >= 2) {
        return <SimpleCandleChart ohlcData={engineOhlc.ohlc} entryPrice={entryPrice} assetClass={assetClass} streamingPrice={null} precomputedMAs={engineOhlc.mas} fullscreen />;
      }
      if (ohlcData.length >= 2) {
        return <SimpleCandleChart ohlcData={ohlcData} entryPrice={entryPrice} assetClass={assetClass} streamingPrice={streamingPrice} fullscreen />;
      }
      if (priceHistory.length >= 2) {
        return <SimpleCandleChart priceHistory={priceHistory} entryPrice={entryPrice} assetClass={assetClass} streamingPrice={streamingPrice} chartMs={chartMs} fullscreen />;
      }
    } else {
      const areaHistory = useEngineData ? enginePriceHistory : (liveEnginePriceHistory ?? priceHistory);
      if (areaHistory && areaHistory.length >= 2) {
        const roundStartMs = activeRound ? new Date(activeRound.created_at).getTime() : null;
        const roundEndMs = roundStartMs && activeRound ? roundStartMs + activeRound.duration_seconds * 1000 : null;
        return chartType === "poly" ? (
          <PolylineChart
            priceHistory={areaHistory}
            entryPrice={entryPrice}
            assetClass={assetClass}
            userBet={userBet}
            activeRound={activeRound}
            fullscreen
          />
        ) : (
          <SimpleAreaChart
            priceHistory={areaHistory}
            entryPrice={entryPrice}
            assetClass={assetClass}
            userBet={userBet}
            activeRound={activeRound}
            fullscreen
            windowStartMs={roundStartMs}
            windowEndMs={roundEndMs}
          />
        );
      }
    }
    return chartContent;
  })();

  if (isFullscreen) {
    return (
      <div
        className="fixed inset-0 z-50 bg-background flex flex-col"
        style={{
          paddingTop: "var(--safe-top)",
          paddingLeft: "var(--safe-left)",
          paddingRight: "var(--safe-right)",
        }}
      >
        <div className="relative flex-1 p-4">
          <ChartZoomWrapper className="w-full h-full" style={{ height: "100%" }} defaultZoom={1}>
            <div className="w-full h-full">
              {fullscreenChartContent}
            </div>
          </ChartZoomWrapper>
          <BucketBadges bucketCountdown={bucketCountdown} />
        </div>
        <button
          onClick={() => setIsFullscreen(false)}
          className="absolute left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm shadow-lg active:scale-95 transition-transform"
          style={{ bottom: "calc(1.5rem + var(--safe-bottom))" }}
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
      <ChartZoomWrapper defaultZoom={1}>
        {chartContent}
      </ChartZoomWrapper>
      <BucketBadges bucketCountdown={bucketCountdown} />
      <p className="text-[10px] text-muted-foreground text-center mt-1">Last {timeframeLabel}</p>

    </div>
  );
}

export default memo(QuickTradeChart);
