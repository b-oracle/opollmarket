

## Make Market Creator Clickable → Navigate to Creator Profile

### What
Wrap the creator avatar + label in the `MarketCard` with a clickable element that navigates to `/user/{creatorAddress}`, stopping event propagation so it doesn't trigger the card's own navigation to the market detail page.

### Changes

**`src/components/MarketCard.tsx`** (lines ~447-451)
- Wrap the creator avatar `div` and `creatorLabel` span in a `<button>` or `<div onClick={...}>` 
- On click: call `e.stopPropagation()` then `navigate(`/user/${market.creatorAddress}`)` 
- Add hover styles (underline on label, slightly brighter avatar) for affordance
- Only make it clickable when `market.creatorAddress` exists

