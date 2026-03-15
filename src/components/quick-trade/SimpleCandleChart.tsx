import { memo, useMemo } from "react";
import type { OHLCCandle } from "@/lib/cryptoPriceProvider";

const UP = "hsl(142, 76%, 36%)";
const DOWN = "hsl(0, 84%, 60%)";
const UP_DIM = "hsl(142, 76%, 36% / 0.25)";
const DOWN_DIM = "hsl(0, 84%, 60% / 0.25)";
const GRID = "hsl(var(--border) / 0.25)";
const ENTRY_COLOR = "#f59e0b";
const MA7_COLOR = "hsl(45, 93%, 58%)";
const MA14_COLOR = "hsl(280, 80%, 65%)";

const CHART_H = 220;
const PRICE_RATIO = 0.78;
const PRICE_H = Math.floor(CHART_H * PRICE_RATIO);
const VOL_H = CHART_H - PRICE_H;
const PAD_TOP = 6;
const PAD_BOT = 2;

interface Props {
  ohlcData?: OHLCCandle[];
  priceHistory?: { time: string; price: number; ts: number }[];
  entryPrice: number | null;
  assetClass?: string;
  streamingPrice: number | null;
  chartMs?: number;
  /** Pre-computed MA values from chart engine, one per candle */
  precomputedMAs?: { ma7?: number; ma14?: number }[];
}

