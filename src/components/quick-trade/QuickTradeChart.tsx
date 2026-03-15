import { memo, useMemo, useState, useEffect } from "react";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, ReferenceLine,
  Tooltip as RechartsTooltip, ComposedChart, Bar, Cell, Line
} from "recharts";
import TradingViewChart from "@/components/TradingViewChart";
import type { OHLCCandle } from "@/lib/cryptoPriceProvider";
import { Loader2, Moon } from "lucide-react";
import { isMarketOpen, getNextOpenTime } from "@/lib/marketHours";

interface QuickTradeChartProps {
  chartType: "area" | "candle" | "tv";
  chartTimeframe: string;
  chartMs: number;
  priceHistory: { time: string; price: number; ts: number }[];
  ohlcData: OHLCCandle[];
  streamingPrice: number | null;
  historyLoading: boolean;
  activeRound: { open_price: number | null; created_at: string; duration_seconds: number } | null;
  userBet: { side: string } | null;
  resolveFlash: "win" | "lose" | null;
  timeframeLabel: string;
  assetClass?: "crypto" | "commodity" | "forex";
}

/** Format a price for tooltip display based on asset class */
function formatTooltipPrice(price: number, assetClass?: string): string {
  if (assetClass === "forex") return price.toFixed(4);
  if (assetClass === "commodity") return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1000) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
}

// ── Colors ──
const UP_COLOR = "hsl(142, 76%, 36%)";
const DOWN_COLOR = "hsl(0, 84%, 60%)";
const UP_COLOR_DIM = "hsl(142, 76%, 36% / 0.25)";
const DOWN_COLOR_DIM = "hsl(0, 84%, 60% / 0.25)";
const GRID_COLOR = "hsl(var(--border) / 0.3)";
const MA7_COLOR = "hsl(45, 93%, 58%)";
const MA14_COLOR = "hsl(280, 80%, 65%)";
const ENTRY_COLOR = "#f59e0b";

// ── Candle builder ──
interface Candle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma7?: number;
  ma14?: number;
}

function buildCandles(
  points: { ts: number; price: number }[],
  targetCount: number
): Candle[] {
  if (points.length < 2) return [];
  const span = points[points.length - 1].ts - points[0].ts;
  const bucketMs = Math.max(Math.floor(span / targetCount), 1000);

  const candles: Candle[] = [];
  let bucketStart = points[0].ts;
  let bucket: number[] = [];

  for (const pt of points) {
    if (pt.ts - bucketStart >= bucketMs && bucket.length) {
      const o = bucket[0], c = bucket[bucket.length - 1];
      candles.push({
        ts: bucketStart,
        open: o,
        high: Math.max(...bucket),
        low: Math.min(...bucket),
        close: c,
        volume: bucket.length,
      });
      bucketStart = pt.ts;
      bucket = [];
    }
    bucket.push(pt.price);
  }
  if (bucket.length) {
    const o = bucket[0], c = bucket[bucket.length - 1];
    candles.push({
      ts: bucketStart,
      open: o,
      high: Math.max(...bucket),
      low: Math.min(...bucket),
      close: c,
      volume: bucket.length,
    });
  }

  // Compute MAs
  for (let i = 0; i < candles.length; i++) {
    if (i >= 6) candles[i].ma7 = candles.slice(i - 6, i + 1).reduce((s, c) => s + c.close, 0) / 7;
    if (i >= 13) candles[i].ma14 = candles.slice(i - 13, i + 1).reduce((s, c) => s + c.close, 0) / 14;
  }

  return candles;
}

