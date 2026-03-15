

## Diagnosis: Double-Interpolation + Excessive Re-renders

The TradingView chart jerks because of **two compounding issues**:

### Problem 1: `streamingPrice` is React state causing ~25 re-renders/sec
`QuickTrade.tsx` calls `setStreamingPrice(price)` at 25fps (line 627). This is React state, so every call re-renders `QuickTrade` → `QuickTradeChart` → `TradingViewChart`. TradingViewChart already has its own internal `requestAnimationFrame` loop that smoothly interpolates prices — it only needs the **target** price via a ref, not 25 state-driven re-renders per second.

### Problem 2: Double interpolation
QuickTrade's crypto loop lerps raw WS ticks at 0.25 rate (line 620), then feeds that already-smoothed value into TradingView's own lerp at 0.08 rate (line 471). Two cascading lerps with different rates create uneven motion — the target keeps shifting before the inner lerp finishes catching up.

### Problem 3: `setDotColor` inside `useEffect([streamingPrice])`
Line 580 calls `setDotColor()` on every streaming tick, triggering yet another re-render cycle on top of the prop-driven one.

---

## Fix Plan

### 1. Convert `streamingPrice` from state to ref in QuickTrade
- Replace `const [streamingPrice, setStreamingPrice] = useState(null)` with a ref + a less-frequent state update
- Create `streamingPriceRef = useRef<number | null>(null)` for high-frequency updates
- Keep a throttled state version (e.g., every 500ms) only for components that need React re-renders (like P&L display)
- Pass `streamingPriceRef` to TradingViewChart instead of the state value

### 2. Pass streaming price via ref/callback to TradingViewChart
- Add an `onStreamingPriceRef` prop or expose a ref-based API so QuickTrade can push price updates directly into `targetStreamingPriceRef` without causing re-renders
- Alternative (simpler): TradingViewChart accepts a `streamingPriceRef` (React ref) and reads it in its animation loop instead of relying on `useEffect([streamingPrice])`

### 3. Remove `setDotColor` from the streaming effect
- Compute dot color inside the animation loop (already has `dir` variable) and apply it directly to the DOM element via ref, avoiding React state entirely

### 4. Eliminate double-lerp for crypto
- When chart type is `tv`, pass the **raw WS tick price** (not the QuickTrade-interpolated value) as the target. TradingView's own lerp handles smoothing.
- In `handleWsTick`, update a separate ref that TradingViewChart reads directly

### Files to modify:
- `src/pages/QuickTrade.tsx` — streaming price ref + throttled state
- `src/components/TradingViewChart.tsx` — ref-based price input, remove `setDotColor` from effect, apply dot color via DOM
- `src/components/quick-trade/QuickTradeChart.tsx` — pass ref through

