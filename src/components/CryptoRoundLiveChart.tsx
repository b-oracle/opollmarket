import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeToPriceStream, fetchCryptoPrice } from "@/lib/cryptoPriceProvider";

interface Props {
  asset: string;                 // e.g. "BTC", "ETH", "SOL", "XRP", "BNB"
  targetPrice?: number | null;   // round open / "price to beat"
  operator?: string | null;      // "at_or_above" | "below" — determines up/down direction
  endsAt: string;                // ISO end timestamp (round end)
  startsAt?: string | null;      // ISO round start (defaults to endsAt - inferred 5m if not given)
  className?: string;
  height?: number;
}

interface Point { t: number; p: number }

const MAX_POINTS = 600;

// ── In-memory per-round point cache ──
// Keyed by `${SYMBOL}|${endsAtISO}` so distinct rounds (even same asset) get
// independent buffers and a fresh round naturally starts empty. We also evict
// rounds whose endsAt is more than 10 minutes in the past on every read/write
// to bound memory across long sessions.
const ROUND_CACHE = new Map<string, Point[]>();
const ROUND_CACHE_TTL_MS = 10 * 60 * 1000;

const cacheKeyFor = (sym: string, endsAt: string) => `${sym}|${endsAt}`;

const purgeExpiredRounds = () => {
  const cutoff = Date.now() - ROUND_CACHE_TTL_MS;
  for (const key of ROUND_CACHE.keys()) {
    const idx = key.indexOf("|");
    if (idx < 0) continue;
    const endMs = new Date(key.slice(idx + 1)).getTime();
    if (Number.isFinite(endMs) && endMs < cutoff) ROUND_CACHE.delete(key);
  }
};

const readRoundCache = (key: string): Point[] => {
  purgeExpiredRounds();
  const entry = ROUND_CACHE.get(key);
  return entry ? entry.slice() : [];
};

const writeRoundCache = (key: string, points: Point[]) => {
  // Trim before storing so we never blow past MAX_POINTS in the cache either.
  ROUND_CACHE.set(
    key,
    points.length > MAX_POINTS ? points.slice(points.length - MAX_POINTS) : points.slice(),
  );
};

