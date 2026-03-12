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
  const lastUpdateTimeRef = useRef<number>(0);

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

    // Prefer real OHLC data from exchange APIs
    if (ohlcData && ohlcData.length > 0) {
      const candles: CandlestickData[] = ohlcData.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      const volumes: { time: UTCTimestamp; value: number; color: string }[] = ohlcData.map((c) => ({
        time: c.time as UTCTimestamp,
        value: Math.abs(c.close - c.open) * 1000,
        color: c.close >= c.open ? upColor + "66" : downColor + "66",
      }));

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

    // Fallback: bucket raw price points into candles
    if (!priceHistory) return { candles: [], volumes: [], ma7: [], ma14: [] };
    const cutoff = Date.now() - chartMs;
    const filtered = priceHistory.filter((pt) => pt.ts >= cutoff);
    if (filtered.length < 2) return { candles: [], volumes: [], ma7: [], ma14: [] };

    const bucketMs = Math.max(Math.floor(chartMs / CANDLE_BUCKETS), 3000);
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
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.2 } },
      timeScale: { 
        borderVisible: false, 
        timeVisible: true, 
        secondsVisible: true,
        rightOffset: 5, // space on the right for streaming
        shiftVisibleRangeOnNewBar: true, // auto-scroll on new data
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
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; };
  }, [isDark, chartStyle]);

  // Set initial data
  useEffect(() => {
    if (!chartRef.current) return;
    const { candles, volumes, ma7, ma14 } = buildData();

    if (chartStyle === "candle" && candleSeriesRef.current) {
      candleSeriesRef.current.setData(candles);
    } else if (chartStyle === "line" && areaSeriesRef.current) {
      // Convert candles to area data points
      const areaData = candles.map((c: any) => ({
        time: c.time,
        value: c.close,
      }));
      areaSeriesRef.current.setData(areaData);
    }

    volumeSeriesRef.current?.setData(volumes as any);
    maSeriesRef.current?.setData(ma7);
    ma14SeriesRef.current?.setData(ma14);
    
    // Track last candle time for streaming updates
    if (candles.length > 0) {
      lastCandleTimeRef.current = candles[candles.length - 1].time as number;
    }
    
    chartRef.current.timeScale().fitContent();
  }, [buildData, chartStyle]);

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

  useEffect(() => {
    if (!streamingPrice || !chartRef.current) return;
    
    const nowSec = Math.floor(Date.now() / 1000) as UTCTimestamp;
    const prevPrice = prevStreamingPriceRef.current;
    const isUp = prevPrice === null || streamingPrice >= prevPrice;
    
    if (chartStyle === "candle" && candleSeriesRef.current) {
      const bucketSec = 10;
      const candleTime = (Math.floor(nowSec / bucketSec) * bucketSec) as UTCTimestamp;
      
      if (candleTime > lastCandleTimeRef.current) {
        candleSeriesRef.current.update({
          time: candleTime,
          open: streamingPrice,
          high: streamingPrice,
          low: streamingPrice,
          close: streamingPrice,
        });
        lastCandleTimeRef.current = candleTime;
      } else {
        candleSeriesRef.current.update({
          time: candleTime,
          open: streamingPrice,
          high: streamingPrice,
          low: streamingPrice,
          close: streamingPrice,
        });
      }
    } else if (areaSeriesRef.current) {
      // Dynamic green/red coloring based on price direction
      const greenLine = "#22c55e";
      const redLine = "#ef4444";
      const lineColor = isUp ? greenLine : redLine;
      const topColor = isUp ? "rgba(34, 197, 94, 0.28)" : "rgba(239, 68, 68, 0.28)";
      const bottomColor = isUp ? "rgba(34, 197, 94, 0.02)" : "rgba(239, 68, 68, 0.02)";
      
      areaSeriesRef.current.applyOptions({
        lineColor,
        topColor,
        bottomColor,
      });
      
      areaSeriesRef.current.update({
        time: nowSec,
        value: streamingPrice,
      });
    }
    
    // Position the pulsing dot at the last data point
    setDotColor(isUp ? "#22c55e" : "#ef4444");
    if (pulsingDotRef.current && chartRef.current) {
      const series = chartStyle === "candle" ? candleSeriesRef.current : areaSeriesRef.current;
      if (series) {
        try {
          const y = series.priceToCoordinate(streamingPrice);
          const timeScale = chartRef.current.timeScale();
          const x = timeScale.timeToCoordinate(nowSec);
          if (y !== null && x !== null) {
            pulsingDotRef.current.style.left = `${x}px`;
            pulsingDotRef.current.style.top = `${y}px`;
            pulsingDotRef.current.style.display = "block";
          }
        } catch { /* coordinate not available yet */ }
      }
    }
    
    prevStreamingPriceRef.current = streamingPrice;
  }, [streamingPrice, chartStyle]);

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
