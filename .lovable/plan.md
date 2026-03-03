

## Plan: Add Market End Date / Time Remaining to Share Screenshot Overlay

### Changes

**`src/components/MarketCard.tsx`** (line ~230)
- Add a `Clock` icon + `getTimeRemaining(market.endDate)` text next to the existing timestamp
- Style: `text-[10px] text-white/50 font-mono` with a `·` separator, matching the existing timestamp aesthetic

**`src/pages/MarketDetail.tsx`** (line ~331)  
- Same addition next to the existing timestamp line
- `getTimeRemaining` already exists in this file (line 25)

Both files already import `Clock` and have `getTimeRemaining` defined — just need to insert the text.

### Example output in overlay
```
YES 65%  NO 35%          ⏱ 23d left · Mar 3, 2026 · 02:15 PM
```

