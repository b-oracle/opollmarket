import { useEffect, useRef, useState, useCallback, forwardRef } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type UTCTimestamp,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  AreaSeries,
} from "lightweight-charts";
import { Maximize2, Minimize2, TrendingUp, Minus, Trash2, Undo2, MousePointer, CandlestickChart, LineChart } from "lucide-react";
import { useChartDrawings, type DrawingTool } from "@/hooks/useChartDrawings";
import type { OHLCCandle } from "@/lib/cryptoPriceProvider";

interface PricePoint {
  ts: number;
  price: number;
}

interface TradingViewChartProps {
  /** Legacy: raw price points to bucket into candles client-side */
  priceHistory?: PricePoint[];
  /** New: pre-built OHLC candles from exchange APIs */
  ohlcData?: OHLCCandle[];
  chartMs: number;
  timeframeLabel: string;
  /** Streaming: latest price tick to append in real-time */
  streamingPrice?: number | null;
  /** Entry price to show as a horizontal marker line */
  entryPrice?: number | null;
  /** Bet side for coloring the entry line */
  entrySide?: "up" | "down" | null;
  /** Target / "Price to beat" — shown as dashed line like Polymarket */
  targetPrice?: number | null;
  /** Unix ms timestamp when the active round ends */
  roundEndTime?: number | null;
  /** Flash effect on round resolution */
  resolveFlash?: "win" | "lose" | null;
}

const CANDLE_BUCKETS = 60;

function getCandleBucketSeconds(timeframeLabel: string, chartMs: number): number {
  const tf = timeframeLabel.trim().toLowerCase();
  switch (tf) {
    case "1m": return 60;
    case "5m": return 5 * 60;
    case "15m": return 15 * 60;
    case "1h": return 60 * 60;
    case "4h": return 4 * 60 * 60;
    case "1d": return 24 * 60 * 60;
    default: return Math.max(60, Math.floor(chartMs / 1000));
  }
}

