import { memo, useMemo, useRef } from "react";

const UP = "hsl(142, 76%, 36%)";
const DOWN = "hsl(0, 84%, 60%)";
const TARGET_COLOR = "hsl(142, 76%, 36%)";
const GRID = "hsl(var(--border) / 0.18)";
const LERP_CONTRACT = 0.12;

interface Props {
  priceHistory: { time: string; price: number; ts: number }[];
  entryPrice: number | null;
  assetClass?: string;
  userBet: { side: string } | null;
  activeRound: { open_price: number | null } | null;
  fullscreen?: boolean;
}

function fmtPrice(p: number, ac?: string): string {
  if (ac === "forex") return p.toFixed(4);
  if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function PolylineChart({ priceHistory, entryPrice, assetClass, userBet, activeRound, fullscreen }: Props) {
  const data = priceHistory;
  const n = data.length;

  const prevDomainMinRef = useRef<number | null>(null);
  const prevDomainMaxRef = useRef<number | null>(null);

  const { points, color, domainMin, domainRange, gridLevels, timeLabels } = useMemo(() => {
    if (n < 2) return { points: "", color: UP, domainMin: 0, domainRange: 1, gridLevels: [], timeLabels: [] };

    let lo = Infinity, hi = -Infinity;
    for (const d of data) {
      if (d.price < lo) lo = d.price;
      if (d.price > hi) hi = d.price;
    }
    const pad = (hi - lo) * 0.08 || hi * 0.001 || 1;
    let targetMin = lo - pad;
    let targetMax = hi + pad;

    const prev = prevDomainMinRef.current;
    const prevMax = prevDomainMaxRef.current;
    if (prev != null && prevMax != null) {
      targetMin = targetMin < prev ? targetMin : prev + (targetMin - prev) * LERP_CONTRACT;
      targetMax = targetMax > prevMax ? targetMax : prevMax + (targetMax - prevMax) * LERP_CONTRACT;
    }
    prevDomainMinRef.current = targetMin;
    prevDomainMaxRef.current = targetMax;

    const dRange = targetMax - targetMin;

    // Color logic
    let c = UP;
    if (userBet && activeRound?.open_price) {
      const entry = Number(activeRound.open_price);
      const cur = data[n - 1].price;
      const inProfit = userBet.side === "down" ? cur < entry : cur > entry;
      c = inProfit ? UP : DOWN;
    } else {
      c = data[n - 1].price >= data[0].price ? UP : DOWN;
    }

    const H = 90; // leave 10% for time axis
    const pts = data.map((d, i) => {
      const x = (i / (n - 1)) * 85;
      const y = H - ((d.price - targetMin) / dRange) * H;
      return `${x},${y}`;
    }).join(" ");

    // Grid levels
    const step = dRange / 5;
    const gl: number[] = [];
    for (let i = 1; i <= 4; i++) gl.push(targetMin + step * i);

    // Time labels (every ~20% of data)
    const tl: { x: number; label: string }[] = [];
    const interval = Math.max(1, Math.floor(n / 5));
    for (let i = 0; i < n; i += interval) {
      tl.push({ x: (i / (n - 1)) * 85, label: fmtTime(data[i].ts) });
    }
    // Always add the last point
    if (tl.length === 0 || tl[tl.length - 1].x < (((n - 1) / (n - 1)) * 85) - 5) {
      tl.push({ x: 85, label: fmtTime(data[n - 1].ts) });
    }

    return { points: pts, color: c, domainMin: targetMin, domainRange: dRange, gridLevels: gl, timeLabels: tl };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, n, userBet, activeRound]);

  if (n < 2) return null;

  const priceY = (p: number) => 90 - ((p - domainMin) / domainRange) * 90;
  const lastPrice = data[n - 1].price;
  const lastX = 85;
  const lastY = priceY(lastPrice);
  const isBull = lastPrice >= data[0].price;

  return (
    <div className="w-full select-none relative" style={{ height: fullscreen ? "100%" : 220 }}>
      <svg viewBox="0 0 100 105" preserveAspectRatio={fullscreen ? "xMidYMid meet" : "none"} className="w-full h-full" style={{ overflow: "visible" }}>
        <defs>
          {/* Pulsing glow filter */}
          <filter id="polyGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grid lines */}
        {gridLevels.map((level, i) => (
          <line key={i} x1={0} y1={priceY(level)} x2={85} y2={priceY(level)} stroke={GRID} strokeWidth={0.12} />
        ))}

        {/* Entry/Target price line + badge */}
        {entryPrice != null && entryPrice >= domainMin && entryPrice <= domainMin + domainRange && (
          <>
            <line x1={0} y1={priceY(entryPrice)} x2={85} y2={priceY(entryPrice)} stroke={TARGET_COLOR} strokeWidth={0.2} strokeOpacity={0.5} />
            {/* Target badge */}
            <rect x={86} y={priceY(entryPrice) - 2.5} width={13} height={5} rx={1.2} fill={TARGET_COLOR} fillOpacity={0.15} stroke={TARGET_COLOR} strokeWidth={0.15} />
            <text x={92.5} y={priceY(entryPrice) + 0.8} textAnchor="middle" fill={TARGET_COLOR} fontSize={2.5} fontWeight="700" fontFamily="system-ui">
              Target
            </text>
          </>
        )}

        {/* Main smooth line — thick, no fill */}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={0.7}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Pulsing dot at current price tip */}
        <circle cx={lastX} cy={lastY} r={1.2} fill={color} filter="url(#polyGlow)">
          <animate attributeName="r" values="1.2;1.8;1.2" dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.6;1" dur="1.5s" repeatCount="indefinite" />
        </circle>
        <circle cx={lastX} cy={lastY} r={0.6} fill="white" />

        {/* Dotted line from tip to price label */}
        <line x1={lastX} y1={lastY} x2={100} y2={lastY} stroke={color} strokeWidth={0.15} strokeDasharray="0.4 0.3" strokeOpacity={0.5} />

        {/* Time axis labels */}
        {timeLabels.map((tl, i) => (
          <text key={i} x={tl.x} y={97} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={fullscreen ? 2.8 : 2.2} fontFamily="system-ui" opacity={0.7}>
            {tl.label}
          </text>
        ))}
      </svg>

      {/* Y-axis price labels */}
      <div className="absolute right-0 top-0 bottom-0 pointer-events-none" style={{ width: fullscreen ? 64 : 48 }}>
        {gridLevels.map((level, i) => (
          <span
            key={i}
            className={`absolute tabular-nums text-muted-foreground text-right pr-1 leading-none ${fullscreen ? "text-[11px]" : "text-[8px]"}`}
            style={{ top: `${(priceY(level) / 105) * 100}%`, transform: "translateY(-50%)", right: 0 }}
          >
            {fmtPrice(level, assetClass)}
          </span>
        ))}
      </div>

      {/* Current price badge */}
      <div
        className={`absolute right-0 px-1.5 py-0.5 rounded-sm font-bold tabular-nums transition-all duration-300 ease-out ${fullscreen ? "text-xs" : "text-[8px]"}`}
        style={{
          top: `${(lastY / 105) * 100}%`,
          transform: "translateY(-50%)",
          backgroundColor: isBull ? UP : DOWN,
          color: "white",
        }}
      >
        {fmtPrice(lastPrice, assetClass)}
      </div>

      {/* Entry price badge (right side) */}
      {entryPrice != null && entryPrice >= domainMin && entryPrice <= domainMin + domainRange && (
        <div
          className={`absolute right-0 px-1.5 py-0.5 rounded-sm font-bold tabular-nums ${fullscreen ? "text-xs" : "text-[8px]"}`}
          style={{
            top: `${(priceY(entryPrice) / 105) * 100}%`,
            transform: "translateY(-50%)",
            backgroundColor: TARGET_COLOR,
            color: "white",
          }}
        >
          {fmtPrice(entryPrice, assetClass)}
        </div>
      )}
    </div>
  );
}

export default memo(PolylineChart);
