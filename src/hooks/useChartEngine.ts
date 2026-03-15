/**
 * React hook that wires the ChartEngine to live tick streams.
 * Produces candles and line points for the chart renderer.
 */

import { useRef, useState, useEffect, useMemo } from "react";
import { ChartEngine, getTimeframeMs, type Candle, type LinePoint } from "@/lib/chartEngine";

interface UseChartEngineOptions {
  /** Chart timeframe key: "1m", "5m", "15m", "1h", "4h", "1d" */
  chartTimeframe: string;
  /** Historical price data points */
  priceHistory: { ts: number; price: number }[];
  /** Live streaming price (updates frequently) */
  streamingPrice: number | null;
  /** Whether history is still loading */
  historyLoading: boolean;
}

interface UseChartEngineResult {
  /** All candles (closed + active) with MAs */
  candles: Candle[];
  /** Line chart points */
  linePoints: LinePoint[];
  /** Active candle (last in candles array, closed=false) */
  activeCandle: Candle | null;
  /** Time remaining in current bucket (ms) */
  bucketCountdown: number;
  /** Bucket progress 0-1 */
  bucketProgress: number;
  /** Whether engine has enough data */
  ready: boolean;
}

export function useChartEngine({
  chartTimeframe,
  priceHistory,
  streamingPrice,
  historyLoading,
}: UseChartEngineOptions): UseChartEngineResult {
  const tfMs = useMemo(() => getTimeframeMs(chartTimeframe), [chartTimeframe]);
  const engineRef = useRef<ChartEngine | null>(null);
  const [version, setVersion] = useState(0);
  const historyInitializedRef = useRef<string>("");

  // Create/recreate engine when timeframe changes
  useEffect(() => {
    const engine = new ChartEngine(tfMs, 200, 10000);
    engine.setOnChange(() => setVersion(v => v + 1));
    engineRef.current = engine;
    historyInitializedRef.current = "";
    setVersion(0);
  }, [tfMs]);

  // Initialize from history when it arrives
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || historyLoading || priceHistory.length < 2) return;

    // Use first+last ts for a more robust dedup key
    const first = priceHistory[0];
    const last = priceHistory[priceHistory.length - 1];
    const histKey = `${chartTimeframe}:${priceHistory.length}:${first?.ts}:${last?.ts}`;
    if (historyInitializedRef.current === histKey) return;
    historyInitializedRef.current = histKey;

    engine.initFromHistory(priceHistory);
  }, [priceHistory, historyLoading, chartTimeframe]);

  // Process streaming ticks — throttle to max 25fps to avoid over-rendering
  const lastProcessedPriceRef = useRef<number>(0);
  const lastProcessedTimeRef = useRef<number>(0);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || streamingPrice == null || streamingPrice === 0) return;

    // Avoid processing exact same price
    if (streamingPrice === lastProcessedPriceRef.current) return;
    
    // Throttle: max one tick per 40ms (25fps)
    const now = Date.now();
    if (now - lastProcessedTimeRef.current < 40) return;
    
    lastProcessedPriceRef.current = streamingPrice;
    lastProcessedTimeRef.current = now;

    engine.processTick(streamingPrice);
  }, [streamingPrice]);

  // Bucket countdown timer (updates every second)
  const [countdown, setCountdown] = useState(0);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const update = () => {
      const engine = engineRef.current;
      if (!engine) return;
      setCountdown(engine.getBucketCountdown());
      const info = engine.getActiveBucketInfo();
      setProgress(info?.progress ?? 0);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [tfMs]);

  // Derive render data from engine — only recomputes on version/countdown/progress changes
  const result = useMemo((): UseChartEngineResult => {
    const engine = engineRef.current;
    if (!engine) {
      return { candles: [], linePoints: [], activeCandle: null, bucketCountdown: 0, bucketProgress: 0, ready: false };
    }

    const candles = engine.getCandlesWithMAs();
    const linePoints = engine.getLinePoints();
    const state = engine.getState();

    return {
      candles,
      linePoints,
      activeCandle: state.activeCandle,
      bucketCountdown: countdown,
      bucketProgress: progress,
      ready: candles.length >= 2,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, countdown, progress]);

  return result;
}