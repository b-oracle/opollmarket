

# Add Early Prediction Advantage Explainer on Market Detail Page

## What Changes

Add a small info banner below the stats grid (before the OrderBook/Creator card) that explains early prediction advantages. It will be a collapsible tip using an `Info` icon, visible only on active (non-ended) markets.

## Technical Changes

### File: `src/pages/MarketDetail.tsx`

**After the stats grid (~line 920), before the OrderBook**, add a collapsible info tip:

```tsx
{!isEnded && (
  <div className="glass rounded-xl p-3 mb-4 flex gap-2.5 items-start">
    <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
    <div>
      <p className="text-xs font-semibold text-foreground">Early predictions get better pricing</p>
      <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
        Prices rise as more people predict on an option. Predicting early means you pay less per share and receive more shares — 
        resulting in a larger payout if you win.
      </p>
    </div>
  </div>
)}
```

- Add `Info` to the existing lucide-react import on line 6.

### Summary
- 1 file, ~10 lines added
- No backend changes

