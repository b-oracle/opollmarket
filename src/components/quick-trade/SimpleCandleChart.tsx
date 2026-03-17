import { memo, useRef, useEffect, useState, useMemo } from "react";
import type { OHLCCandle } from "@/lib/cryptoPriceProvider";

const UP = "hsl(142, 76%, 36%)";
const DOWN = "hsl(0, 84%, 60%)";
const UP_DIM = "hsla(142, 76%, 36%, 0.25)";
const DOWN_DIM = "hsla(0, 84%, 60%, 0.25)";
const GRID_COLOR = "rgba(128, 128, 128, 0.18)";
const ENTRY_COLOR = "#f59e0b";
const MA7_COLOR = "hsl(45, 93%, 58%)";
const MA14_COLOR = "hsl(280, 80%, 65%)";

const LERP_CONTRACT = 0.12;
const CHART_H_DEFAULT = 220;
const MAX_CANDLES = 60;

// Ring buffer: 5 fields per candle (ts, open, high, low, close)
const FIELDS = 5;
const BUFFER_CAP = MAX_CANDLES;

interface Props {
  ohlcData?: OHLCCandle[];
  priceHistory?: { time: string; price: number; ts: number }[];
  entryPrice: number | null;
  assetClass?: string;
  streamingPrice: number | null;
  chartMs?: number;
  precomputedMAs?: { ma7?: number; ma14?: number }[];
  fullscreen?: boolean;
}