const TradingViewChart = forwardRef<HTMLDivElement, TradingViewChartProps>(function TradingViewChart({
  priceHistory,
  ohlcData,
  chartMs,
  timeframeLabel,
  streamingPrice,
  entryPrice,
  entrySide,
  targetPrice,
  roundEndTime,
  resolveFlash,
}, _ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineMainSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const maSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ma14SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chartStyle, setChartStyle] = useState<"candle" | "line">("line"); // default to line for streaming feel
  const lastCandleTimeRef = useRef<number>(0);
  const prevStreamingPriceRef = useRef<number | null>(null);
  const pulsingDotRef = useRef<HTMLDivElement>(null);
  const [dotColor, setDotColor] = useState("#22c55e");
  const [countdown, setCountdown] = useState<number | null>(null);
  const interpolationRef = useRef<number | null>(null);
  const interpolatedPriceRef = useRef<number | null>(null);
  const targetStreamingPriceRef = useRef<number | null>(null);
  const animationActiveRef = useRef(false);
  const hasInitializedDataRef = useRef(false);
  const seededDataKeyRef = useRef<string>("");
  const candleBucketSecRef = useRef<number>(getCandleBucketSeconds(timeframeLabel, chartMs));
  // Track current streaming candle OHLC state
  const currentCandleRef = useRef<{ time: number; open: number; high: number; low: number; close: number } | null>(null);
  // Area chart: track committed timestamp for smooth streaming
  const areaCommittedTimeRef = useRef<number>(0);
  const lastScrollTimeRef = useRef<number>(0);
  // Used to pin the live dot to the exact same X timestamp as the series update
  const livePointTimeRef = useRef<UTCTimestamp | null>(null);

  useEffect(() => {
    candleBucketSecRef.current = getCandleBucketSeconds(timeframeLabel, chartMs);
  }, [timeframeLabel, chartMs]);

  // Reset candle runtime state when timeframe or chart style changes
  useEffect(() => {
    currentCandleRef.current = null;
    lastCandleTimeRef.current = 0;
  }, [timeframeLabel, chartMs, chartStyle]);

  // Countdown timer for active round
  useEffect(() => {
    if (!roundEndTime) { setCountdown(null); return; }
    const tick = () => {
      const left = Math.max(0, Math.floor((roundEndTime - Date.now()) / 1000));
      setCountdown(left);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [roundEndTime]);

  const activeMainSeries = chartStyle === "candle" ? candleSeriesRef : lineMainSeriesRef;
  const { activeTool, setActiveTool, clearDrawings, removeLastDrawing } =
    useChartDrawings(chartRef, activeMainSeries as any, containerRef);

  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  const buildData = useCallback(() => {
    const upColor = "#22c55e";
    const downColor = "#ef4444";
    const desiredBucketSec = getCandleBucketSeconds(timeframeLabel, chartMs);

    // Prefer real OHLC data from exchange APIs
    if (ohlcData && ohlcData.length > 0) {
      const sorted = [...ohlcData].sort((a, b) => a.time - b.time);
      const sourceIntervalSec = sorted.length > 1 ? Math.max(1, sorted[1].time - sorted[0].time) : desiredBucketSec;
      const shouldUseRawPriceFallback = desiredBucketSec < sourceIntervalSec && !!priceHistory && priceHistory.length > 1;

      if (!shouldUseRawPriceFallback) {
        const cutoffSec = Math.floor(Date.now() / 1000) - desiredBucketSec * CANDLE_BUCKETS;
        const scoped = sorted.filter((c) => c.time >= cutoffSec);
        const source = scoped.length > 1 ? scoped : sorted.slice(-CANDLE_BUCKETS);

        const candles: CandlestickData[] = [];
        const volumes: { time: UTCTimestamp; value: number; color: string }[] = [];

        let bucketTime: number | null = null;
        let open = 0;
        let high = 0;
        let low = 0;
        let close = 0;
        let sampleCount = 0;

        const flushBucket = () => {
          if (bucketTime == null) return;
          const time = bucketTime as UTCTimestamp;
          candles.push({ time, open, high, low, close });
          volumes.push({
            time,
            value: Math.max(1, sampleCount),
            color: close >= open ? upColor + "66" : downColor + "66",
          });
        };

        for (const c of source) {
          const alignedTime = Math.floor(c.time / desiredBucketSec) * desiredBucketSec;
          if (bucketTime === null || alignedTime !== bucketTime) {
            flushBucket();
            bucketTime = alignedTime;
            open = c.open;
            high = c.high;
            low = c.low;
            close = c.close;
            sampleCount = 1;
          } else {
            high = Math.max(high, c.high);
            low = Math.min(low, c.low);
            close = c.close;
            sampleCount += 1;
          }
        }

        flushBucket();

        const ma7: { time: UTCTimestamp; value: number }[] = [];
        const ma14: { time: UTCTimestamp; value: number }[] = [];
        for (let i = 0; i < candles.length; i++) {
          if (i >= 6) {
            let sum = 0;
            for (let j = i - 6; j <= i; j++) sum += (candles[j] as any).close;
            ma7.push({ time: candles[i].time as UTCTimestamp, value: sum / 7 });
          }
          if (i >= 13) {
            let sum = 0;
            for (let j = i - 13; j <= i; j++) sum += (candles[j] as any).close;
            ma14.push({ time: candles[i].time as UTCTimestamp, value: sum / 14 });
          }
        }

        return { candles, volumes, ma7, ma14 };
      }
    }

    // Fallback: bucket raw price points into candles
    if (!priceHistory) return { candles: [], volumes: [], ma7: [], ma14: [] };
    const lookbackMs = Math.max(chartMs, desiredBucketSec * CANDLE_BUCKETS * 1000);
    const cutoff = Date.now() - lookbackMs;
    const filtered = priceHistory.filter((pt) => pt.ts >= cutoff);
    if (filtered.length < 2) return { candles: [], volumes: [], ma7: [], ma14: [] };

    const bucketMs = desiredBucketSec * 1000;
    const candles: CandlestickData[] = [];
    const volumes: { time: UTCTimestamp; value: number; color: string }[] = [];
    let bucketStart = filtered[0].ts;
    let bucket: number[] = [];

    const flush = () => {
      if (!bucket.length) return;
      const o = bucket[0], c = bucket[bucket.length - 1];
      const h = Math.max(...bucket), l = Math.min(...bucket);
      const time = Math.floor(bucketStart / 1000) as UTCTimestamp;
      candles.push({ time, open: o, high: h, low: l, close: c });
      volumes.push({ time, value: bucket.length, color: c >= o ? upColor + "66" : downColor + "66" });
    };

    for (const pt of filtered) {
      if (pt.ts - bucketStart >= bucketMs && bucket.length) {
        flush();
        bucketStart = pt.ts;
        bucket = [];
      }
      bucket.push(pt.price);
    }
    flush();

    const ma7: { time: UTCTimestamp; value: number }[] = [];
    const ma14: { time: UTCTimestamp; value: number }[] = [];
    for (let i = 0; i < candles.length; i++) {
      if (i >= 6) {
        let sum = 0;
        for (let j = i - 6; j <= i; j++) sum += (candles[j] as any).close;
        ma7.push({ time: candles[i].time as UTCTimestamp, value: sum / 7 });
      }
      if (i >= 13) {
        let sum = 0;
        for (let j = i - 13; j <= i; j++) sum += (candles[j] as any).close;
        ma14.push({ time: candles[i].time as UTCTimestamp, value: sum / 14 });
      }
    }

    return { candles, volumes, ma7, ma14 };
  }, [priceHistory, ohlcData, chartMs]);

  // Create main chart
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: isDark ? "#9ca3af" : "#6b7280", fontSize: 10 },
      grid: { vertLines: { color: isDark ? "#27272a" : "#f1f1f1" }, horzLines: { color: isDark ? "#27272a" : "#f1f1f1" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.2 }, minimumWidth: 60 },
      timeScale: { 
        borderVisible: false, 
        timeVisible: true, 
        secondsVisible: true,
        rightOffset: chartStyle === "line" ? 8 : 5,
        // Disable auto-scroll for area/line to prevent horizontal snapping;
        // we manually manage scrolling for area mode at a smooth cadence
        shiftVisibleRangeOnNewBar: chartStyle === "candle",
      },
      handleScroll: { vertTouchDrag: false },
    });

    if (chartStyle === "candle") {
      candleSeriesRef.current = chart.addSeries(CandlestickSeries, { upColor: "#22c55e", downColor: "#ef4444", borderUpColor: "#22c55e", borderDownColor: "#ef4444", wickUpColor: "#22c55e", wickDownColor: "#ef4444" });
      lineMainSeriesRef.current = null;
      areaSeriesRef.current = null;
    } else {
      // Use area series for a smooth streaming line like Deriv/Pocket Option
      areaSeriesRef.current = chart.addSeries(AreaSeries, {
        lineColor: "#22c55e",
        lineWidth: 2,
        topColor: "rgba(34, 197, 94, 0.28)",
        bottomColor: "rgba(34, 197, 94, 0.02)",
        priceLineVisible: true,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
      });
      lineMainSeriesRef.current = null;
      candleSeriesRef.current = null;
    }

    volumeSeriesRef.current = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume" });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    maSeriesRef.current = chart.addSeries(LineSeries, { color: "hsl(45, 93%, 58%)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    ma14SeriesRef.current = chart.addSeries(LineSeries, { color: "hsl(280, 80%, 65%)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });

    chartRef.current = chart;
    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    });
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      if (interpolationRef.current) {
        cancelAnimationFrame(interpolationRef.current);
        interpolationRef.current = null;
      }
      animationActiveRef.current = false;
      hasInitializedDataRef.current = false;
      currentCandleRef.current = null;
      chart.remove();
      chartRef.current = null;
    };
  }, [isDark, chartStyle]);

  // Set/refresh chart data when timeframe/source changes (without resetting every stream tick)
  useEffect(() => {
    if (!chartRef.current) return;

    const ohlcLen = ohlcData?.length ?? 0;
    const ohlcFirst = ohlcLen > 0 ? ohlcData![0].time : 0;
    const ohlcLast = ohlcLen > 0 ? ohlcData![ohlcLen - 1].time : 0;
    const priceLen = priceHistory?.length ?? 0;
    const priceFirst = priceLen > 0 ? priceHistory![0].ts : 0;
    const priceLast = priceLen > 0 ? priceHistory![priceLen - 1].ts : 0;

    const dataKey = `${chartStyle}:${timeframeLabel}:${chartMs}:${ohlcLen}:${ohlcFirst}:${ohlcLast}:${priceLen}:${priceFirst}:${priceLast}`;
    if (hasInitializedDataRef.current && seededDataKeyRef.current === dataKey) {
      return;
    }

    const { candles, volumes, ma7, ma14 } = buildData();
    if (!candles.length) return;

    if (chartStyle === "candle" && candleSeriesRef.current) {
      candleSeriesRef.current.setData(candles);
    } else if (chartStyle === "line" && areaSeriesRef.current) {
      const areaData = candles.map((c: any) => ({
        time: c.time,
        value: c.close,
      }));
      areaSeriesRef.current.setData(areaData);
    }

    volumeSeriesRef.current?.setData(volumes as any);
    maSeriesRef.current?.setData(ma7);
    ma14SeriesRef.current?.setData(ma14);

    const last = candles[candles.length - 1] as any;
    lastCandleTimeRef.current = Number(last.time);
    currentCandleRef.current = {
      time: Number(last.time),
      open: Number(last.open),
      high: Number(last.high),
      low: Number(last.low),
      close: Number(last.close),
    };

    interpolatedPriceRef.current = Number(last.close);
    targetStreamingPriceRef.current = Number(last.close);
    prevStreamingPriceRef.current = Number(last.close);
    areaCommittedTimeRef.current = Number(last.time);

    seededDataKeyRef.current = dataKey;
    hasInitializedDataRef.current = true;
    chartRef.current.timeScale().fitContent();
  }, [buildData, chartStyle, chartMs, timeframeLabel, ohlcData, priceHistory]);

  // Entry price horizontal marker line
  useEffect(() => {
    if (!entryPrice || !chartRef.current) return;
    
    const series = chartStyle === "candle" ? candleSeriesRef.current : areaSeriesRef.current;
    if (!series) return;
    
    const color = entrySide === "down" ? "#ef4444" : "#22c55e";
    const priceLine = series.createPriceLine({
      price: entryPrice,
      color,
      lineWidth: 2,
      lineStyle: 2, // Dashed
      axisLabelVisible: true,
      title: `Entry $${entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    });
    
    return () => {
      try { series.removePriceLine(priceLine); } catch {}
    };
  }, [entryPrice, entrySide, chartStyle]);

  // Target "Price to beat" line (Polymarket-style dashed line)
  useEffect(() => {
    if (!targetPrice || !chartRef.current) return;
    
    const series = chartStyle === "candle" ? candleSeriesRef.current : areaSeriesRef.current;
    if (!series) return;
    
    const priceLine = series.createPriceLine({
      price: targetPrice,
      color: "#f59e0b",
      lineWidth: 1,
      lineStyle: 2, // Dashed
      axisLabelVisible: true,
      title: "Target",
    });
    
    return () => {
      try { series.removePriceLine(priceLine); } catch {}
    };
  }, [targetPrice, chartStyle]);

  // Stop any active animation loop when chart type changes
  useEffect(() => {
    if (interpolationRef.current) {
      cancelAnimationFrame(interpolationRef.current);
      interpolationRef.current = null;
    }
    animationActiveRef.current = false;
  }, [chartStyle]);

  // Track area color direction to avoid expensive applyOptions every frame
  const areaDirectionRef = useRef<"up" | "down">("up");

  // Persistent smooth animation loop — never stops while chart is mounted
  useEffect(() => {
    if (!chartRef.current) return;
    animationActiveRef.current = true;
    let lastDotUpdate = 0;

    // For area mode: we keep a single "live tip" timestamp that only advances
    // when we explicitly commit. This prevents x-axis snapping entirely.
    let lastAreaUpdateMs = 0;
    let commitIntervalId: ReturnType<typeof setInterval> | null = null;

    if (chartStyle === "line" && areaSeriesRef.current) {
      const tf = timeframeLabel.trim().toLowerCase();
      const isFastTf = tf === "1m" || tf === "5m" || tf === "15m";
      // For fast timeframes, only advance X on *minute boundaries* to avoid micro-snaps.
      const alignSec = isFastTf ? 60 : 10;
      const intervalMs = isFastTf ? 60000 : 10000;

      commitIntervalId = setInterval(() => {
        if (!areaSeriesRef.current) return;
        const nowSec = Math.floor(Date.now() / 1000);
        const aligned = Math.floor(nowSec / alignSec) * alignSec;
        if (aligned <= areaCommittedTimeRef.current) return;

        const price = interpolatedPriceRef.current;
        if (price == null) return;

        areaSeriesRef.current.update({ time: aligned as UTCTimestamp, value: price });
        areaCommittedTimeRef.current = aligned;
      }, intervalMs);
    }

    const animate = () => {
      if (!animationActiveRef.current) return;

      const target = targetStreamingPriceRef.current;
      const current = interpolatedPriceRef.current;

      if (target != null && current != null) {
        const delta = target - current;
        // Gentle lerp (0.08) for buttery-smooth interpolation across frames
        const nextPrice = Math.abs(delta) < 0.0000001 ? target : current + delta * 0.08;
        interpolatedPriceRef.current = nextPrice;

        const nowMs = Date.now();

        if (chartStyle === "candle" && candleSeriesRef.current) {
          const nowSec = Math.floor(nowMs / 1000) as UTCTimestamp;
          const bucketSec = candleBucketSecRef.current;
          const alignedBucketTime = (Math.floor(nowSec / bucketSec) * bucketSec) as UTCTimestamp;

          const cur = currentCandleRef.current;
          if (!cur) {
            currentCandleRef.current = {
              time: alignedBucketTime,
              open: nextPrice, high: nextPrice, low: nextPrice, close: nextPrice,
            };
            lastCandleTimeRef.current = alignedBucketTime;
          } else if (alignedBucketTime > cur.time) {
            currentCandleRef.current = {
              time: alignedBucketTime,
              open: cur.close, high: nextPrice, low: nextPrice, close: nextPrice,
            };
            lastCandleTimeRef.current = alignedBucketTime;
          } else {
            cur.high = Math.max(cur.high, nextPrice);
            cur.low = Math.min(cur.low, nextPrice);
            cur.close = nextPrice;
          }

          const c = currentCandleRef.current!;
          candleSeriesRef.current.update({
            time: c.time as UTCTimestamp,
            open: c.open, high: c.high, low: c.low, close: c.close,
          });
          livePointTimeRef.current = c.time as UTCTimestamp;
        } else if (areaSeriesRef.current) {
          // Throttle chart update() to ~12fps — lightweight-charts doesn't need 60fps
          if (nowMs - lastAreaUpdateMs < 80) {
            interpolationRef.current = requestAnimationFrame(animate);
            return;
          }
          lastAreaUpdateMs = nowMs;

          // Only update color when direction actually flips
          const dir = target >= current ? "up" : "down";
          if (dir !== areaDirectionRef.current) {
            areaDirectionRef.current = dir;
            const lineColor = dir === "up" ? "#22c55e" : "#ef4444";
            const topColor = dir === "up" ? "rgba(34, 197, 94, 0.28)" : "rgba(239, 68, 68, 0.28)";
            const bottomColor = dir === "up" ? "rgba(34, 197, 94, 0.02)" : "rgba(239, 68, 68, 0.02)";
            areaSeriesRef.current.applyOptions({ lineColor, topColor, bottomColor });
          }

          // Use the committed timestamp + 1 as the "live tip" — this NEVER changes
          // between commits, so the x-axis stays perfectly still = zero horizontal snapping
          const tipTime = (areaCommittedTimeRef.current > 0
            ? areaCommittedTimeRef.current + 1
            : Math.floor(nowMs / 1000)) as UTCTimestamp;
          areaSeriesRef.current.update({ time: tipTime, value: nextPrice });
          livePointTimeRef.current = tipTime;
        }

        // Throttle dot position updates to ~30fps to reduce layout thrashing
        const now = Date.now();
        if (now - lastDotUpdate > 33 && pulsingDotRef.current && chartRef.current) {
          lastDotUpdate = now;
          const series = chartStyle === "candle" ? candleSeriesRef.current : areaSeriesRef.current;
          if (series) {
            try {
              const y = series.priceToCoordinate(nextPrice);
              const t = livePointTimeRef.current ?? (Math.floor(now / 1000) as UTCTimestamp);
              const x = chartRef.current.timeScale().timeToCoordinate(t);
              if (y !== null && x !== null) {
                pulsingDotRef.current.style.left = `${x}px`;
                pulsingDotRef.current.style.top = `${y}px`;
                pulsingDotRef.current.style.display = "block";
              }
            } catch { /* noop */ }
          }
        }
      }

      interpolationRef.current = requestAnimationFrame(animate);
    };

    interpolationRef.current = requestAnimationFrame(animate);
    return () => {
      animationActiveRef.current = false;
      if (interpolationRef.current) {
        cancelAnimationFrame(interpolationRef.current);
        interpolationRef.current = null;
      }
      if (commitIntervalId) {
        clearInterval(commitIntervalId);
      }
    };
  }, [chartStyle, timeframeLabel]);

  // Update target price on each streaming tick (does NOT restart animation)
  useEffect(() => {
    if (streamingPrice == null) return;
    const base = interpolatedPriceRef.current ?? prevStreamingPriceRef.current ?? streamingPrice;
    targetStreamingPriceRef.current = streamingPrice;
    prevStreamingPriceRef.current = streamingPrice;
    // Initialize interpolated price if first tick
    if (interpolatedPriceRef.current == null) {
      interpolatedPriceRef.current = streamingPrice;
    }
    const isUpNow = streamingPrice >= base;
    setDotColor(isUpNow ? "#22c55e" : "#ef4444");
  }, [streamingPrice]);

  // Compute P&L when bet is active
  const pnl = entryPrice && streamingPrice
    ? entrySide === "down"
      ? ((entryPrice - streamingPrice) / entryPrice) * 100
      : ((streamingPrice - entryPrice) / entryPrice) * 100
    : null;
  const pnlPositive = pnl !== null && pnl >= 0;

  return (
    <div 
      className={`${isFullscreen ? "fixed inset-0 z-50 bg-background flex flex-col" : "relative"} overflow-hidden`}
      style={isFullscreen ? { 
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      } : undefined}
    >
      {/* Resolution flash/glow overlay */}
      {resolveFlash && (
        <div
          className={`absolute inset-0 z-20 pointer-events-none rounded-lg animate-[flash_1.5s_ease-out_forwards] ${
            resolveFlash === "win"
              ? "bg-green-500/20 shadow-[inset_0_0_40px_rgba(34,197,94,0.4)]"
              : "bg-red-500/20 shadow-[inset_0_0_40px_rgba(239,68,68,0.4)]"
          }`}
        />
      )}
      {/* Streaming indicator + P&L badge */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span className="text-[9px] font-bold text-green-500 uppercase tracking-wider">Live</span>
        </div>
        {pnl !== null && (
          <div
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold backdrop-blur-sm border ${
              pnlPositive
                ? "bg-green-500/15 text-green-500 border-green-500/30"
                : "bg-red-500/15 text-red-500 border-red-500/30"
            }`}
          >
            <span>{pnlPositive ? "▲" : "▼"}</span>
            <span>{pnlPositive ? "+" : ""}{pnl.toFixed(2)}%</span>
          </div>
        )}
      </div>

      {/* Countdown timer overlay */}
      {countdown !== null && countdown > 0 && (
        <div className="absolute top-2 right-2 z-10">
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono font-bold backdrop-blur-sm border ${
              countdown <= 10
                ? "bg-red-500/15 text-red-500 border-red-500/30 animate-pulse"
                : countdown <= 30
                  ? "bg-yellow-500/15 text-yellow-500 border-yellow-500/30"
                  : "bg-muted/60 text-foreground border-border"
            }`}
          >
            <span className="text-[9px]">⏱</span>
            <span>
              {countdown >= 60
                ? `${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, "0")}`
                : `${countdown}s`}
            </span>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-1">
        <div className="flex items-center gap-2 ml-14">
          <span className="text-[10px] font-semibold text-muted-foreground">
            {timeframeLabel}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-[2px] rounded-full" style={{ backgroundColor: "hsl(45, 93%, 58%)" }} />
            <span className="text-[9px] text-muted-foreground">MA7</span>
            <span className="inline-block w-2.5 h-[2px] rounded-full" style={{ backgroundColor: "hsl(280, 80%, 65%)" }} />
            <span className="text-[9px] text-muted-foreground">MA14</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Chart style toggle */}
          <div className="flex items-center gap-0.5 bg-muted/40 rounded-md p-0.5">
            <button
              onClick={() => setChartStyle("candle")}
              className={`p-1 rounded transition-all ${chartStyle === "candle" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="Candlestick"
            >
              <CandlestickChart className="w-3 h-3" />
            </button>
            <button
              onClick={() => setChartStyle("line")}
              className={`p-1 rounded transition-all ${chartStyle === "line" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="Line chart"
            >
              <LineChart className="w-3 h-3" />
            </button>
          </div>
          {/* Drawing tools */}
          <div className="flex items-center gap-0.5 bg-muted/40 rounded-md p-0.5">
            <button
              onClick={() => setActiveTool("none")}
              className={`p-1 rounded transition-all ${activeTool === "none" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="Select (cancel drawing)"
            >
              <MousePointer className="w-3 h-3" />
            </button>
            <button
              onClick={() => setActiveTool(activeTool === "trendline" ? "none" : "trendline")}
              className={`p-1 rounded transition-all ${activeTool === "trendline" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="Trendline — click two points"
            >
              <TrendingUp className="w-3 h-3" />
            </button>
            <button
              onClick={() => setActiveTool(activeTool === "hline" ? "none" : "hline")}
              className={`p-1 rounded transition-all ${activeTool === "hline" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="Horizontal line — click price level"
            >
              <Minus className="w-3 h-3" />
            </button>
            <button
              onClick={removeLastDrawing}
              className="p-1 rounded text-muted-foreground hover:text-foreground transition-all"
              title="Undo last drawing"
            >
              <Undo2 className="w-3 h-3" />
            </button>
            <button
              onClick={clearDrawings}
              className="p-1 rounded text-muted-foreground hover:text-destructive transition-all"
              title="Clear all drawings"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          {isFullscreen && (
            <button
              onClick={() => setIsFullscreen(false)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Exit fullscreen"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main chart with pulsing dot */}
      <div className={`relative ${isFullscreen ? "flex-1" : "h-[210px]"}`}>
        <div ref={containerRef} className={`w-full h-full ${activeTool !== "none" ? "cursor-crosshair" : ""}`} />
        {/* Pulsing dot at current price */}
        <div
          ref={pulsingDotRef}
          className="absolute pointer-events-none z-10"
          style={{ display: "none", transform: "translate(-50%, -50%)" }}
        >
          <span className="relative flex h-3 w-3">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
              style={{ backgroundColor: dotColor }}
            />
            <span
              className="relative inline-flex rounded-full h-3 w-3 border-2 border-background"
              style={{ backgroundColor: dotColor }}
            />
          </span>
        </div>

        {/* Expand button – bottom center of chart */}
        {!isFullscreen && (
          <button
            onClick={() => setIsFullscreen(true)}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/80 backdrop-blur-sm border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-all shadow-md active:scale-95"
            title="Expand chart"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold">Expand</span>
          </button>
        )}

        {/* Fullscreen close button – prominent, mobile-friendly, bottom center */}
        {isFullscreen && (
          <button
            onClick={() => setIsFullscreen(false)}
            className="absolute left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm shadow-lg active:scale-95 transition-transform"
            style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
            title="Exit fullscreen"
          >
            <Minimize2 className="w-4 h-4" />
            <span>Close Fullscreen</span>
          </button>
        )}
      </div>
    </div>
  );
});

export default TradingViewChart;
