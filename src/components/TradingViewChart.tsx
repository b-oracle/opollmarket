import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type UTCTimestamp,
  ColorType,
  CrosshairMode,
} from "lightweight-charts";
import { Maximize2, Minimize2 } from "lucide-react";

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

export default function TradingViewChart({
  priceHistory,
  chartMs,
  timeframeLabel,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const maSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ma14SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  // Build candle data from price history
  const buildData = useCallback(() => {
    const cutoff = Date.now() - chartMs;
    const filtered = priceHistory.filter((pt) => pt.ts >= cutoff);
    if (filtered.length < 2) return { candles: [], volumes: [], ma7: [], ma14: [] };

    const bucketMs = Math.max(Math.floor(chartMs / CANDLE_BUCKETS), 3000);
    const candles: CandlestickData[] = [];
    const volumes: { time: UTCTimestamp; value: number; color: string }[] = [];
    let bucketStart = filtered[0].ts;
    let bucket: number[] = [];

    const upColor = "#22c55e";
    const downColor = "#ef4444";

    const flush = () => {
      if (!bucket.length) return;
      const o = bucket[0];
      const c = bucket[bucket.length - 1];
      const h = Math.max(...bucket);
      const l = Math.min(...bucket);
      const time = (Math.floor(bucketStart / 1000) as UTCTimestamp);
      const isBull = c >= o;
      candles.push({
        time,
        open: o,
        high: h,
        low: l,
        close: c,
      });
      volumes.push({
        time,
        value: bucket.length,
        color: isBull ? upColor + "66" : downColor + "66",
      });
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
  }, [priceHistory, chartMs]);

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDark ? "#9ca3af" : "#6b7280",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: isDark ? "#27272a" : "#f1f1f1" },
        horzLines: { color: isDark ? "#27272a" : "#f1f1f1" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    const maSeries = chart.addLineSeries({
      color: "hsl(45, 93%, 58%)",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const ma14Series = chart.addLineSeries({
      color: "hsl(280, 80%, 65%)",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    maSeriesRef.current = maSeries;
    ma14SeriesRef.current = ma14Series;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [isDark]);

  // Update data
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;
    const { candles, volumes, ma7, ma14 } = buildData();
    candleSeriesRef.current.setData(candles);
    volumeSeriesRef.current?.setData(volumes as any);
    maSeriesRef.current?.setData(ma7);
    ma14SeriesRef.current?.setData(ma14);
    chartRef.current.timeScale().fitContent();
  }, [buildData]);

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-50 bg-background flex flex-col"
          : "relative"
      }
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground">
            TradingView · {timeframeLabel}
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-[2px] rounded-full"
              style={{ backgroundColor: "hsl(45, 93%, 58%)" }}
            />
            <span className="text-[9px] text-muted-foreground">MA7</span>
            <span
              className="inline-block w-2.5 h-[2px] rounded-full"
              style={{ backgroundColor: "hsl(280, 80%, 65%)" }}
            />
            <span className="text-[9px] text-muted-foreground">MA14</span>
          </div>
        </div>
        <button
          onClick={toggleFullscreen}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title={isFullscreen ? "Exit fullscreen" : "Expand chart"}
        >
          {isFullscreen ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
      <div
        ref={containerRef}
        className={isFullscreen ? "flex-1" : "h-[180px]"}
      />
    </div>
  );
}