function fmtPrice(p: number, ac?: string): string {
  if (ac === "forex") return p.toFixed(4);
  if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function synthesizeCandles(
  priceHistory: { ts: number; price: number }[],
  chartMs: number,
  maxCandles = MAX_CANDLES
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

interface OverlayState {
  lastPrice: number;
  lastY: number;
  isBull: boolean;
  entryY: number;
  entryVisible: boolean;
  gridLevels: { price: number; yPct: number }[];
}

function SimpleCandleChart({ ohlcData, priceHistory, entryPrice, assetClass, streamingPrice, chartMs, precomputedMAs, fullscreen }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const bufRef = useRef(new Float64Array(BUFFER_CAP * FIELDS));
  const bufLenRef = useRef(0);
  const domainMinRef = useRef<number | null>(null);
  const domainMaxRef = useRef<number | null>(null);
  const lastDataHashRef = useRef("");

  const [overlay, setOverlay] = useState<OverlayState>({
    lastPrice: 0, lastY: 50, isBull: true, entryY: 0, entryVisible: false, gridLevels: [],
  });
  const overlayRef = useRef(overlay);
  const lastOverlayTsRef = useRef(0);

  // Pre-process candle data into buffer
  const candles = useMemo(() => {
    if (ohlcData && ohlcData.length >= 2) {
      const slice = ohlcData.slice(-MAX_CANDLES);
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

  // Sync candles into ring buffer
  useEffect(() => {
    const n = candles.length;
    if (n < 2) { bufLenRef.current = 0; return; }
    const hash = `${n}-${candles[n - 1].close}-${candles[n - 1].time}`;
    if (hash === lastDataHashRef.current) return;
    lastDataHashRef.current = hash;

    const buf = bufRef.current;
    const count = Math.min(n, BUFFER_CAP);
    const startIdx = n - count;
    for (let i = 0; i < count; i++) {
      const c = candles[startIdx + i];
      const off = i * FIELDS;
      buf[off] = c.time;
      buf[off + 1] = c.open;
      buf[off + 2] = c.high;
      buf[off + 3] = c.low;
      buf[off + 4] = c.close;
    }
    bufLenRef.current = count;
  }, [candles]);

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

      const chartW = w * 0.85;
      const priceH = h * 0.78;
      const volH = h - priceH;
      const padTop = 4;
      const padBot = 2;

      // Domain with hysteresis
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < n; i++) {
        const high = buf[i * FIELDS + 2];
        const low = buf[i * FIELDS + 3];
        if (low < lo) lo = low;
        if (high > hi) hi = high;
      }
      const pad = (hi - lo) * 0.08 || 0.5;
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

      const toY = (price: number) => padTop + (priceH - padTop - padBot) * (1 - (price - tMin) / dRange);

      // Volume max
      let volMax = 0.001;
      for (let i = 0; i < n; i++) {
        const v = Math.abs(buf[i * FIELDS + 2] - buf[i * FIELDS + 3]) || 0.001;
        if (v > volMax) volMax = v;
      }

      // Grid lines
      const step = dRange / 5;
      const gridLevels: { price: number; yPct: number }[] = [];
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 0.5;
      for (let i = 1; i <= 4; i++) {
        const level = tMin + step * i;
        const gy = toY(level);
        gridLevels.push({ price: level, yPct: (gy / h) * 100 });
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(chartW, gy);
        ctx.stroke();
      }

      // Volume separator
      ctx.beginPath();
      ctx.moveTo(0, priceH);
      ctx.lineTo(chartW, priceH);
      ctx.stroke();

      const slotW = chartW / n;

      // Volume bars
      for (let i = 0; i < n; i++) {
        const open = buf[i * FIELDS + 1];
        const high = buf[i * FIELDS + 2];
        const low = buf[i * FIELDS + 3];
        const close = buf[i * FIELDS + 4];
        const vol = Math.abs(high - low) || 0.001;
        const barW = slotW * 0.7;
        const x = i * slotW + slotW * 0.15;
        const barH = (vol / volMax) * (volH - 4);
        ctx.fillStyle = close >= open ? UP_DIM : DOWN_DIM;
        ctx.fillRect(x, priceH + (volH - barH - 2), barW, Math.max(barH, 0.5));
      }

      // Candle sticks
      for (let i = 0; i < n; i++) {
        const open = buf[i * FIELDS + 1];
        const high = buf[i * FIELDS + 2];
        const low = buf[i * FIELDS + 3];
        const close = buf[i * FIELDS + 4];
        const bull = close >= open;
        const color = bull ? UP : DOWN;
        const cx = i * slotW + slotW / 2;
        const bodyW = slotW * 0.55;

        const wickTop = toY(high);
        const wickBot = toY(low);
        const bodyTop = toY(Math.max(open, close));
        const bodyBot = toY(Math.min(open, close));
        const bodyH = Math.max(bodyBot - bodyTop, 2.5);

        // Wick
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(cx, wickTop);
        ctx.lineTo(cx, wickBot);
        ctx.stroke();

        // Body
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.fillRect(cx - bodyW / 2, bodyTop, bodyW, bodyH);
      }

      // MA lines
      const drawMA = (key: "ma7" | "ma14", color: string) => {
        if (precomputedMAs && precomputedMAs.length === n) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.8;
          ctx.lineJoin = "round";
          ctx.beginPath();
          let started = false;
          for (let i = 0; i < n; i++) {
            const val = precomputedMAs[i]?.[key];
            if (val == null) continue;
            const x = i * slotW + slotW / 2;
            const y = toY(val);
            if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
          }
          if (started) ctx.stroke();
          ctx.globalAlpha = 1;
          return;
        }
        // Fallback: compute from buffer
        const period = key === "ma7" ? 7 : 14;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.8;
        ctx.lineJoin = "round";
        ctx.beginPath();
        let started = false;
        for (let i = period - 1; i < n; i++) {
          let sum = 0;
          for (let j = i - period + 1; j <= i; j++) sum += buf[j * FIELDS + 4];
          const avg = sum / period;
          const x = i * slotW + slotW / 2;
          const y = toY(avg);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        if (started) ctx.stroke();
        ctx.globalAlpha = 1;
      };

      drawMA("ma7", MA7_COLOR);
      drawMA("ma14", MA14_COLOR);

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

      // Current price dotted line
      const lastClose = buf[(n - 1) * FIELDS + 4];
      const lastOpen = buf[(n - 1) * FIELDS + 1];
      const isBull = lastClose >= lastOpen;
      const lastY = toY(lastClose);
      const lastCandleX = (n - 1) * slotW + slotW / 2;

      ctx.strokeStyle = isBull ? UP : DOWN;
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(lastCandleX, lastY);
      ctx.lineTo(w, lastY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // MA legend
      const fontSize = fullscreen ? 11 : 7;
      ctx.font = `600 ${fontSize}px system-ui`;
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = MA7_COLOR;
      ctx.textAlign = "left";
      ctx.fillText("MA7", 4, h - 4);
      ctx.fillStyle = MA14_COLOR;
      ctx.fillText("MA14", 4 + ctx.measureText("MA7").width + 8, h - 4);
      ctx.globalAlpha = 1;

      // Update overlay at ~10fps
      const now = performance.now();
      if (now - lastOverlayTsRef.current > 100) {
        lastOverlayTsRef.current = now;
        const lastYPct = (lastY / h) * 100;
        const prev = overlayRef.current;
        if (prev.lastPrice !== lastClose || Math.abs(prev.lastY - lastYPct) > 0.3 || prev.entryVisible !== entryVisible || prev.gridLevels.length !== gridLevels.length) {
          const next: OverlayState = { lastPrice: lastClose, lastY: lastYPct, isBull, entryY: entryYPct, entryVisible, gridLevels };
          overlayRef.current = next;
          setOverlay(next);
        }
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [candles, entryPrice, assetClass, precomputedMAs, fullscreen]);

  if (candles.length < 2) return null;

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

export default memo(SimpleCandleChart);
