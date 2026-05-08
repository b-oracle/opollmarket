import { memo, useRef, useEffect, useState } from "react";

const UP = "hsl(142, 76%, 36%)";
const DOWN = "hsl(0, 84%, 60%)";
const TARGET_COLOR = "hsl(142, 76%, 36%)";
const GRID_COLOR = "rgba(128, 128, 128, 0.18)";

const BUFFER_CAP = 600;
const FIELDS = 2;
const LERP_CONTRACT = 0.12;

interface Props {
  priceHistory: { time: string; price: number; ts: number }[];
  entryPrice: number | null;
  assetClass?: string;
  userBet: { side: string; amount?: number } | null;
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const bufferRef = useRef(new Float64Array(BUFFER_CAP * FIELDS));
  const bufLenRef = useRef(0);
  const domainMinRef = useRef<number | null>(null);
  const domainMaxRef = useRef<number | null>(null);
  const lastDataTsRef = useRef(0);
  const lastDataLenRef = useRef(0);

  // Overlay state — updated at ~10fps from RAF
  const [overlay, setOverlay] = useState({ color: UP, isBull: true, lastPrice: 0, lastY: 50, entryY: 0, entryVisible: false });
  const overlayRef = useRef(overlay);
  const lastOverlayTsRef = useRef(0);

  // Sync priceHistory into ring buffer
  useEffect(() => {
    const data = priceHistory;
    const n = data.length;
    if (n < 2) return;
    const lastTs = data[n - 1].ts;
    if (n === lastDataLenRef.current && lastTs === lastDataTsRef.current) return;
    lastDataLenRef.current = n;
    lastDataTsRef.current = lastTs;

    const buf = bufferRef.current;
    const count = Math.min(n, BUFFER_CAP);
    const startIdx = n - count;
    for (let i = 0; i < count; i++) {
      buf[i * FIELDS] = data[startIdx + i].ts;
      buf[i * FIELDS + 1] = data[startIdx + i].price;
    }
    bufLenRef.current = count;
  }, [priceHistory]);

  // Canvas RAF draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let running = true;
    let pulsePhase = 0;

    const draw = () => {
      if (!running) return;
      rafRef.current = requestAnimationFrame(draw);

      const buf = bufferRef.current;
      const n = bufLenRef.current;
      if (n < 2) return;

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

      // Domain with hysteresis
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) {
        const p = buf[i * FIELDS + 1];
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

      const chartW = w * 0.85;
      const chartH = h * 0.88;
      const chartTop = 4;
      const toX = (i: number) => (i / (n - 1)) * chartW;
      const toY = (price: number) => chartTop + chartH - ((price - tMin) / dRange) * chartH;

      const firstPrice = buf[1];
      const lastPrice = buf[(n - 1) * FIELDS + 1];
      let color = UP;
      if (userBet && activeRound?.open_price) {
        const entry = Number(activeRound.open_price);
        color = (userBet.side === "down" ? lastPrice < entry : lastPrice > entry) ? UP : DOWN;
      } else {
        color = lastPrice >= firstPrice ? UP : DOWN;
      }
      const isBull = lastPrice >= firstPrice;

      // Grid
      const step = dRange / 5;
      const gridLevels: number[] = [];
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 0.5;
      for (let i = 1; i <= 4; i++) {
        const level = tMin + step * i;
        gridLevels.push(level);
        const gy = toY(level);
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(chartW, gy);
        ctx.stroke();
      }

      // Entry price line
      let entryVisible = false;
      let entryYPct = 0;
      if (entryPrice != null && entryPrice >= tMin && entryPrice <= tMax) {
        entryVisible = true;
        const ey = toY(entryPrice);
        entryYPct = (ey / h) * 100;
        ctx.strokeStyle = TARGET_COLOR;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, ey);
        ctx.lineTo(chartW, ey);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Main line
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = toX(i);
        const y = toY(buf[i * FIELDS + 1]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Pulsing tip
      const lastX = toX(n - 1);
      const lastY = toY(lastPrice);
      pulsePhase += 0.04;
      const pr = 4 + Math.sin(pulsePhase) * 2;
      const pa = 0.8 + Math.sin(pulsePhase) * 0.2;

      ctx.globalAlpha = pa * 0.3;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lastX, lastY, pr + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = pa;
      ctx.beginPath();
      ctx.arc(lastX, lastY, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(lastX, lastY, 2, 0, Math.PI * 2);
      ctx.fill();

      // Dotted line to right
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(w, lastY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Time labels
      ctx.fillStyle = "rgba(128, 128, 128, 0.7)";
      ctx.font = `${fullscreen ? 11 : 9}px system-ui`;
      ctx.textAlign = "center";
      const interval = Math.max(1, Math.floor(n / 5));
      for (let i = 0; i < n; i += interval) {
        ctx.fillText(fmtTime(buf[i * FIELDS]), toX(i), h - 4);
      }
      const lastTimeX = toX(n - 1);
      const prevLabelX = toX(Math.floor((n - 1) / interval) * interval);
      if (lastTimeX - prevLabelX > 30) {
        ctx.fillText(fmtTime(buf[(n - 1) * FIELDS]), lastTimeX, h - 4);
      }

      // Price labels
      ctx.fillStyle = "rgba(128, 128, 128, 0.7)";
      ctx.font = `${fullscreen ? 11 : 8}px system-ui`;
      ctx.textAlign = "right";
      for (const level of gridLevels) {
        ctx.fillText(fmtPrice(level, assetClass), w - 2, toY(level) + 3);
      }

      // Update overlay at ~10fps
      const now = performance.now();
      if (now - lastOverlayTsRef.current > 100) {
        lastOverlayTsRef.current = now;
        const lastYPct = (lastY / h) * 100;
        const prev = overlayRef.current;
        if (prev.lastPrice !== lastPrice || prev.color !== color || Math.abs(prev.lastY - lastYPct) > 0.3) {
          const next = { color, isBull, lastPrice, lastY: lastYPct, entryY: entryYPct, entryVisible };
          overlayRef.current = next;
          setOverlay(next);
        }
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [priceHistory, entryPrice, assetClass, userBet, activeRound, fullscreen, setOverlay]);

  if (priceHistory.length < 2) return null;

  return (
    <div ref={containerRef} className="w-full select-none relative" style={{ height: fullscreen ? "100%" : 220 }}>
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Current price badge */}
      <div
        className={`absolute right-0 px-1.5 py-0.5 rounded-sm font-bold tabular-nums transition-all duration-150 ease-out ${fullscreen ? "text-xs" : "text-[8px]"}`}
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