const fmtUsd = (p: number) => {
  if (p >= 1000) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(4)}`;
};

const fmtClock = (ms: number) => {
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

/**
 * Live, real-time line chart for crypto Up/Down rounds (BTC, ETH, SOL, XRP, BNB...).
 * Streams prices from Binance WebSocket and renders an SVG sparkline with the
 * round's target ("price to beat") shown as a dashed reference line.
 */
const CryptoRoundLiveChart = ({
  asset,
  targetPrice,
  operator,
  endsAt,
  startsAt,
  className,
  height = 220,
}: Props) => {
  const sym = asset?.toUpperCase();
  const cacheKey = sym ? cacheKeyFor(sym, endsAt) : "";

  // Hydrate synchronously from the in-memory cache so the chart paints with
  // history on the very first render — no waiting for the first WS tick.
  const [points, setPoints] = useState<Point[]>(() =>
    cacheKey ? readRoundCache(cacheKey) : [],
  );
  const [last, setLast] = useState<number | null>(() => {
    const cached = cacheKey ? readRoundCache(cacheKey) : [];
    return cached.length ? cached[cached.length - 1].p : null;
  });
  const [now, setNow] = useState(() => Date.now());
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);

  type RangeKey = "1m" | "5m" | "15m" | "all";
  const [range, setRange] = useState<RangeKey>("all");
  const RANGE_MS: Record<RangeKey, number | null> = {
    "1m": 60_000,
    "5m": 5 * 60_000,
    "15m": 15 * 60_000,
    all: null,
  };

  // Re-hydrate when the round (or asset) changes mid-mount.
  useEffect(() => {
    if (!cacheKey) return;
    const cached = readRoundCache(cacheKey);
    setPoints(cached);
    setLast(cached.length ? cached[cached.length - 1].p : null);
  }, [cacheKey]);

  // Tick clock
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Resize observer for responsive width (debounced via rAF)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver((entries) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        for (const e of entries) setWidth(Math.max(200, e.contentRect.width));
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // Seed with a one-off REST fetch for an instant first point (in case WS is slow)
  useEffect(() => {
    if (!sym) return;
    let cancelled = false;
    fetchCryptoPrice(sym).then((p) => {
      if (cancelled || p == null) return;
      setPoints((prev) => {
        if (prev.length) return prev;
        const seeded = [{ t: Date.now(), p }];
        if (cacheKey) writeRoundCache(cacheKey, seeded);
        return seeded;
      });
      setLast((prev) => prev ?? p);
    });
    return () => { cancelled = true; };
  }, [sym, cacheKey]);

  // Subscribe to live stream — buffer ticks in a ref and flush on a throttled
  // interval to avoid one React re-render per WS message (Binance can stream
  // many trades/sec). Mobile devices benefit most from this batching.
  const bufferRef = useRef<Point[]>([]);
  const lastFlushedPriceRef = useRef<number | null>(null);
  const FLUSH_MS = 200; // ~5 state updates/sec is plenty for a smoothed chart

  useEffect(() => {
    if (!sym) return;
    const unsub = subscribeToPriceStream(sym, (price) => {
      const t = Date.now();
      const buf = bufferRef.current;
      const tail = buf[buf.length - 1];
      // Coalesce sub-FLUSH_MS ticks into the latest sample
      if (tail && t - tail.t < FLUSH_MS) {
        tail.t = t;
        tail.p = price;
      } else {
        buf.push({ t, p: price });
      }
    });
    return unsub;
  }, [sym]);

  // Throttled flush: copy buffered ticks into React state every FLUSH_MS,
  // and persist the result to the per-round cache for instant rehydration.
  useEffect(() => {
    const id = setInterval(() => {
      const buf = bufferRef.current;
      if (buf.length === 0) return;
      const drained = buf.splice(0, buf.length);
      const newest = drained[drained.length - 1];

      if (newest.p !== lastFlushedPriceRef.current) {
        lastFlushedPriceRef.current = newest.p;
        setLast(newest.p);
      }

      setPoints((prev) => {
        const merged = prev.concat(drained);
        const trimmed =
          merged.length > MAX_POINTS ? merged.slice(merged.length - MAX_POINTS) : merged;
        if (cacheKey) writeRoundCache(cacheKey, trimmed);
        return trimmed;
      });
    }, FLUSH_MS);
    return () => clearInterval(id);
  }, [cacheKey]);

  const endMs = useMemo(() => new Date(endsAt).getTime(), [endsAt]);
  const startMs = useMemo(() => {
    if (startsAt) return new Date(startsAt).getTime();
    // Infer round start as endMs - elapsed-since-first-point or fallback 5m
    if (points.length > 0) return Math.min(points[0].t, endMs - 5 * 60_000);
    return endMs - 5 * 60_000;
  }, [startsAt, endMs, points]);

  const remaining = endMs - now;
  const ended = remaining <= 0;
  const untilStart = startMs - now;
  const notStarted = untilStart > 0;

  const tzShort = (() => {
    try {
      return new Intl.DateTimeFormat([], { timeZoneName: "short" })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName")?.value ?? "";
    } catch { return ""; }
  })();

  const fmtFull = (ms: number) =>
    new Date(ms).toLocaleString([], {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });

  // Build domain/scales
  const H = height;
  const W = width;
  const padTop = 12;
  const padBot = 26;
  const padRight = 56;
  const chartW = W - padRight;

  const tMin = useMemo(() => {
    const span = RANGE_MS[range];
    if (!span) return startMs;
    const right = ended ? endMs : Math.min(endMs, now);
    return Math.max(startMs, right - span);
  }, [range, startMs, endMs, ended, now]);
  const tMax = useMemo(() => {
    const span = RANGE_MS[range];
    if (!span) return endMs;
    return Math.min(endMs, tMin + span);
  }, [range, endMs, tMin]);

  const visiblePoints = useMemo(
    () => (range === "all" ? points : points.filter((pt) => pt.t >= tMin)),
    [points, range, tMin],
  );

  const prices = visiblePoints.map((p) => p.p);
  if (targetPrice != null && Number.isFinite(targetPrice)) prices.push(targetPrice);
  if (last != null) prices.push(last);
  let lo = prices.length ? Math.min(...prices) : 0;
  let hi = prices.length ? Math.max(...prices) : 1;
  if (lo === hi) {
    const pad = lo * 0.0005 || 0.5;
    lo -= pad;
    hi += pad;
  } else {
    const pad = (hi - lo) * 0.15;
    lo -= pad;
    hi += pad;
  }

  const toX = (t: number) => {
    const clamped = Math.max(tMin, Math.min(tMax, t));
    return ((clamped - tMin) / (tMax - tMin)) * chartW;
  };
  const toY = (p: number) => padTop + (H - padTop - padBot) * (1 - (p - lo) / (hi - lo));

  // Direction color: green when current beats target in user's "up" sense
  const isUp = last != null && targetPrice != null
    ? (operator === "below" ? last < targetPrice : last >= targetPrice)
    : (points.length > 1 ? points[points.length - 1].p >= points[0].p : true);

  const stroke = isUp ? "hsl(var(--neon-yes))" : "hsl(var(--neon-no))";
  const fill = isUp ? "hsl(var(--neon-yes) / 0.18)" : "hsl(var(--neon-no) / 0.18)";

  // Smoothed line path: quadratic Bézier through the midpoint of each pair of
  // consecutive points. Cheap (no spline math, ~1 mul/add per point) and
  // visually smoother than straight-line segments — especially on mobile where
  // jagged sub-pixel polylines look noisy.
  const linePath = useMemo(() => {
    if (visiblePoints.length === 0) return "";
    const pts = visiblePoints.map((p) => ({ x: toX(p.t), y: toY(p.p) }));
    if (pts.length === 1) return `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
    let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const cur = pts[i];
      const next = pts[i + 1];
      const mx = ((cur.x + next.x) / 2).toFixed(2);
      const my = ((cur.y + next.y) / 2).toFixed(2);
      d += ` Q${cur.x.toFixed(2)},${cur.y.toFixed(2)} ${mx},${my}`;
    }
    const lastPt = pts[pts.length - 1];
    d += ` T${lastPt.x.toFixed(2)},${lastPt.y.toFixed(2)}`;
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblePoints, width, lo, hi, tMin, tMax, H]);

  const areaPath = visiblePoints.length
    ? `${linePath} L${toX(visiblePoints[visiblePoints.length - 1].t).toFixed(2)},${H - padBot} L${toX(visiblePoints[0].t).toFixed(2)},${H - padBot} Z`
    : "";

  // Y-axis ticks (4)
  const yTicks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);

  const lastY = last != null ? toY(last) : H / 2;
  const lastX = points.length ? toX(points[points.length - 1].t) : chartW;

  const targetY = targetPrice != null && Number.isFinite(targetPrice) ? toY(targetPrice) : null;

  const delta = last != null && targetPrice != null ? last - targetPrice : null;

  return (
    <div ref={containerRef} className={`relative w-full ${className ?? ""}`} style={{ height: H }}>
      {/* Header strip */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between gap-2 px-1 pb-1">
        <div className="flex items-center gap-2">
          {notStarted ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              <span className="relative flex items-center">
                <span className="absolute inline-flex h-2 w-2 rounded-full bg-primary opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Starts in
              <span className="font-mono tabular-nums text-foreground normal-case tracking-normal">
                {fmtClock(untilStart)}
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-destructive">
              <span className="relative flex items-center">
                <span className="absolute inline-flex h-2 w-2 rounded-full bg-destructive opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
              </span>
              {ended ? "Resolved" : "Live"}
            </span>
          )}
          {last != null && (
            <span className="text-sm font-bold tabular-nums text-foreground">{fmtUsd(last)}</span>
          )}
          {delta != null && !notStarted && (
            <span className={`text-[11px] font-semibold tabular-nums ${delta >= 0 ? "text-[hsl(var(--neon-yes))]" : "text-[hsl(var(--neon-no))]"}`}>
              {delta >= 0 ? "▲" : "▼"} {fmtUsd(Math.abs(delta))}
            </span>
          )}
        </div>
        {!ended && !notStarted && (
          <span className="text-[11px] font-mono tabular-nums text-muted-foreground" title="Time remaining in round">
            {fmtClock(remaining)}
          </span>
        )}
      </div>

      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block">
        {/* Y grid */}
        {yTicks.map((p, i) => {
          const y = toY(p);
          return (
            <g key={i}>
              <line x1={0} x2={chartW} y1={y} y2={y} stroke="hsl(var(--border))" strokeOpacity={0.35} strokeDasharray="2 3" strokeWidth={0.5} />
              <text x={W - 4} y={y + 3} textAnchor="end" className="fill-muted-foreground" style={{ fontSize: 10 }}>
                {fmtUsd(p)}
              </text>
            </g>
          );
        })}

        {/* Target (price to beat) line */}
        {targetY != null && (
          <g>
            <line x1={0} x2={chartW} y1={targetY} y2={targetY} stroke="hsl(var(--primary))" strokeDasharray="4 3" strokeWidth={1} opacity={0.9} />
            <rect x={W - padRight + 2} y={targetY - 8} width={padRight - 4} height={16} rx={3} fill="hsl(var(--primary))" opacity={0.9} />
            <text x={W - 4} y={targetY + 3} textAnchor="end" className="fill-primary-foreground" style={{ fontSize: 10, fontWeight: 700 }}>
              {targetPrice != null ? fmtUsd(targetPrice) : ""}
            </text>
          </g>
        )}

        {/* Area + line */}
        {points.length > 1 && (
          <>
            <path d={areaPath} fill={fill} />
            <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}

        {/* Current price marker + dotted to right edge */}
        {last != null && points.length > 0 && (
          <>
            <line x1={lastX} x2={chartW} y1={lastY} y2={lastY} stroke={stroke} strokeOpacity={0.5} strokeDasharray="2 2" strokeWidth={0.8} />
            <circle cx={lastX} cy={lastY} r={3} fill={stroke} />
            <rect x={W - padRight + 2} y={lastY - 8} width={padRight - 4} height={16} rx={3} fill={stroke} />
            <text x={W - 4} y={lastY + 3} textAnchor="end" fill="white" style={{ fontSize: 10, fontWeight: 700 }}>
              {fmtUsd(last)}
            </text>
          </>
        )}
      </svg>

      {/* X-axis labels: exact start / end timestamps */}
      <div
        className="absolute left-0 right-[56px] bottom-0 flex justify-between gap-2 text-[10px] tabular-nums text-muted-foreground px-0.5"
        title={`Start: ${new Date(startMs).toISOString()}\nEnd: ${new Date(endMs).toISOString()}`}
      >
        <span className="truncate">
          <span className="opacity-60 mr-1">Start</span>
          {fmtFull(startMs)}{tzShort ? ` ${tzShort}` : ""}
        </span>
        <span className="truncate text-right">
          <span className="opacity-60 mr-1">End</span>
          {fmtFull(endMs)}{tzShort ? ` ${tzShort}` : ""}
        </span>
      </div>
    </div>
  );
};

export default CryptoRoundLiveChart;
