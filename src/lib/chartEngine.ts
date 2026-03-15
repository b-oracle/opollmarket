/**
 * Production-grade chart engine with wall-clock aligned candle buckets.
 * Separates tick ingestion from candle aggregation and rendering.
 * 
 * Architecture:
 *   Tick Stream → Tick Buffer → Candle Aggregator → Renderer
 * 
 * Rules:
 *   - One active candle per timeframe bucket
 *   - Active candle stays alive for full bucket duration
 *   - Closed candles are immutable
 *   - Bucket boundaries align to wall-clock (e.g. 5m = :00, :05, :10...)
 */

// ── Types ──

export interface Tick {
  ts: number;   // unix ms
  price: number;
}

export interface Candle {
  ts: number;        // bucket start (unix ms)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;    // tick count
  closed: boolean;   // immutable once true
  ma7?: number;
  ma14?: number;
}

export interface ChartEngineState {
  timeframeMs: number;
  tickBuffer: Tick[];
  candles: Candle[];           // closed, immutable candles
  activeCandle: Candle | null; // currently forming candle
  lastTick: Tick | null;
}

export interface LinePoint {
  ts: number;
  price: number;
}

// ── Timeframe utilities ──

const TIMEFRAME_MS_MAP: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

export function getTimeframeMs(timeframe: string): number {
  return TIMEFRAME_MS_MAP[timeframe] || 60_000;
}

/**
 * Get the wall-clock aligned bucket start for a given timestamp.
 * e.g. for 5m: ts at 14:03:22 → bucket start at 14:00:00
 */
export function getBucketStart(ts: number, tfMs: number): number {
  return Math.floor(ts / tfMs) * tfMs;
}

export function getBucketEnd(ts: number, tfMs: number): number {
  return getBucketStart(ts, tfMs) + tfMs;
}

export function isSameBucket(tsA: number, tsB: number, tfMs: number): boolean {
  return getBucketStart(tsA, tfMs) === getBucketStart(tsB, tfMs);
}

/**
 * Time remaining in the current bucket (ms).
 */
export function getBucketTimeRemaining(ts: number, tfMs: number): number {
  return getBucketEnd(ts, tfMs) - ts;
}

// ── Candle operations ──

export function createCandle(openPrice: number, bucketStart: number): Candle {
  return {
    ts: bucketStart,
    open: openPrice,
    high: openPrice,
    low: openPrice,
    close: openPrice,
    volume: 1,
    closed: false,
  };
}

export function updateCandleWithTick(candle: Candle, tickPrice: number): Candle {
  if (candle.closed) return candle; // never mutate closed candles
  return {
    ...candle,
    high: Math.max(candle.high, tickPrice),
    low: Math.min(candle.low, tickPrice),
    close: tickPrice,
    volume: candle.volume + 1,
  };
}

export function finalizeCandle(candle: Candle): Candle {
  return { ...candle, closed: true };
}

export function rollToNextCandle(previousCandle: Candle, nextBucketStart: number): Candle {
  return createCandle(previousCandle.close, nextBucketStart);
}

// ── Candle aggregation from ticks ──

/** Maximum gap candles to fill to prevent runaway allocation */
const MAX_GAP_FILL = 500;

/**
 * Rebuild candles from a tick buffer for a given timeframe.
 * Used when switching timeframes or initializing from history.
 */
