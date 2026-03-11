

## Add Low-Time Pulse Animation to Quick Trade Countdown

### Changes

**1. `src/index.css`** — Add a `scale-pulse` keyframe that subtly scales up/down (no opacity):
```css
@keyframes scale-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}
```

**2. `src/pages/QuickTrade.tsx`** (~line 1028-1031) — Apply the scale-pulse animation when `timeLeft <= 10`:
- `timeLeft <= 10`: red text + `animate-[scale-pulse_0.6s_ease-in-out_infinite]`
- `timeLeft <= 30`: amber text (no animation)
- Otherwise: normal foreground text

This gives a heartbeat-like scale effect in the final 10 seconds without any opacity flickering.

