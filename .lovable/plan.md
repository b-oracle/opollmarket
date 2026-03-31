

# Enhance Prediction Modal: Show Price-per-Share & Accurate Payout Estimate

## What Changes

The BetModal already displays entry price, shares, and potential payout. The improvements are:

1. **Add market type awareness** — pass `marketType` into BetModal so it can distinguish binary vs range/multi-option markets.

2. **Show a clearer "Price per Share" row** with a help note explaining what it means (e.g. "You pay 35¢ per share").

3. **Fix the payout estimate for range/multi markets** — currently `potentialPayout = shares` assumes $1/share resolution (binary). For range/multi markets, show "Payout depends on final pool distribution" instead of a misleading fixed number.

4. **Fix the confirm step disclaimer** — line 628 says "Shares resolve at $1.00 or $0.00" which is only true for binary markets. For range/multi, change to "Payout is proportional to the total pool split among winners."

## Technical Changes

### File: `src/components/BetModal.tsx`
- Add `marketType?: string` to `BetModalProps`
- Derive `isParimutuel = marketType === "multi" || marketType === "range"`
- In the input summary section (~line 396-436):
  - Add a note under "Potential Payout" for parimutuel markets: "Estimated at $1/share. Actual payout depends on pool size."
- In the confirm step (~line 617-629):
  - For parimutuel markets, label payout as "Est. Payout (pool-based)" instead of "Potential Payout"
  - Change the disclaimer text for non-binary markets

### File: `src/components/MarketCard.tsx`
- Pass `marketType={market.marketType}` to the `<BetModal>` component (~line 661)

### File: `src/pages/MarketDetail.tsx`
- If BetModal is also rendered here, pass `marketType` similarly

### Summary
- 2-3 files, ~15 lines changed
- No backend changes