function fmtAxis(p: number, ac?: string): string {
  if (ac === "forex") return p.toFixed(4);
  if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function synthesizeCandles(
  priceHistory: { ts: number; price: number }[],
  chartMs: number,
  maxCandles = 60
): OHLCCandle[] {
  if (priceHistory.length < 2) return [];
  const sorted = [...priceHistory].sort((a, b) => a.ts - b.ts);
  const bucketMs = Math.max(chartMs / maxCandles, 5000);
  const buckets = new Map<number, { o: number; h: number; l: number; c: number; t: number }>();

  for (const pt of sorted) {
    const bs = Math.floor(pt.ts / bucketMs) * bucketMs;
    const ex = buckets.get(bs);
    if (ex) {
      ex.h = Math.max(ex.h, pt.price);
      ex.l = Math.min(ex.l, pt.price);
      ex.c = pt.price;
    } else {
      buckets.set(bs, { o: pt.price, h: pt.price, l: pt.price, c: pt.price, t: bs });
    }
  }

  return [...buckets.values()]
    .sort((a, b) => a.t - b.t)
    .slice(-maxCandles)
    .map(b => ({ time: b.t / 1000, open: b.o, high: b.h, low: b.l, close: b.c }));
}

function priceToY(p: number, domainMin: number, domainRange: number): number {
  return PAD_TOP + (PRICE_H - PAD_TOP - PAD_BOT) * (1 - (p - domainMin) / domainRange);
}

function SimpleCandleChart({ ohlcData, priceHistory, entryPrice, assetClass, streamingPrice, chartMs, precomputedMAs }: Props) {
  const candles = useMemo(() => {
    if (ohlcData && ohlcData.length >= 2) {
      const slice = ohlcData.slice(-60);
      if (streamingPrice != null && slice.length > 0) {
        const last = { ...slice[slice.length - 1] };
        last.close = streamingPrice;
        last.high = Math.max(last.high, streamingPrice);
        last.low = Math.min(last.low, streamingPrice);
        return [...slice.slice(0, -1), last];
      }
      return slice;
    }
    if (priceHistory && priceHistory.length >= 2 && chartMs) {
      return synthesizeCandles(priceHistory, chartMs);
    }
    return [];
  }, [ohlcData, priceHistory, streamingPrice, chartMs]);

  const n = candles.length;

  const { domainMin, domainMax, domainRange, gridLevels, ma7Pts, ma14Pts, volMax } = useMemo(() => {
    if (n < 2) return { domainMin: 0, domainMax: 1, domainRange: 1, gridLevels: [] as number[], ma7Pts: null as string | null, ma14Pts: null as string | null, volMax: 1 };

    let lo = Infinity, hi = -Infinity;
    for (const c of candles) {
      if (c.low < lo) lo = c.low;
      if (c.high > hi) hi = c.high;
    }
    const pad = (hi - lo) * 0.08 || 0.5;
    const dMin = lo - pad;
    const dMax = hi + pad;
    const dRange = dMax - dMin;

    const step = dRange / 5;
    const gl: number[] = [];
    for (let i = 1; i <= 4; i++) gl.push(dMin + step * i);

    // Volume proxy: candle range
    const vols = candles.map(c => Math.abs(c.high - c.low) || 0.001);
    const vMax = Math.max(...vols, 0.001);

    // MAs — use precomputed from engine if available
    const computeMAFromEngine = (key: "ma7" | "ma14"): string | null => {
      if (!precomputedMAs || precomputedMAs.length !== n) return null;
      const pts: string[] = [];
      for (let i = 0; i < n; i++) {
        const val = precomputedMAs[i]?.[key];
        if (val == null) continue;
        const x = (i / n) * 85 + 85 / n / 2;
        const y = priceToY(val, dMin, dRange);
        pts.push(`${x},${y}`);
      }
      return pts.length >= 2 ? pts.join(" ") : null;
    };

    const computeMA = (period: number): string | null => {
      const pts: string[] = [];
      for (let i = 0; i < n; i++) {
        if (i < period - 1) continue;
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
        const avg = sum / period;
        const x = (i / n) * 85 + 85 / n / 2;
        const y = priceToY(avg, dMin, dRange);
        pts.push(`${x},${y}`);
      }
      return pts.length >= 2 ? pts.join(" ") : null;
    };

    const ma7Result = computeMAFromEngine("ma7") ?? computeMA(7);
    const ma14Result = computeMAFromEngine("ma14") ?? computeMA(14);

    return { domainMin: dMin, domainMax: dMax, domainRange: dRange, gridLevels: gl, ma7Pts: ma7Result, ma14Pts: ma14Result, volMax: vMax };
  }, [candles, n, precomputedMAs]);

  if (n < 2) return null;

  const lastCandle = candles[n - 1];
  const isLastBull = lastCandle.close >= lastCandle.open;
  const vols = candles.map(c => Math.abs(c.high - c.low) || 0.001);

  return (
    <div className="w-full select-none relative" style={{ height: CHART_H }}>
      <svg viewBox={`0 0 100 ${CHART_H}`} preserveAspectRatio="none" className="w-full h-full" style={{ overflow: "visible" }}>
        {/* Grid */}
        {gridLevels.map((level, i) => (
          <line key={i} x1={0} y1={priceToY(level, domainMin, domainRange)} x2={85} y2={priceToY(level, domainMin, domainRange)} stroke={GRID} strokeWidth={0.15} strokeDasharray="0.5 0.5" />
        ))}

        {/* Volume separator */}
        <line x1={0} y1={PRICE_H} x2={85} y2={PRICE_H} stroke={GRID} strokeWidth={0.15} />

        {/* Volume bars — constrained to 0–85 range */}
        {candles.map((c, i) => {
          const barW = (85 / n) * 0.7;
          const x = (i / n) * 85 + (85 / n) * 0.15;
          const volH = (vols[i] / volMax) * (VOL_H - 4);
          return (
            <rect key={`v${i}`} x={x} y={PRICE_H + (VOL_H - volH - 2)} width={barW} height={Math.max(volH, 0.3)} fill={c.close >= c.open ? UP_DIM : DOWN_DIM} rx={0.2} />
          );
        })}

        {/* Candle sticks — constrained to 0–85 range */}
        {candles.map((c, i) => {
          const slotW = 85 / n;
          const cx = i * slotW + slotW / 2;
          const bodyW = slotW * 0.55;
          const bull = c.close >= c.open;
          const fill = bull ? UP : DOWN;

          const wickTop = priceToY(c.high, domainMin, domainRange);
          const wickBot = priceToY(c.low, domainMin, domainRange);
          const bodyTop = priceToY(Math.max(c.open, c.close), domainMin, domainRange);
          const bodyBot = priceToY(Math.min(c.open, c.close), domainMin, domainRange);
          const bodyH = Math.max(bodyBot - bodyTop, 0.4);

          return (
            <g key={`c${i}`}>
              <line x1={cx} y1={wickTop} x2={cx} y2={wickBot} stroke={fill} strokeWidth={0.2} strokeOpacity={0.9} />
              <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={fill} rx={0.15} />
            </g>
          );
        })}

        {/* MA7 */}
        {ma7Pts && <polyline points={ma7Pts} fill="none" stroke={MA7_COLOR} strokeWidth={0.4} strokeLinejoin="round" />}

        {/* MA14 */}
        {ma14Pts && <polyline points={ma14Pts} fill="none" stroke={MA14_COLOR} strokeWidth={0.4} strokeLinejoin="round" />}

        {/* Entry price line */}
        {entryPrice != null && entryPrice >= domainMin && entryPrice <= domainMax && (
          <line x1={0} y1={priceToY(entryPrice, domainMin, domainRange)} x2={85} y2={priceToY(entryPrice, domainMin, domainRange)} stroke={ENTRY_COLOR} strokeWidth={0.25} strokeDasharray="0.8 0.4" strokeOpacity={0.9} />
        )}

        {/* Current price dotted line */}
        <line
          x1={((n - 1) / n) * 85 + 85 / n / 2}
          y1={priceToY(lastCandle.close, domainMin, domainRange)}
          x2={85}
          y2={priceToY(lastCandle.close, domainMin, domainRange)}
          stroke={isLastBull ? UP : DOWN}
          strokeWidth={0.2} strokeDasharray="0.4 0.3" strokeOpacity={0.6}
        />
      </svg>

      {/* Price axis labels */}
      <div className="absolute right-0 top-0 bottom-0 pointer-events-none" style={{ width: 48 }}>
        {gridLevels.map((level, i) => {
          const yPct = (priceToY(level, domainMin, domainRange) / CHART_H) * 100;
          return (
            <span key={i} className="absolute text-[8px] tabular-nums text-muted-foreground text-right pr-1 leading-none" style={{ top: `${yPct}%`, transform: "translateY(-50%)", right: 0 }}>
              {fmtAxis(level, assetClass)}
            </span>
          );
        })}
      </div>

      {/* Current price badge */}
      <div
        className="absolute right-0 px-1.5 py-0.5 rounded-sm text-[8px] font-bold tabular-nums transition-all duration-300 ease-out"
        style={{
          top: `${(priceToY(lastCandle.close, domainMin, domainRange) / CHART_H) * 100}%`,
          transform: "translateY(-50%)",
          backgroundColor: isLastBull ? UP : DOWN,
          color: "white",
        }}
      >
        {fmtAxis(lastCandle.close, assetClass)}
      </div>

      {/* Entry price badge */}
      {entryPrice != null && entryPrice >= domainMin && entryPrice <= domainMax && (
        <div
          className="absolute right-0 px-1.5 py-0.5 rounded-sm text-[8px] font-bold tabular-nums"
          style={{
            top: `${(priceToY(entryPrice, domainMin, domainRange) / CHART_H) * 100}%`,
            transform: "translateY(-50%)",
            backgroundColor: ENTRY_COLOR,
            color: "white",
          }}
        >
          {fmtAxis(entryPrice, assetClass)}
        </div>
      )}

      {/* MA legend */}
      <div className="absolute bottom-1 left-1 flex items-center gap-2 pointer-events-none">
        <span className="text-[7px] font-semibold opacity-70" style={{ color: MA7_COLOR }}>MA7</span>
        <span className="text-[7px] font-semibold opacity-70" style={{ color: MA14_COLOR }}>MA14</span>
      </div>
    </div>
  );
}

export default memo(SimpleCandleChart);
