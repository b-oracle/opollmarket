/**
 * React hook that wires the ChartEngine to live tick streams.
 * Produces candles and line points for the chart renderer.
 * 
 * KEY DESIGN: The engine is only re-initialized when asset/timeframe truly changes
 * (via historyVersion). Streaming ticks are processed incrementally via processTick().
 * This prevents the "scatter/refresh" effect caused by repeated initFromHistory calls.
 */

import { useRef, useState, useEffect, useMemo } from "react";
import { ChartEngine, getTimeframeMs, type Candle, type LinePoint } from "@/lib/chartEngine";

interface UseChartEngineOptions {
  /** Chart timeframe key: "1m", "5m", "15m", "1h", "4h", "1d" */
  chartTimeframe: string;
  /** Historical price data points (seed data — should be stable between ticks) */
  priceHistory: { ts: number; price: number }[];
  /** Live streaming price (updates frequently) */
  streamingPrice: number | null;
  /** Whether history is still loading */
  historyLoading: boolean;
  /** Explicit version counter — engine re-inits ONLY when this changes */
  historyVersion?: number;
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
  historyVersion = 0,
}: UseChartEngineOptions): UseChartEngineResult {
  const tfMs = useMemo(() => getTimeframeMs(chartTimeframe), [chartTimeframe]);
  const engineRef = useRef<ChartEngine | null>(null);
  const [version, setVersion] = useState(0);
  const seededVersionRef = useRef(-1);

  // Create/recreate engine when timeframe changes
  useEffect(() => {
    const engine = new ChartEngine(tfMs, 200, 10000);
    engine.setOnChange(() => setVersion(v => v + 1));
    engineRef.current = engine;
    seededVersionRef.current = -1;
    setVersion(0);
  }, [tfMs]);

  // Initialize from history ONLY when historyVersion changes (asset switch, timeframe switch, reconnect)
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || historyLoading || priceHistory.length < 2) return;

    // Only re-seed if historyVersion actually changed
    if (seededVersionRef.current === historyVersion) return;
    seededVersionRef.current = historyVersion;

    engine.initFromHistory(priceHistory);
  }, [priceHistory, historyLoading, historyVersion]);

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

  // Derive render data from engine — only recomputes on version/countdown changes
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
      ready: candles.length >= 1,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, countdown, progress]);

  return result;
}
