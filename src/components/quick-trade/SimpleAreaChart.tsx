import { memo, useRef, useEffect, useState, useMemo } from "react";

const UP = "hsl(142, 76%, 36%)";
const DOWN = "hsl(0, 84%, 60%)";
const UP_FILL_TOP = "hsla(142, 76%, 36%, 0.35)";
const UP_FILL_BOT = "hsla(142, 76%, 36%, 0.02)";
const DOWN_FILL_TOP = "hsla(0, 84%, 60%, 0.35)";
const DOWN_FILL_BOT = "hsla(0, 84%, 60%, 0.02)";
const ENTRY_COLOR = "#f59e0b";
const GRID_COLOR = "rgba(128, 128, 128, 0.18)";

const LERP_CONTRACT = 0.12;
const CHART_H_DEFAULT = 200;
const BUFFER_CAP = 600;

interface Props {
  priceHistory: { time: string; price: number; ts: number }[];
  entryPrice: number | null;
  assetClass?: string;
  userBet: { side: string; amount?: number } | null;
  activeRound: { open_price: number | null } | null;
  fullscreen?: boolean;
  /** When set, x-axis is anchored to wall-clock time inside [windowStartMs, windowEndMs]
   *  so the line draws left → right across the round window (Polymarket-style). */
  windowStartMs?: number | null;
  windowEndMs?: number | null;
}

interface OverlayState {
  lastPrice: number;
  lastY: number;
  isBull: boolean;
  entryY: number;
  entryVisible: boolean;
  gridLevels: { price: number; yPct: number }[];
}

