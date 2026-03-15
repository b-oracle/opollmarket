import { useMemo, useCallback, memo, forwardRef } from "react";
import type { Candle } from "@/lib/chartEngine";

// ── Colors ──
const UP_COLOR = "hsl(142, 76%, 36%)";
const DOWN_COLOR = "hsl(0, 84%, 60%)";
const UP_COLOR_DIM = "hsl(142, 76%, 36% / 0.25)";
const DOWN_COLOR_DIM = "hsl(0, 84%, 60% / 0.25)";
const GRID_COLOR = "hsl(var(--border) / 0.3)";
const MA7_COLOR = "hsl(45, 93%, 58%)";
const MA14_COLOR = "hsl(280, 80%, 65%)";
const ENTRY_COLOR = "#f59e0b";
const ACTIVE_GLOW = "hsl(45, 93%, 58% / 0.15)";

interface SVGCandleChartProps {
  candles: Candle[];
  entryPrice: number | null;
  assetClass?: string;
  timeframeLabel: string;
}

/** Format price for axis labels */
function fmtAxis(p: number, assetClass?: string): string {
  if (assetClass === "forex") return p.toFixed(4);
  if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

/** Memoized single candle stick — uses domain params instead of function ref for stable memo */
const CandleStick = memo(function CandleStick({
  c, i, n, domainMin, domainRange, priceH, paddingTop, paddingBottom, isActive,
}: {
  c: Candle; i: number; n: number; domainMin: number; domainRange: number;
  priceH: number; paddingTop: number; paddingBottom: number; isActive: boolean;
}) {
  const priceY = (p: number) => paddingTop + (priceH - paddingTop - paddingBottom) * (1 - (p - domainMin) / domainRange);
  const slotW = 100 / n;
  const centerX = i * slotW + slotW / 2;
  const bodyW = slotW * 0.55;
  const isBull = c.close >= c.open;
  const fill = isBull ? UP_COLOR : DOWN_COLOR;

  const wickTop = priceY(c.high);
  const wickBot = priceY(c.low);
  const bodyTop = priceY(Math.max(c.open, c.close));
  const bodyBot = priceY(Math.min(c.open, c.close));
  const bodyH = Math.max(bodyBot - bodyTop, 0.4);

  return (
    <g>
      <line
        x1={centerX} y1={wickTop} x2={centerX} y2={wickBot}
        stroke={fill} strokeWidth={isActive ? 0.3 : 0.2} strokeOpacity={0.9}
      />
      <rect
        x={centerX - bodyW / 2} y={bodyTop}
        width={bodyW} height={bodyH}
        fill={fill} rx={0.15}
        style={isActive ? { transition: "y 150ms ease-out, height 150ms ease-out" } : undefined}
      />
    </g>
  );
});

function SVGCandleChart({ candles, entryPrice, assetClass, timeframeLabel }: SVGCandleChartProps) {
  const CHART_HEIGHT = 220;
  const PRICE_AREA_RATIO = 0.75;
  const PRICE_H = Math.floor(CHART_HEIGHT * PRICE_AREA_RATIO);
  const VOL_H = CHART_HEIGHT - PRICE_H;
  const PADDING_TOP = 6;
  const PADDING_BOTTOM = 2;

  const n = candles.length;

  // Memoize price domain computation
  const { domainMin, domainMax, domainRange, maxVol } = useMemo(() => {
    if (n < 2) return { domainMin: 0, domainMax: 1, domainRange: 1, maxVol: 1 };
    let pMin = Infinity, pMax = -Infinity, mVol = 1;
    for (const c of candles) {
      if (c.low < pMin) pMin = c.low;
      if (c.high > pMax) pMax = c.high;
      if (c.volume > mVol) mVol = c.volume;
    }
    const pad = (pMax - pMin) * 0.08 || 0.5;
    const dMin = pMin - pad;
    const dMax = pMax + pad;
    return { domainMin: dMin, domainMax: dMax, domainRange: dMax - dMin, maxVol: mVol };
  }, [candles, n]);

  const gridLevels = useMemo(() => {
    if (n < 2) return [];
    const step = domainRange / 5;
    const levels: number[] = [];
    for (let i = 1; i <= 4; i++) levels.push(domainMin + step * i);
    return levels;
  }, [domainMin, domainRange, n]);

  const priceY = (p: number) => PADDING_TOP + (PRICE_H - PADDING_TOP - PADDING_BOTTOM) * (1 - (p - domainMin) / domainRange);

  const activeCandleIndex = candles.length - 1;
  const isLastActive = n >= 2 && candles[activeCandleIndex] && !candles[activeCandleIndex].closed;

  // Memoize MA polyline points
  const ma7Points = useMemo(() => {
    if (n < 2) return null;
    const pts = candles
      .map((c, i) => c.ma7 != null ? `${(i / n) * 100 + 100 / n / 2},${priceY(c.ma7!)}` : null)
      .filter(Boolean);
    return pts.length >= 2 ? pts.join(" ") : null;
  }, [candles, n, domainMin, domainRange]);

  const ma14Points = useMemo(() => {
    if (n < 2) return null;
    const pts = candles
      .map((c, i) => c.ma14 != null ? `${(i / n) * 100 + 100 / n / 2},${priceY(c.ma14!)}` : null)
      .filter(Boolean);
    return pts.length >= 2 ? pts.join(" ") : null;
  }, [candles, n, domainMin, domainRange]);

  const lastCandle = n >= 2 ? candles[candles.length - 1] : null;
  const lastY = lastCandle ? priceY(lastCandle.close) : 0;
  const lastPct = (lastY / CHART_HEIGHT) * 100;
  const isLastBull = lastCandle ? lastCandle.close >= lastCandle.open : true;

  if (n < 2) return null;

  return (
    <div className="w-full select-none relative" style={{ height: CHART_HEIGHT }}>
      <svg
        viewBox={`0 0 100 ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        className="w-full h-full"
        style={{ overflow: "visible" }}
      >
        {/* Grid lines */}
        {gridLevels.map((level, i) => (
          <line
            key={`grid-${i}`}
            x1={0} y1={priceY(level)} x2={87} y2={priceY(level)}
            stroke={GRID_COLOR} strokeWidth={0.15} strokeDasharray="0.5 0.5"
          />
        ))}

        {/* Volume separator */}
        <line x1={0} y1={PRICE_H} x2={100} y2={PRICE_H} stroke={GRID_COLOR} strokeWidth={0.15} />

        {/* Volume bars */}
        {candles.map((c, i) => {
          const barW = (100 / n) * 0.7;
          const x = (i / n) * 100 + (100 / n) * 0.15;
          const volH = (c.volume / maxVol) * (VOL_H - 4);
          const isBull = c.close >= c.open;
          return (
            <rect
              key={`vol-${i}`}
              x={x} y={PRICE_H + (VOL_H - volH - 2)}
              width={barW} height={Math.max(volH, 0.3)}
              fill={isBull ? UP_COLOR_DIM : DOWN_COLOR_DIM}
              rx={0.2}
            />
          );
        })}

        {/* Active candle background glow */}
        {isLastActive && (() => {
          const slotW = 100 / n;
          const x = activeCandleIndex * slotW;
          return (
            <rect
              x={x} y={PADDING_TOP} width={slotW} height={PRICE_H - PADDING_TOP}
              fill={ACTIVE_GLOW} rx={0.3}
            />
          );
        })()}

        {/* Candle wicks and bodies */}
        {candles.map((c, i) => (
          <CandleStick
            key={`candle-${i}`}
            c={c} i={i} n={n}
            domainMin={domainMin} domainRange={domainRange}
            priceH={PRICE_H} paddingTop={PADDING_TOP} paddingBottom={PADDING_BOTTOM}
            isActive={i === activeCandleIndex && !c.closed}
          />
        ))}

        {/* MA7 line */}
        {ma7Points && (
          <polyline
            points={ma7Points} fill="none"
            stroke={MA7_COLOR} strokeWidth={0.4}
            strokeLinejoin="round" strokeLinecap="round"
          />
        )}

        {/* MA14 line */}
        {ma14Points && (
          <polyline
            points={ma14Points} fill="none"
            stroke={MA14_COLOR} strokeWidth={0.4}
            strokeLinejoin="round" strokeLinecap="round"
          />
        )}

        {/* Entry price reference line */}
        {entryPrice != null && entryPrice >= domainMin && entryPrice <= domainMax && (
          <line
            x1={0} y1={priceY(entryPrice)} x2={100} y2={priceY(entryPrice)}
            stroke={ENTRY_COLOR} strokeWidth={0.25} strokeDasharray="0.8 0.4" strokeOpacity={0.9}
          />
        )}

        {/* Current price dotted line from last candle to right edge */}
        <line
          x1={((n - 1) / n) * 100 + 100 / n / 2} y1={lastY} x2={100} y2={lastY}
          stroke={isLastBull ? UP_COLOR : DOWN_COLOR}
          strokeWidth={0.2} strokeDasharray="0.4 0.3" strokeOpacity={0.6}
        />
      </svg>

      {/* Price axis labels — positioned using priceY for alignment with grid */}
      <div className="absolute right-0 top-0 bottom-0 pointer-events-none" style={{ width: 48 }}>
        {gridLevels.map((level, i) => (
          <span
            key={i}
            className="absolute text-[8px] tabular-nums text-muted-foreground text-right pr-1 leading-none"
            style={{
              top: `${(priceY(level) / CHART_HEIGHT) * 100}%`,
              transform: "translateY(-50%)",
              right: 0,
            }}
          >
            {fmtAxis(level, assetClass)}
          </span>
        ))}
      </div>

      {/* Current price badge */}
      <div
        className="absolute right-0 px-1.5 py-0.5 rounded-sm text-[8px] font-bold tabular-nums transition-all duration-300 ease-out"
        style={{
          top: `${lastPct}%`,
          transform: "translateY(-50%)",
          backgroundColor: isLastBull ? UP_COLOR : DOWN_COLOR,
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
            top: `${(priceY(entryPrice) / CHART_HEIGHT) * 100}%`,
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

export default memo(SVGCandleChart);