export function rebuildCandlesFromTicks(ticks: Tick[], tfMs: number): { candles: Candle[]; activeCandle: Candle | null } {
  if (ticks.length === 0) return { candles: [], activeCandle: null };

  const now = Date.now();
  const sorted = [...ticks].sort((a, b) => a.ts - b.ts);
  const candleMap = new Map<number, Candle>();

  for (const tick of sorted) {
    const bucketStart = getBucketStart(tick.ts, tfMs);
    const existing = candleMap.get(bucketStart);
    if (existing) {
      candleMap.set(bucketStart, updateCandleWithTick(existing, tick.price));
    } else {
      candleMap.set(bucketStart, createCandle(tick.price, bucketStart));
    }
  }

  // Sort by bucket time
  const allCandles = Array.from(candleMap.values()).sort((a, b) => a.ts - b.ts);
  
  // Fill gaps between candles (carry forward close price) — capped to prevent OOM
  const filledCandles: Candle[] = [];
  for (let i = 0; i < allCandles.length; i++) {
    if (i > 0) {
      const prevEnd = allCandles[i - 1].ts + tfMs;
      let gapStart = prevEnd;
      let gapCount = 0;
      while (gapStart < allCandles[i].ts && gapCount < MAX_GAP_FILL) {
        const gapCandle = createCandle(allCandles[i - 1].close, gapStart);
        gapCandle.volume = 0;
        filledCandles.push(gapCandle);
        gapStart += tfMs;
        gapCount++;
      }
    }
    filledCandles.push(allCandles[i]);
  }

  // Determine which bucket is currently active
  const currentBucketStart = getBucketStart(now, tfMs);
  
  const closedCandles: Candle[] = [];
  let activeCandle: Candle | null = null;

  for (const candle of filledCandles) {
    if (candle.ts === currentBucketStart) {
      activeCandle = { ...candle, closed: false };
    } else if (candle.ts < currentBucketStart) {
      closedCandles.push(finalizeCandle(candle));
    }
    // Future buckets are ignored
  }

  // If no active candle but we have data, create one from last close
  if (!activeCandle && closedCandles.length > 0) {
    const lastClosed = closedCandles[closedCandles.length - 1];
    activeCandle = createCandle(lastClosed.close, currentBucketStart);
  }

  return { candles: closedCandles, activeCandle };
}

/**
 * Build candles from pre-existing price history points.
 * Used to initialize from historical data (Binance klines, etc).
 */
export function buildCandlesFromHistory(
  points: { ts: number; price: number }[],
  tfMs: number
): { candles: Candle[]; activeCandle: Candle | null } {
  const ticks: Tick[] = points.map(p => ({ ts: p.ts, price: p.price }));
  return rebuildCandlesFromTicks(ticks, tfMs);
}

// ── Moving average computation ──

/**
 * Compute MAs without mutating the source candles.
 * Returns new candle objects with ma7/ma14 set.
 */
export function computeMAs(candles: Candle[], active: Candle | null): (Candle & { ma7?: number; ma14?: number })[] {
  const all: (Candle & { ma7?: number; ma14?: number })[] = candles.map(c => ({ ...c }));
  if (active) all.push({ ...active });

  for (let i = 0; i < all.length; i++) {
    if (i >= 6) {
      let sum = 0;
      for (let j = i - 6; j <= i; j++) sum += all[j].close;
      all[i].ma7 = sum / 7;
    }
    if (i >= 13) {
      let sum = 0;
      for (let j = i - 13; j <= i; j++) sum += all[j].close;
      all[i].ma14 = sum / 14;
    }
  }

  return all;
}

// ── Line chart points from candles ──

/**
 * Generate smooth line chart points from candles.
 * Each candle contributes its close price at the bucket end.
 * The active candle contributes the current close at "now".
 */
export function candlesToLinePoints(candles: Candle[], activeCandle: Candle | null, tfMs: number): LinePoint[] {
  const points: LinePoint[] = [];

  for (const c of candles) {
    // Use bucket end time for closed candle close price
    points.push({ ts: c.ts + tfMs, price: c.close });
  }

  if (activeCandle) {
    // Active candle's close tracks current price at "now"
    points.push({ ts: Date.now(), price: activeCandle.close });
  }

  return points;
}

// ── Chart Engine class ──

export class ChartEngine {
  private state: ChartEngineState;
  private maxTickBuffer: number;
  private maxCandles: number;
  private onChange: (() => void) | null = null;

  constructor(timeframeMs: number, maxCandles = 200, maxTickBuffer = 10000) {
    this.maxCandles = maxCandles;
    this.maxTickBuffer = maxTickBuffer;
    this.state = {
      timeframeMs,
      tickBuffer: [],
      candles: [],
      activeCandle: null,
      lastTick: null,
    };
  }

  setOnChange(cb: () => void) {
    this.onChange = cb;
  }

  getState(): Readonly<ChartEngineState> {
    return this.state;
  }

  /**
   * Initialize from historical price data.
   */
  initFromHistory(points: { ts: number; price: number }[]) {
    // Populate tick buffer
    this.state.tickBuffer = points.map(p => ({ ts: p.ts, price: p.price }));
    if (this.state.tickBuffer.length > this.maxTickBuffer) {
      this.state.tickBuffer = this.state.tickBuffer.slice(-this.maxTickBuffer);
    }

    // Build candles
    const { candles, activeCandle } = rebuildCandlesFromTicks(this.state.tickBuffer, this.state.timeframeMs);
    this.state.candles = candles.slice(-this.maxCandles);
    this.state.activeCandle = activeCandle;
    this.state.lastTick = this.state.tickBuffer.length > 0 ? this.state.tickBuffer[this.state.tickBuffer.length - 1] : null;
    this.onChange?.();
  }