// ── SVG Candle Chart (TradingView-like) ──
function SVGCandleChart({
  candles,
  entryPrice,
  assetClass,
  timeframeLabel,
}: {
  candles: Candle[];
  entryPrice: number | null;
  assetClass?: string;
  timeframeLabel: string;
}) {
  const CHART_HEIGHT = 220;
  const PRICE_AREA_RATIO = 0.75; // 75% price, 25% volume
  const PRICE_H = Math.floor(CHART_HEIGHT * PRICE_AREA_RATIO);
  const VOL_H = CHART_HEIGHT - PRICE_H;
  const PADDING_TOP = 6;
  const PADDING_BOTTOM = 2;
  const RIGHT_MARGIN = 52; // space for price axis labels

  const n = candles.length;
  if (n < 2) return null;

  const priceMin = Math.min(...candles.map(c => c.low));
  const priceMax = Math.max(...candles.map(c => c.high));
  const pricePad = (priceMax - priceMin) * 0.08 || 0.5;
  const domainMin = priceMin - pricePad;
  const domainMax = priceMax + pricePad;
  const domainRange = domainMax - domainMin;

  const maxVol = Math.max(...candles.map(c => c.volume), 1);

  // Price Y mapper
  const priceY = (p: number) => PADDING_TOP + (PRICE_H - PADDING_TOP - PADDING_BOTTOM) * (1 - (p - domainMin) / domainRange);

  // Price axis grid lines (~4 levels)
  const gridLevels = useMemo(() => {
    const step = domainRange / 5;
    const levels: number[] = [];
    for (let i = 1; i <= 4; i++) {
      levels.push(domainMin + step * i);
    }
    return levels;
  }, [domainMin, domainRange]);

  // Format axis price
  const fmtAxis = (p: number) => {
    if (assetClass === "forex") return p.toFixed(4);
    if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (p >= 100) return p.toFixed(2);
    if (p >= 1) return p.toFixed(2);
    return p.toFixed(4);
  };

  return (
    <div className="w-full select-none" style={{ height: CHART_HEIGHT }}>
      <svg
        viewBox={`0 0 100 ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        className="w-full h-full"
        style={{ overflow: "visible" }}
      >
        {/* Grid lines */}
        {gridLevels.map((level, i) => (
          <g key={i}>
            <line
              x1={0}
              y1={priceY(level)}
              x2={100 - RIGHT_MARGIN / 4}
              y2={priceY(level)}
              stroke={GRID_COLOR}
              strokeWidth={0.15}
              strokeDasharray="0.5 0.5"
            />
          </g>
        ))}

        {/* Volume separator line */}
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
              x={x}
              y={PRICE_H + (VOL_H - volH - 2)}
              width={barW}
              height={Math.max(volH, 0.3)}
              fill={isBull ? UP_COLOR_DIM : DOWN_COLOR_DIM}
              rx={0.2}
            />
          );
        })}

        {/* Candle wicks and bodies */}
        {candles.map((c, i) => {
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
            <g key={`candle-${i}`}>
              {/* Wick */}
              <line
                x1={centerX}
                y1={wickTop}
                x2={centerX}
                y2={wickBot}
                stroke={fill}
                strokeWidth={0.2}
                strokeOpacity={0.9}
              />
              {/* Body */}
              <rect
                x={centerX - bodyW / 2}
                y={bodyTop}
                width={bodyW}
                height={bodyH}
                fill={fill}
                rx={0.15}
              />
            </g>
          );
        })}

        {/* MA7 line */}
        {(() => {
          const pts = candles
            .map((c, i) => c.ma7 != null ? `${(i / n) * 100 + 100 / n / 2},${priceY(c.ma7!)}` : null)
            .filter(Boolean);
          if (pts.length < 2) return null;
          return (
            <polyline
              points={pts.join(" ")}
              fill="none"
              stroke={MA7_COLOR}
              strokeWidth={0.4}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })()}

        {/* MA14 line */}
        {(() => {
          const pts = candles
            .map((c, i) => c.ma14 != null ? `${(i / n) * 100 + 100 / n / 2},${priceY(c.ma14!)}` : null)
            .filter(Boolean);
          if (pts.length < 2) return null;
          return (
            <polyline
              points={pts.join(" ")}
              fill="none"
              stroke={MA14_COLOR}
              strokeWidth={0.4}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })()}

        {/* Entry price reference line */}
        {entryPrice != null && entryPrice >= domainMin && entryPrice <= domainMax && (
          <g>
            <line
              x1={0}
              y1={priceY(entryPrice)}
              x2={100}
              y2={priceY(entryPrice)}
              stroke={ENTRY_COLOR}
              strokeWidth={0.25}
              strokeDasharray="0.8 0.4"
              strokeOpacity={0.9}
            />
          </g>
        )}

        {/* Current price marker (last close) */}
        {(() => {
          const lastCandle = candles[candles.length - 1];
          const y = priceY(lastCandle.close);
          const isBull = lastCandle.close >= lastCandle.open;
          return (
            <g>
              <line
                x1={((n - 1) / n) * 100 + 100 / n / 2}
                y1={y}
                x2={100}
                y2={y}
                stroke={isBull ? UP_COLOR : DOWN_COLOR}
                strokeWidth={0.2}
                strokeDasharray="0.4 0.3"
                strokeOpacity={0.6}
              />
            </g>
          );
        })()}
      </svg>

      {/* Price axis labels (overlaid absolutely) */}
      <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-between pointer-events-none" style={{ width: 48, paddingTop: 4, paddingBottom: VOL_H + 4 }}>
        {gridLevels.map((level, i) => (
          <span key={i} className="text-[8px] tabular-nums text-muted-foreground text-right pr-1 leading-none">
            {fmtAxis(level)}
          </span>
        ))}
      </div>

      {/* Current price badge */}
      {(() => {
        const lastCandle = candles[candles.length - 1];
        const y = priceY(lastCandle.close);
        const pct = (y / CHART_HEIGHT) * 100;
        const isBull = lastCandle.close >= lastCandle.open;
        return (
          <div
            className="absolute right-0 px-1.5 py-0.5 rounded-sm text-[8px] font-bold tabular-nums"
            style={{
              top: `${pct}%`,
              transform: "translateY(-50%)",
              backgroundColor: isBull ? UP_COLOR : DOWN_COLOR,
              color: "white",
            }}
          >
            {fmtAxis(lastCandle.close)}
          </div>
        );
      })()}

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
          {fmtAxis(entryPrice)}
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

/** Countdown + "Market Closed" overlay for non-crypto assets */
function MarketClosedOverlay({ assetClass }: { assetClass: string }) {
  const nextOpen = getNextOpenTime(assetClass);

  // Countdown to Sunday 5 PM ET
  const [countdown, setCountdown] = useState("");
  useEffect(() => {
    const calc = () => {
      const now = new Date();
      const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
      const et = new Date(etStr);
      const day = et.getDay();
      const hour = et.getHours();

      // Calculate days until Sunday 17:00 ET
      let daysUntil = (7 - day) % 7; // days until Sunday
      if (day === 0 && hour >= 17) daysUntil = 7; // already past Sunday 5pm
      if (daysUntil === 0) daysUntil = 7;

      const target = new Date(et);
      target.setDate(target.getDate() + daysUntil);
      target.setHours(17, 0, 0, 0);

      const diff = target.getTime() - et.getTime();
      if (diff <= 0) return "Opening soon...";

      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      return `${h}h ${m}m ${s}s`;
    };
    setCountdown(calc());
    const interval = setInterval(() => setCountdown(calc()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative h-[220px] overflow-hidden rounded-lg bg-muted/10 border border-destructive/30">
      {/* Subtle grid background */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <div className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl bg-destructive/15 border border-destructive/30">
          <Moon className="w-6 h-6 text-destructive" />
          <span className="text-base font-extrabold text-destructive uppercase tracking-widest">Market Closed</span>
        </div>
        <p className="text-xs text-muted-foreground font-medium">{nextOpen}</p>
        {countdown && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card/80 border border-border">
            <span className="text-xs text-muted-foreground">Opens in</span>
            <span className="text-base font-bold tabular-nums text-foreground">{countdown}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function QuickTradeChart({
  chartType, chartMs, priceHistory, ohlcData, streamingPrice,
  historyLoading, activeRound, userBet, resolveFlash, timeframeLabel, assetClass,
}: QuickTradeChartProps) {
  if (historyLoading) {
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
            <span className="text-[10px] font-medium text-muted-foreground">Loading chart...</span>
          </div>
        </div>
      </div>
    );
  }

  if (chartType === "tv") {
    return (
      <TradingViewChart
        priceHistory={priceHistory}
        ohlcData={ohlcData}
        chartMs={chartMs}
        timeframeLabel={timeframeLabel}
        streamingPrice={streamingPrice}
        entryPrice={userBet && activeRound?.open_price ? Number(activeRound.open_price) : null}
        entrySide={userBet ? (userBet.side as "up" | "down") : null}
        roundEndTime={activeRound ? new Date(activeRound.created_at).getTime() + activeRound.duration_seconds * 1000 : null}
        targetPrice={userBet && activeRound?.open_price ? Number(activeRound.open_price) : null}
        resolveFlash={resolveFlash}
      />
    );
  }

  const cutoff = Date.now() - chartMs;
  const filtered = priceHistory.filter(pt => pt.ts >= cutoff);

  if (filtered.length < 2) {
    const marketOpen = isMarketOpen(assetClass || "crypto");
    if (!marketOpen || assetClass !== "crypto") {
      // Show market closed overlay for non-crypto assets even if we just have no data yet
      if (!marketOpen) {
        return <MarketClosedOverlay assetClass={assetClass || "crypto"} />;
      }
    }
    return (
      <div className="flex items-center justify-center h-[220px]">
        <p className="text-[10px] text-muted-foreground">Waiting for price data...</p>
      </div>
    );
  }

  const entryPrice = userBet && activeRound?.open_price ? Number(activeRound.open_price) : null;

  if (chartType === "candle") {
    // Target ~60 candles for dense packing
    const candles = buildCandles(filtered, 60);

    if (candles.length < 2) {
      return (
        <div className="flex items-center justify-center h-[220px]">
          <p className="text-[10px] text-muted-foreground">Not enough data for candles</p>
        </div>
      );
    }

    return (
      <div className="relative">
        <SVGCandleChart
          candles={candles}
          entryPrice={entryPrice}
          assetClass={assetClass}
          timeframeLabel={timeframeLabel}
        />
        <p className="text-[10px] text-muted-foreground text-center mt-1">Last {timeframeLabel}</p>
      </div>
    );
  }

  // ── Area chart (default) ──
  const upColor = "hsl(142, 76%, 36%)";
  const downColor = "hsl(0, 84%, 60%)";

  const color = (() => {
    if (userBet && activeRound?.open_price) {
      const entry = Number(activeRound.open_price);
      const current = filtered[filtered.length - 1].price;
      const inProfit = userBet.side === "down" ? current < entry : current > entry;
      return inProfit ? upColor : downColor;
    }
    const isUp = filtered[filtered.length - 1].price >= filtered[0].price;
    return isUp ? upColor : downColor;
  })();

  const tooltipContent = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-[11px]">
        <p className="font-semibold text-foreground">{formatTooltipPrice(Number(d.price), assetClass)}</p>
        <p className="text-muted-foreground">{new Date(d.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
      </div>
    );
  };

  const targetReferenceLine = entryPrice ? (
    <ReferenceLine
      y={entryPrice}
      stroke={ENTRY_COLOR}
      strokeDasharray="4 3"
      strokeOpacity={0.8}
      label={{ value: `📍 ${formatTooltipPrice(entryPrice, assetClass)}`, position: "insideTopRight", fill: ENTRY_COLOR, fontSize: 9, fontWeight: 600 }}
    />
  ) : null;

  return (
    <>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={filtered} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={[(d: number) => d - (d * 0.0001), (d: number) => d + (d * 0.0001)]} hide />
          <XAxis dataKey="ts" hide />
          <RechartsTooltip content={tooltipContent} cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '3 3' }} />
          {targetReferenceLine}
          <Area type="monotone" dataKey="price" stroke={color} strokeWidth={2} fill="url(#priceGradient)" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-muted-foreground text-center mt-1">Last {timeframeLabel}</p>
    </>
  );
}

export default memo(QuickTradeChart);
