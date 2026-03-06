import { useEffect, useRef, useState, useCallback } from "react";
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
} from "lightweight-charts";
import { Maximize2, Minimize2, TrendingUp, Minus, Trash2, Undo2, MousePointer } from "lucide-react";
import { useChartDrawings, type DrawingTool } from "@/hooks/useChartDrawings";

interface PricePoint {
  ts: number;
  price: number;
}

interface TradingViewChartProps {
  priceHistory: PricePoint[];
  chartMs: number;
  timeframeLabel: string;
}

const CANDLE_BUCKETS = 60;
const RSI_PERIOD = 14;
const MACD_FAST = 12;
const MACD_SLOW = 26;
const MACD_SIGNAL = 9;

function calcEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

export default function TradingViewChart({
  priceHistory,
  chartMs,
  timeframeLabel,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const maSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ma14SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [indicator, setIndicator] = useState<"rsi" | "macd">("rsi");

  const { activeTool, setActiveTool, clearDrawings, removeLastDrawing } =
    useChartDrawings(chartRef, candleSeriesRef, containerRef);

  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  const buildData = useCallback(() => {
    const cutoff = Date.now() - chartMs;
    const filtered = priceHistory.filter((pt) => pt.ts >= cutoff);
    if (filtered.length < 2) return { candles: [], volumes: [], ma7: [], ma14: [], rsi: [], macdLine: [], macdSignal: [], macdHist: [] };

    const bucketMs = Math.max(Math.floor(chartMs / CANDLE_BUCKETS), 3000);
    const candles: CandlestickData[] = [];
    const volumes: { time: UTCTimestamp; value: number; color: string }[] = [];
    let bucketStart = filtered[0].ts;
    let bucket: number[] = [];
    const upColor = "#22c55e";
    const downColor = "#ef4444";

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

    // MA
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

    // RSI
    const closes = candles.map((c: any) => c.close);
    const rsi: { time: UTCTimestamp; value: number }[] = [];
    if (closes.length > RSI_PERIOD) {
      let avgGain = 0, avgLoss = 0;
      for (let i = 1; i <= RSI_PERIOD; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) avgGain += diff; else avgLoss -= diff;
      }
      avgGain /= RSI_PERIOD;
      avgLoss /= RSI_PERIOD;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push({ time: candles[RSI_PERIOD].time as UTCTimestamp, value: 100 - 100 / (1 + rs) });

      for (let i = RSI_PERIOD + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        avgGain = (avgGain * (RSI_PERIOD - 1) + (diff > 0 ? diff : 0)) / RSI_PERIOD;
        avgLoss = (avgLoss * (RSI_PERIOD - 1) + (diff < 0 ? -diff : 0)) / RSI_PERIOD;
        const rs2 = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi.push({ time: candles[i].time as UTCTimestamp, value: 100 - 100 / (1 + rs2) });
      }
    }

    // MACD
    const macdLine: { time: UTCTimestamp; value: number }[] = [];
    const macdSignal: { time: UTCTimestamp; value: number }[] = [];
    const macdHist: { time: UTCTimestamp; value: number; color: string }[] = [];
    if (closes.length >= MACD_SLOW) {
      const emaFast = calcEMA(closes, MACD_FAST);
      const emaSlow = calcEMA(closes, MACD_SLOW);
      const macdValues: number[] = [];
      for (let i = MACD_SLOW - 1; i < closes.length; i++) {
        macdValues.push(emaFast[i] - emaSlow[i]);
        macdLine.push({ time: candles[i].time as UTCTimestamp, value: emaFast[i] - emaSlow[i] });
      }
      if (macdValues.length >= MACD_SIGNAL) {
        const signalEma = calcEMA(macdValues, MACD_SIGNAL);
        for (let i = 0; i < signalEma.length; i++) {
          const idx = MACD_SLOW - 1 + i;
          macdSignal.push({ time: candles[idx].time as UTCTimestamp, value: signalEma[i] });
          const histVal = macdValues[i] - signalEma[i];
          macdHist.push({ time: candles[idx].time as UTCTimestamp, value: histVal, color: histVal >= 0 ? upColor + "99" : downColor + "99" });
        }
      }
    }

    return { candles, volumes, ma7, ma14, rsi, macdLine, macdSignal, macdHist };
  }, [priceHistory, chartMs]);

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

    candleSeriesRef.current = chart.addSeries(CandlestickSeries, { upColor: "#22c55e", downColor: "#ef4444", borderUpColor: "#22c55e", borderDownColor: "#ef4444", wickUpColor: "#22c55e", wickDownColor: "#ef4444" });
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
  }, [isDark]);

  // Create indicator chart
  useEffect(() => {
    if (!rsiContainerRef.current) return;
    const chart = createChart(rsiContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: isDark ? "#9ca3af" : "#6b7280", fontSize: 9 },
      grid: { vertLines: { color: isDark ? "#27272a" : "#f1f1f1" }, horzLines: { color: isDark ? "#27272a" : "#f1f1f1" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.05, bottom: 0.05 } },
      timeScale: { borderVisible: false, visible: false },
      handleScroll: { vertTouchDrag: false },
    });

    if (indicator === "rsi") {
      rsiSeriesRef.current = chart.addSeries(LineSeries, { color: "hsl(210, 90%, 60%)", lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
      macdLineRef.current = null;
      macdSignalRef.current = null;
      macdHistRef.current = null;
    } else {
      macdLineRef.current = chart.addSeries(LineSeries, { color: "hsl(210, 90%, 60%)", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
      macdSignalRef.current = chart.addSeries(LineSeries, { color: "hsl(0, 80%, 60%)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      macdHistRef.current = chart.addSeries(HistogramSeries, { priceScaleId: "macdHist", priceLineVisible: false, lastValueVisible: false });
      chart.priceScale("macdHist").applyOptions({ scaleMargins: { top: 0.6, bottom: 0 } });
      rsiSeriesRef.current = null;
    }

    rsiChartRef.current = chart;
    const ro = new ResizeObserver(() => {
      if (rsiContainerRef.current) chart.applyOptions({ width: rsiContainerRef.current.clientWidth, height: rsiContainerRef.current.clientHeight });
    });
    ro.observe(rsiContainerRef.current);

    // Sync time scales
    if (chartRef.current) {
      const mainTs = chartRef.current.timeScale();
      const indTs = chart.timeScale();
      let syncing = false;
      mainTs.subscribeVisibleLogicalRangeChange((range) => {
        if (syncing || !range) return;
        syncing = true;
        indTs.setVisibleLogicalRange(range);
        syncing = false;
      });
      indTs.subscribeVisibleLogicalRangeChange((range) => {
        if (syncing || !range) return;
        syncing = true;
        mainTs.setVisibleLogicalRange(range);
        syncing = false;
      });
    }

    return () => { ro.disconnect(); chart.remove(); rsiChartRef.current = null; };
  }, [isDark, indicator]);

  // Update data
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;
    const { candles, volumes, ma7, ma14, rsi, macdLine, macdSignal, macdHist } = buildData();
    candleSeriesRef.current.setData(candles);
    volumeSeriesRef.current?.setData(volumes as any);
    maSeriesRef.current?.setData(ma7);
    ma14SeriesRef.current?.setData(ma14);
    rsiSeriesRef.current?.setData(rsi);
    macdLineRef.current?.setData(macdLine);
    macdSignalRef.current?.setData(macdSignal);
    macdHistRef.current?.setData(macdHist as any);
    chartRef.current.timeScale().fitContent();
    rsiChartRef.current?.timeScale().fitContent();
  }, [buildData, indicator]);

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
          {/* Drawing tools */}
          <div className="flex items-center gap-0.5 bg-muted/40 rounded-md p-0.5">
            <button
              onClick={() => setActiveTool(activeTool === "none" ? "none" : "none")}
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
          {/* Indicator toggle */}
          <div className="flex items-center gap-0.5 bg-muted/40 rounded-md p-0.5">
            <button
              onClick={() => setIndicator("rsi")}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all ${indicator === "rsi" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              RSI
            </button>
            <button
              onClick={() => setIndicator("macd")}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all ${indicator === "macd" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              MACD
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
      <div ref={containerRef} className={`${isFullscreen ? "flex-1" : "h-[150px]"} ${activeTool !== "none" ? "cursor-crosshair" : ""}`} />

      {/* Indicator separator */}
      <div className="flex items-center gap-1.5 px-2 py-0.5">
        <span className="text-[9px] font-semibold text-muted-foreground uppercase">{indicator}</span>
        {indicator === "rsi" && (
          <span className="text-[8px] text-muted-foreground">(14)</span>
        )}
        {indicator === "macd" && (
          <span className="text-[8px] text-muted-foreground">(12, 26, 9)</span>
        )}
        <div className="flex-1 border-t border-border/50" />
      </div>

      {/* Indicator chart */}
      <div ref={rsiContainerRef} className={isFullscreen ? "h-[120px]" : "h-[60px]"} />
    </div>
  );
}
