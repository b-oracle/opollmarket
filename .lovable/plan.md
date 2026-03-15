
Goal: make candlestick/area chart transitions seamless (no visible “refresh/scatter” on new candle) and remove the blue progress loader under the chart.

1) Deep diagnosis summary (what is actually causing the scatter)
- Engine is being re-initialized too often:
  - `QuickTrade.tsx` builds `engineHistoryPoints` from `priceHistory` updates.
  - `useChartEngine.ts` re-runs `initFromHistory` when history length/last ts changes.
  - Result: the live engine keeps resetting during streaming, which looks like chart refresh.
- History source is unstable:
  - live append logic trims raw cache aggressively (count-based), so available history range can collapse.
  - engine sometimes has too few candles, then `QuickTradeChart.tsx` flips between engine data and fallback data.
  - this source-switch causes sudden zoom/layout jumps.
- Visual y-domain currently auto-recomputes sharply:
  - when a new candle starts and oldest candle drops, domain can contract abruptly.
  - that creates the “zoomed/scattered then normal again” effect.
- Blue “loader” is the `bucketProgress` bar in `BucketBadges`.

2) Implementation plan
A. Stabilize engine data lifecycle (no reset loops)
- File: `src/hooks/useChartEngine.ts`
- Rework history init to run only on true seed changes (asset/timeframe/history version), not every incoming history append.
- Add explicit `assetKey` + `historyVersion` inputs so engine reset is intentional.
- Keep `processTick` as the only live mutator between resets.

B. Split “engine seed history” from “UI streaming history”
- File: `src/pages/QuickTrade.tsx`
- Maintain a stable seed dataset for engine (from fetched historical raw data + controlled updates).
- Stop coupling engine seed to high-frequency `priceHistory` updates.
- Keep enough retained history for timeframe aggregation continuity (especially 1m/5m/15m).

C. Remove source bouncing in chart renderer
- File: `src/components/quick-trade/QuickTradeChart.tsx`
- Once engine is ready for a chart mode, keep renderer on engine data (no back-and-forth fallback switching).
- Keep fallback only for initial bootstrap state.

D. Remove blue progress loader
- File: `src/components/quick-trade/QuickTradeChart.tsx`
- Remove `bucketProgress` bar rendering from `BucketBadges` (both normal and fullscreen paths).
- Keep only timer badge (unless you want timer hidden too in a follow-up).

E. Smooth y-axis domain to eliminate sudden “zoom pop”
- Files:
  - `src/components/quick-trade/SimpleCandleChart.tsx`
  - `src/components/quick-trade/SimpleAreaChart.tsx`
- Introduce sticky/smoothed domain behavior:
  - expand immediately when price exceeds bounds,
  - contract gradually (hysteresis) instead of instant shrink.
- This prevents sharp re-scaling when candle window rolls.

F. Zoom wrapper hardening (safety)
- File: `src/components/quick-trade/ChartZoomWrapper.tsx`
- Ensure base viewBox cache is reset only when actual chart type/svg identity changes, not on normal tick renders.
- Prevent transient viewBox mismatch during content transitions.

3) Technical details (implementation specifics)
- Add `historyVersion` increment points in `QuickTrade.tsx`:
  - after initial history fetch for selected asset,
  - after timeframe switch recalculation,
  - after explicit reconnect resync.
- `useChartEngine` init effect should key off:
  - `tfMs`, `assetKey`, `historyVersion`, and “history available”.
- Keep line/candle rendering from engine as single source of truth after ready.
- Domain smoothing parameters (initial target):
  - immediate expand,
  - contract lerp ~8–12% per second,
  - minimum vertical range floor to avoid micro-zoom.

4) Acceptance checklist
- No visible scatter/zoom pop when a new 1m candle opens.
- No chart “refresh” feel at candle boundary.
- No blue progress line below chart.
- Timer remains synchronized.
- Timeframe switching still rebuilds correct candle structure and stays stable after switch.