function fmtPrice(p: number, ac?: string): string {
  if (ac === "forex") return p.toFixed(4);
  if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function SimpleAreaChart({ priceHistory, entryPrice, assetClass, userBet, activeRound, fullscreen, windowStartMs, windowEndMs }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  // Ring buffer: 2 fields per point (ts, price)
  const bufRef = useRef(new Float64Array(BUFFER_CAP * 2));
  const bufLenRef = useRef(0);
  const domainMinRef = useRef<number | null>(null);
  const domainMaxRef = useRef<number | null>(null);
  const lastHashRef = useRef("");

  const [overlay, setOverlay] = useState<OverlayState>({
    lastPrice: 0, lastY: 50, isBull: true, entryY: 0, entryVisible: false, gridLevels: [],
  });
  const overlayRef = useRef(overlay);
  const lastOverlayTsRef = useRef(0);

  // Sync price history into buffer
  const data = priceHistory;
  const n = data.length;

  useEffect(() => {
    if (n < 2) { bufLenRef.current = 0; return; }
    const hash = `${n}-${data[n - 1].price}-${data[n - 1].ts}`;
    if (hash === lastHashRef.current) return;
    lastHashRef.current = hash;

    const buf = bufRef.current;
    const count = Math.min(n, BUFFER_CAP);
    const startIdx = n - count;
    for (let i = 0; i < count; i++) {
      const d = data[startIdx + i];
      buf[i * 2] = d.ts;
      buf[i * 2 + 1] = d.price;
    }
    bufLenRef.current = count;
  }, [data, n]);

  // Determine line color
  const color = useMemo(() => {
    if (n < 2) return UP;
    if (userBet && activeRound?.open_price) {
      const entry = Number(activeRound.open_price);
      const cur = data[n - 1].price;
      const inProfit = userBet.side === "down" ? cur < entry : cur > entry;
      return inProfit ? UP : DOWN;
    }
    return data[n - 1].price >= data[0].price ? UP : DOWN;
  }, [data, n, userBet, activeRound]);

  const isBullColor = color === UP;

  // Canvas RAF draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let running = true;

    const draw = () => {
      if (!running) return;
      rafRef.current = requestAnimationFrame(draw);

      const buf = bufRef.current;
      const pts = bufLenRef.current;
      if (pts < 2) return;

      // Resize
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = rect.width;
      const h = rect.height;
      const cw = Math.round(w * dpr);
      const ch = Math.round(h * dpr);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const chartW = w * 0.88;
      const padTop = 4;
      const padBot = 4;

      // Domain with hysteresis
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < pts; i++) {
        const p = buf[i * 2 + 1];
        if (p < lo) lo = p;
        if (p > hi) hi = p;
      }
      const pad = (hi - lo) * 0.08 || hi * 0.001 || 1;
      let tMin = lo - pad;
      let tMax = hi + pad;
      const pMin = domainMinRef.current;
      const pMax = domainMaxRef.current;
      if (pMin != null && pMax != null) {
        tMin = tMin < pMin ? tMin : pMin + (tMin - pMin) * LERP_CONTRACT;
        tMax = tMax > pMax ? tMax : pMax + (tMax - pMax) * LERP_CONTRACT;
      }
      domainMinRef.current = tMin;
      domainMaxRef.current = tMax;
      const dRange = tMax - tMin;

      const toY = (price: number) => padTop + (h - padTop - padBot) * (1 - (price - tMin) / dRange);
      const toX = (i: number) => (i / (pts - 1)) * chartW;

      // Grid lines
      const step = dRange / 5;
      const gridLevels: { price: number; yPct: number }[] = [];
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 2]);
      for (let i = 1; i <= 4; i++) {
        const level = tMin + step * i;
        const gy = toY(level);
        gridLevels.push({ price: level, yPct: (gy / h) * 100 });
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(chartW, gy);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Build line path
      ctx.beginPath();
      for (let i = 0; i < pts; i++) {
        const x = toX(i);
        const y = toY(buf[i * 2 + 1]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }

      // Stroke line
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.stroke();

      // Area fill (gradient)
      const lastX = toX(pts - 1);
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, isBullColor ? UP_FILL_TOP : DOWN_FILL_TOP);
      grad.addColorStop(1, isBullColor ? UP_FILL_BOT : DOWN_FILL_BOT);
      ctx.lineTo(lastX, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Entry price line
      let entryVisible = false;
      let entryYPct = 0;
      if (entryPrice != null && entryPrice >= tMin && entryPrice <= tMax) {
        entryVisible = true;
        const ey = toY(entryPrice);
        entryYPct = (ey / h) * 100;
        ctx.strokeStyle = ENTRY_COLOR;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.9;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.moveTo(0, ey);
        ctx.lineTo(chartW, ey);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }

      // Current price dotted line to right edge
      const lastPrice = buf[(pts - 1) * 2 + 1];
      const lastY = toY(lastPrice);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(chartW, lastY);
      ctx.lineTo(w, lastY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Update overlay at ~10fps
      const now = performance.now();
      if (now - lastOverlayTsRef.current > 100) {
        lastOverlayTsRef.current = now;
        const lastYPct = (lastY / h) * 100;
        const firstPrice = buf[1];
        const isBull = lastPrice >= firstPrice;
        const prev = overlayRef.current;
        if (prev.lastPrice !== lastPrice || Math.abs(prev.lastY - lastYPct) > 0.3 || prev.entryVisible !== entryVisible || prev.gridLevels.length !== gridLevels.length) {
          const next: OverlayState = { lastPrice, lastY: lastYPct, isBull, entryY: entryYPct, entryVisible, gridLevels };
          overlayRef.current = next;
          setOverlay(next);
        }
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [priceHistory, entryPrice, assetClass, color, isBullColor, fullscreen]);

  if (n < 2) return null;

  return (
    <div ref={containerRef} className="w-full select-none relative" style={{ height: fullscreen ? "100%" : CHART_H_DEFAULT }}>
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Price axis labels */}
      <div className="absolute right-0 top-0 bottom-0 pointer-events-none" style={{ width: fullscreen ? 64 : 48 }}>
        {overlay.gridLevels.map((level, i) => (
          <span key={i} className={`absolute tabular-nums text-muted-foreground text-right pr-1 leading-none ${fullscreen ? "text-[11px]" : "text-[8px]"}`} style={{ top: `${level.yPct}%`, transform: "translateY(-50%)", right: 0 }}>
            {fmtPrice(level.price, assetClass)}
          </span>
        ))}
      </div>

      {/* Current price badge */}
      <div
        className={`absolute right-0 px-1.5 py-0.5 rounded-sm font-bold tabular-nums transition-all duration-300 ease-out ${fullscreen ? "text-xs" : "text-[8px]"}`}
        style={{
          top: `${overlay.lastY}%`,
          transform: "translateY(-50%)",
          backgroundColor: overlay.isBull ? UP : DOWN,
          color: "white",
        }}
      >
        {fmtPrice(overlay.lastPrice, assetClass)}
      </div>

      {/* Entry price badge */}
      {overlay.entryVisible && entryPrice != null && (
        <div
          className={`absolute right-0 px-1.5 py-0.5 rounded-sm font-bold tabular-nums ${fullscreen ? "text-xs" : "text-[8px]"}`}
          style={{
            top: `${overlay.entryY}%`,
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
