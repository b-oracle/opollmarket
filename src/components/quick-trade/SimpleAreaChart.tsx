import { memo, useMemo, useRef } from "react";

const UP = "hsl(142, 76%, 36%)";
const DOWN = "hsl(0, 84%, 60%)";
const ENTRY_COLOR = "#f59e0b";
const GRID = "hsl(var(--border) / 0.25)";

/** Hysteresis lerp factor — expand instantly, contract gradually */
const LERP_CONTRACT = 0.12;

interface Props {
  priceHistory: { time: string; price: number; ts: number }[];
  entryPrice: number | null;
  assetClass?: string;
  userBet: { side: string } | null;
  activeRound: { open_price: number | null } | null;
  /** When true, chart fills its container instead of using fixed height */
  fullscreen?: boolean;
}

function fmtPrice(p: number, ac?: string): string {
  if (ac === "forex") return p.toFixed(4);
  if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function SimpleAreaChart({ priceHistory, entryPrice, assetClass, userBet, activeRound, fullscreen }: Props) {
  const data = priceHistory;
  const n = data.length;

  // Y-axis hysteresis refs
  const prevDomainMinRef = useRef<number | null>(null);
  const prevDomainMaxRef = useRef<number | null>(null);

  const { points, color, domainMin, domainRange, gridLevels } = useMemo(() => {
    if (n < 2) return { points: "", color: UP, domainMin: 0, domainRange: 1, gridLevels: [] };

    let lo = Infinity, hi = -Infinity;
    for (const d of data) {
      if (d.price < lo) lo = d.price;
      if (d.price > hi) hi = d.price;
    }
    const pad = (hi - lo) * 0.08 || hi * 0.001 || 1;
    let targetMin = lo - pad;
    let targetMax = hi + pad;

    // Hysteresis: expand immediately, contract gradually
    const prev = prevDomainMinRef.current;
    const prevMax = prevDomainMaxRef.current;
    if (prev != null && prevMax != null) {
      targetMin = targetMin < prev ? targetMin : prev + (targetMin - prev) * LERP_CONTRACT;
      targetMax = targetMax > prevMax ? targetMax : prevMax + (targetMax - prevMax) * LERP_CONTRACT;
    }
    prevDomainMinRef.current = targetMin;
    prevDomainMaxRef.current = targetMax;

    const dRange = targetMax - targetMin;

    // Determine color
    let c = UP;
    if (userBet && activeRound?.open_price) {
      const entry = Number(activeRound.open_price);
      const cur = data[n - 1].price;
      const inProfit = userBet.side === "down" ? cur < entry : cur > entry;
      c = inProfit ? UP : DOWN;
    } else {
      c = data[n - 1].price >= data[0].price ? UP : DOWN;
    }

    // SVG points (viewBox is 0 0 100 100)
    const H = 100;
    const pts = data.map((d, i) => {
      const x = (i / (n - 1)) * 88;
      const y = H - ((d.price - targetMin) / dRange) * H;
      return `${x},${y}`;
    }).join(" ");

    // Grid levels (4 lines)
    const step = dRange / 5;
    const gl: number[] = [];
    for (let i = 1; i <= 4; i++) gl.push(targetMin + step * i);

    return { points: pts, color: c, domainMin: targetMin, domainRange: dRange, gridLevels: gl };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, n, userBet, activeRound]);

  if (n < 2) return null;

  const priceY = (p: number) => 100 - ((p - domainMin) / domainRange) * 100;
  const lastPrice = data[n - 1].price;
  const lastY = priceY(lastPrice);
  const isBull = data[n - 1].price >= data[0].price;

  // Area polygon (line + bottom fill)
  const areaPoints = `${points} 88,100 0,100`;

  return (
    <div className="w-full select-none relative" style={{ height: fullscreen ? "100%" : 200 }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio={fullscreen ? "xMidYMid meet" : "none"} className="w-full h-full" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Grid */}
        {gridLevels.map((level, i) => (
          <line key={i} x1={0} y1={priceY(level)} x2={88} y2={priceY(level)} stroke={GRID} strokeWidth={0.15} strokeDasharray="0.5 0.5" />
        ))}

        {/* Area fill */}
        <polygon points={areaPoints} fill="url(#areaGrad)" />

        {/* Line */}
        <polyline points={points} fill="none" stroke={color} strokeWidth={0.4} strokeLinejoin="round" />

        {/* Entry price line */}
        {entryPrice != null && entryPrice >= domainMin && entryPrice <= domainMin + domainRange && (
          <line x1={0} y1={priceY(entryPrice)} x2={88} y2={priceY(entryPrice)} stroke={ENTRY_COLOR} strokeWidth={0.25} strokeDasharray="0.8 0.4" strokeOpacity={0.9} />
        )}

        {/* Current price dotted line */}
        <line x1={90} y1={lastY} x2={100} y2={lastY} stroke={color} strokeWidth={0.2} strokeDasharray="0.4 0.3" strokeOpacity={0.6} />
      </svg>

      {/* Price axis labels */}
      <div className="absolute right-0 top-0 bottom-0 pointer-events-none" style={{ width: fullscreen ? 64 : 48 }}>
        {gridLevels.map((level, i) => (
          <span
            key={i}
            className={`absolute tabular-nums text-muted-foreground text-right pr-1 leading-none ${fullscreen ? "text-[11px]" : "text-[8px]"}`}
            style={{ top: `${priceY(level)}%`, transform: "translateY(-50%)", right: 0 }}
          >
            {fmtPrice(level, assetClass)}
          </span>
        ))}
      </div>

      {/* Current price badge */}
      <div
        className={`absolute right-0 px-1.5 py-0.5 rounded-sm font-bold tabular-nums transition-all duration-300 ease-out ${fullscreen ? "text-xs" : "text-[8px]"}`}
        style={{
          top: `${lastY}%`,
          transform: "translateY(-50%)",
          backgroundColor: isBull ? UP : DOWN,
          color: "white",
        }}
      >
        {fmtPrice(lastPrice, assetClass)}
      </div>

      {/* Entry price badge */}
      {entryPrice != null && entryPrice >= domainMin && entryPrice <= domainMin + domainRange && (
        <div
          className={`absolute right-0 px-1.5 py-0.5 rounded-sm font-bold tabular-nums ${fullscreen ? "text-xs" : "text-[8px]"}`}
          style={{
            top: `${priceY(entryPrice)}%`,
            transform: "translateY(-50%)",
            backgroundColor: ENTRY_COLOR,
            color: "white",
          }}
        >
          {fmtPrice(entryPrice, assetClass)}
        </div>
      )}
    </div>
  );
}

export default memo(SimpleAreaChart);
