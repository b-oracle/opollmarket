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
}

const CANDLE_BUCKETS = 60;

const TradingViewChart = forwardRef<HTMLDivElement, TradingViewChartProps>(function TradingViewChart({
  priceHistory,
  ohlcData,
  chartMs,
  timeframeLabel,
}, _ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineMainSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const maSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ma14SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chartStyle, setChartStyle] = useState<"candle" | "line">("candle");

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
        value: Math.abs(c.close - c.open) * 1000, // synthetic volume from price movement
        color: c.close >= c.open ? upColor + "66" : downColor + "66",
      }));

      // MA calculations
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
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      handleScroll: { vertTouchDrag: false },
    });

    if (chartStyle === "candle") {
      candleSeriesRef.current = chart.addSeries(CandlestickSeries, { upColor: "#22c55e", downColor: "#ef4444", borderUpColor: "#22c55e", borderDownColor: "#ef4444", wickUpColor: "#22c55e", wickDownColor: "#ef4444" });
      lineMainSeriesRef.current = null;
    } else {
      lineMainSeriesRef.current = chart.addSeries(LineSeries, {
        color: "#22c55e",
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true,
      });
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

  // Update data
  useEffect(() => {
    if (!chartRef.current) return;
    const { candles, volumes, ma7, ma14 } = buildData();

    if (chartStyle === "candle" && candleSeriesRef.current) {
      candleSeriesRef.current.setData(candles);
    } else if (chartStyle === "line" && lineMainSeriesRef.current) {
      const lineData = candles.map((c: any, i: number) => {
        const prev = i > 0 ? (candles[i - 1] as any).close : c.close;
        return {
          time: c.time,
          value: c.close,
          color: c.close >= prev ? "#22c55e" : "#ef4444",
        };
      });
      lineMainSeriesRef.current.setData(lineData);
    }

    volumeSeriesRef.current?.setData(volumes as any);
    maSeriesRef.current?.setData(ma7);
    ma14SeriesRef.current?.setData(ma14);
    chartRef.current.timeScale().fitContent();
  }, [buildData, chartStyle]);

  return (
    <div className={isFullscreen ? "fixed inset-0 z-50 bg-background flex flex-col" : "relative"}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground">
            TradingView · {timeframeLabel}
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
          <button
            onClick={() => setIsFullscreen((p) => !p)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title={isFullscreen ? "Exit fullscreen" : "Expand chart"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main chart */}
      <div ref={containerRef} className={`${isFullscreen ? "flex-1" : "h-[210px]"} ${activeTool !== "none" ? "cursor-crosshair" : ""}`} />
    </div>
  );
});

export default TradingViewChart;
