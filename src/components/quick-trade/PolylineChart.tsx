import { memo, useRef, useEffect, useCallback } from "react";

const UP = "hsl(142, 76%, 36%)";
const DOWN = "hsl(0, 84%, 60%)";
const TARGET_COLOR = "hsl(142, 76%, 36%)";
const GRID_COLOR = "rgba(128, 128, 128, 0.18)";

/** Ring buffer capacity */
const BUFFER_CAP = 600;
/** Fields per entry: [ts, price] */
const FIELDS = 2;

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

/** Hysteresis: expand instantly, contract gradually */
const LERP_CONTRACT = 0.12;

function PolylineChart({ priceHistory, entryPrice, assetClass, userBet, activeRound, fullscreen }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // Ring buffer stored as flat Float64Array: [ts0, price0, ts1, price1, ...]
  const bufferRef = useRef(new Float64Array(BUFFER_CAP * FIELDS));
  const bufLenRef = useRef(0);
  const bufHeadRef = useRef(0); // write position (circular)

  // Domain hysteresis
  const domainMinRef = useRef<number | null>(null);
  const domainMaxRef = useRef<number | null>(null);

  // Last known data fingerprint to avoid redundant buffer rebuilds
  const lastDataLenRef = useRef(0);
  const lastDataTsRef = useRef(0);

  // Cache color & domain for overlay divs
  const renderStateRef = useRef({
    color: UP,
    isBull: true,
    lastPrice: 0,
    lastY: 0,
    domainMin: 0,
    domainRange: 1,
    gridLevels: [] as number[],
    entryY: 0,
    entryVisible: false,
  });

  // Force overlay update counter
  const [, setTick] = (function() {
    // Use a simple counter ref + forceUpdate pattern
    const ref = useRef(0);
    const setState = useCallback(() => { ref.current++; }, []);
    return [ref.current, setState] as const;
  })();
  const forceOverlayRef = useRef<() => void>(() => {});

  // Sync priceHistory array into ring buffer
  useEffect(() => {
    const data = priceHistory;
    const n = data.length;
    if (n < 2) return;

    // Only rebuild if data actually changed
    const lastTs = data[n - 1].ts;
    if (n === lastDataLenRef.current && lastTs === lastDataTsRef.current) return;
    lastDataLenRef.current = n;
    lastDataTsRef.current = lastTs;

    // Reset buffer
    const buf = bufferRef.current;
    const count = Math.min(n, BUFFER_CAP);
    const startIdx = n - count;
    for (let i = 0; i < count; i++) {
      const d = data[startIdx + i];
      buf[i * FIELDS] = d.ts;
      buf[i * FIELDS + 1] = d.price;
    }
    bufLenRef.current = count;
    bufHeadRef.current = count % BUFFER_CAP;
  }, [priceHistory]);

  // Canvas draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let running = true;
    let lastFrameData = 0; // track last drawn data length to skip identical frames

    // Pulse animation state
    let pulsePhase = 0;

    const draw = () => {
      if (!running) return;
      rafRef.current = requestAnimationFrame(draw);

      const buf = bufferRef.current;
      const n = bufLenRef.current;
      if (n < 2) return;

      // Resize canvas to container (handle DPR)
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = rect.width;
      const h = rect.height;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Compute domain with hysteresis
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) {
        const p = buf[i * FIELDS + 1];
        if (p < lo) lo = p;
        if (p > hi) hi = p;
      }
      const pad = (hi - lo) * 0.08 || hi * 0.001 || 1;
      let targetMin = lo - pad;
      let targetMax = hi + pad;

      const prevMin = domainMinRef.current;
      const prevMax = domainMaxRef.current;
      if (prevMin != null && prevMax != null) {
        targetMin = targetMin < prevMin ? targetMin : prevMin + (targetMin - prevMin) * LERP_CONTRACT;
        targetMax = targetMax > prevMax ? targetMax : prevMax + (targetMax - prevMax) * LERP_CONTRACT;
      }
      domainMinRef.current = targetMin;
      domainMaxRef.current = targetMax;
      const dRange = targetMax - targetMin;

      // Chart area (leave 12% right gutter for labels, 10% bottom for time)
      const chartW = w * 0.85;
      const chartH = h * 0.88;
      const chartTop = 4;

      const toX = (i: number) => (i / (n - 1)) * chartW;
      const toY = (price: number) => chartTop + chartH - ((price - targetMin) / dRange) * chartH;

      // Determine color
      const firstPrice = buf[1]; // price at index 0
      const lastPrice = buf[(n - 1) * FIELDS + 1];
      let color = UP;
      if (userBet && activeRound?.open_price) {
        const entry = Number(activeRound.open_price);
        const inProfit = userBet.side === "down" ? lastPrice < entry : lastPrice > entry;
        color = inProfit ? UP : DOWN;
      } else {
        color = lastPrice >= firstPrice ? UP : DOWN;
      }
      const isBull = lastPrice >= firstPrice;

      // Grid lines (4 levels)
      const step = dRange / 5;
      const gridLevels: number[] = [];
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 0.5;
      for (let i = 1; i <= 4; i++) {
        const level = targetMin + step * i;
        gridLevels.push(level);
        const gy = toY(level);
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(chartW, gy);
        ctx.stroke();
      }

      // Entry/target price line
      let entryVisible = false;
      let entryY = 0;
      if (entryPrice != null && entryPrice >= targetMin && entryPrice <= targetMax) {
        entryVisible = true;
        entryY = toY(entryPrice);
        ctx.strokeStyle = TARGET_COLOR;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, entryY);
        ctx.lineTo(chartW, entryY);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Target badge on canvas
        const badgeX = chartW + 4;
        ctx.fillStyle = TARGET_COLOR;
        ctx.globalAlpha = 0.15;
        ctx.beginPath();
        ctx.roundRect(badgeX, entryY - 8, w - badgeX - 2, 16, 3);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = TARGET_COLOR;
        ctx.font = `bold ${fullscreen ? 11 : 8}px system-ui`;
        ctx.textAlign = "center";
        ctx.fillText("Target", badgeX + (w - badgeX - 2) / 2, entryY + 3);
      }

      // Main price line
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = toX(i);
        const y = toY(buf[i * FIELDS + 1]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Pulsing dot at tip
      const lastX = toX(n - 1);
      const lastY = toY(lastPrice);
      pulsePhase += 0.04;
      const pulseR = 4 + Math.sin(pulsePhase) * 2;
      const pulseAlpha = 0.8 + Math.sin(pulsePhase) * 0.2;

      // Glow
      ctx.globalAlpha = pulseAlpha * 0.3;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lastX, lastY, pulseR + 3, 0, Math.PI * 2);
      ctx.fill();

      // Main dot
      ctx.globalAlpha = pulseAlpha;
      ctx.beginPath();
      ctx.arc(lastX, lastY, pulseR, 0, Math.PI * 2);
      ctx.fill();

      // White center
      ctx.globalAlpha = 1;
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(lastX, lastY, 2, 0, Math.PI * 2);
      ctx.fill();

      // Dotted line from tip to right edge
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

      // Time axis labels
      ctx.fillStyle = "rgba(128, 128, 128, 0.7)";
      ctx.font = `${fullscreen ? 11 : 9}px system-ui`;
      ctx.textAlign = "center";
      const interval = Math.max(1, Math.floor(n / 5));
      for (let i = 0; i < n; i += interval) {
        ctx.fillText(fmtTime(buf[i * FIELDS]), toX(i), h - 4);
      }
      // Last time label
      const lastTimeX = toX(n - 1);
      const prevLabelX = toX(Math.floor((n - 1) / interval) * interval);
      if (lastTimeX - prevLabelX > 30) {
        ctx.fillText(fmtTime(buf[(n - 1) * FIELDS]), lastTimeX, h - 4);
      }

      // Grid price labels (right side)
      ctx.fillStyle = "rgba(128, 128, 128, 0.7)";
      ctx.font = `${fullscreen ? 11 : 8}px system-ui`;
      ctx.textAlign = "right";
      for (const level of gridLevels) {
        ctx.fillText(fmtPrice(level, assetClass), w - 2, toY(level) + 3);
      }

      // Update render state for overlay divs (current price badge + entry badge)
      const rs = renderStateRef.current;
      const changed = rs.lastPrice !== lastPrice || rs.color !== color || rs.lastY !== lastY / h * 100;
      rs.color = color;
      rs.isBull = isBull;
      rs.lastPrice = lastPrice;
      rs.lastY = (lastY / h) * 100;
      rs.domainMin = targetMin;
      rs.domainRange = dRange;
      rs.gridLevels = gridLevels;
      rs.entryY = (entryY / h) * 100;
      rs.entryVisible = entryVisible;

      // Trigger overlay update at ~10fps max to avoid React overhead
      if (changed && n !== lastFrameData) {
        lastFrameData = n;
        forceOverlayRef.current();
      }
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [priceHistory, entryPrice, assetClass, userBet, activeRound, fullscreen]);

  // Overlay force-update mechanism (decoupled from RAF to limit React renders)
  useEffect(() => {
    let overlayRaf = 0;
    let lastOverlayUpdate = 0;
    const OVERLAY_INTERVAL = 100; // 10fps for overlay divs

    const checkOverlay = () => {
      overlayRaf = requestAnimationFrame(checkOverlay);
      const now = performance.now();
      if (now - lastOverlayUpdate < OVERLAY_INTERVAL) return;
      lastOverlayUpdate = now;
      setTick();
    };

    forceOverlayRef.current = () => {}; // no-op, overlay self-updates
    overlayRaf = requestAnimationFrame(checkOverlay);
    return () => cancelAnimationFrame(overlayRaf);
  }, [setTick]);

  const n = priceHistory.length;
  if (n < 2) return null;

  const rs = renderStateRef.current;

  return (
    <div ref={containerRef} className="w-full select-none relative" style={{ height: fullscreen ? "100%" : 220 }}>
      <canvas ref={canvasRef} className="w-full h-full" style={{ display: "block" }} />

      {/* Current price badge (HTML overlay for crisp text) */}
      <div
        className={`absolute right-0 px-1.5 py-0.5 rounded-sm font-bold tabular-nums transition-all duration-150 ease-out ${fullscreen ? "text-xs" : "text-[8px]"}`}
        style={{
          top: `${rs.lastY}%`,
          transform: "translateY(-50%)",
          backgroundColor: rs.isBull ? UP : DOWN,
          color: "white",
        }}
      >
        {fmtPrice(rs.lastPrice, assetClass)}
      </div>

      {/* Entry price badge */}
      {rs.entryVisible && entryPrice != null && (
        <div
          className={`absolute right-0 px-1.5 py-0.5 rounded-sm font-bold tabular-nums ${fullscreen ? "text-xs" : "text-[8px]"}`}
          style={{
            top: `${rs.entryY}%`,
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