  /**
   * Process a new tick from the live stream.
   * This is the main entry point for real-time updates.
   */
  processTick(price: number, ts: number = Date.now()) {
    const tick: Tick = { ts, price };
    
    // Add to tick buffer — use ring-buffer style trim to reduce GC
    this.state.tickBuffer.push(tick);
    if (this.state.tickBuffer.length > this.maxTickBuffer * 1.2) {
      this.state.tickBuffer = this.state.tickBuffer.slice(-this.maxTickBuffer);
    }
    this.state.lastTick = tick;

    const tfMs = this.state.timeframeMs;
    const currentBucketStart = getBucketStart(ts, tfMs);

    // Check if we need to roll to a new candle
    if (this.state.activeCandle) {
      if (this.state.activeCandle.ts === currentBucketStart) {
        // Same bucket: update active candle in place
        this.state.activeCandle = updateCandleWithTick(this.state.activeCandle, price);
      } else {
        // Bucket boundary crossed: finalize active, possibly fill gaps, create new
        const finalizedActive = finalizeCandle(this.state.activeCandle);
        this.state.candles.push(finalizedActive);

        // Fill any gap buckets between old active and current bucket (capped)
        let gapStart = finalizedActive.ts + tfMs;
        let gapCount = 0;
        while (gapStart < currentBucketStart && gapCount < MAX_GAP_FILL) {
          const lastClose = this.state.candles[this.state.candles.length - 1].close;
          const gapCandle = createCandle(lastClose, gapStart);
          gapCandle.volume = 0;
          this.state.candles.push(finalizeCandle(gapCandle));
          gapStart += tfMs;
          gapCount++;
        }

        // Trim old candles
        if (this.state.candles.length > this.maxCandles) {
          this.state.candles = this.state.candles.slice(-this.maxCandles);
        }

        // Create new active candle
        const lastClose = this.state.candles[this.state.candles.length - 1].close;
        this.state.activeCandle = createCandle(lastClose, currentBucketStart);
        this.state.activeCandle = updateCandleWithTick(this.state.activeCandle, price);
      }
    } else {
      // No active candle yet: create one
      this.state.activeCandle = createCandle(price, currentBucketStart);
    }

    this.onChange?.();
  }

  /**
   * Switch timeframe: rebuild all candles from tick buffer.
   */
  setTimeframe(timeframeMs: number) {
    this.state.timeframeMs = timeframeMs;
    const { candles, activeCandle } = rebuildCandlesFromTicks(this.state.tickBuffer, timeframeMs);
    this.state.candles = candles.slice(-this.maxCandles);
    this.state.activeCandle = activeCandle;
    this.onChange?.();
  }

  /**
   * Get all candles including active for rendering.
   * Active candle is the last element (closed=false).
   */
  getAllCandles(): Candle[] {
    const all = [...this.state.candles];
    if (this.state.activeCandle) all.push(this.state.activeCandle);
    return all;
  }

  /**
   * Get candles with MAs computed.
   */
  getCandlesWithMAs(): Candle[] {
    return computeMAs(this.state.candles, this.state.activeCandle);
  }

  /**
   * Get line chart points.
   */
  getLinePoints(): LinePoint[] {
    return candlesToLinePoints(this.state.candles, this.state.activeCandle, this.state.timeframeMs);
  }

  /**
   * Get time remaining in current bucket (ms).
   */
  getBucketCountdown(): number {
    if (!this.state.activeCandle) return 0;
    return getBucketTimeRemaining(Date.now(), this.state.timeframeMs);
  }

  /**
   * Get the active candle's bucket boundaries.
   */
  getActiveBucketInfo(): { start: number; end: number; progress: number } | null {
    if (!this.state.activeCandle) return null;
    const start = this.state.activeCandle.ts;
    const end = start + this.state.timeframeMs;
    const progress = Math.min((Date.now() - start) / this.state.timeframeMs, 1);
    return { start, end, progress };
  }
}