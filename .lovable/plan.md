

## Problem

The MarketCard height (`calc(100dvh - 7.5rem - env(safe-area-inset-bottom))`) doesn't precisely match the scroll container's available space. The feed container uses `flex-1` with `pt-14` (3.5rem top padding for TopBar), and the BottomNav is a **fixed** element (h-16 = 4rem + safe-area). Since BottomNav is fixed/overlaying, the scroll container actually extends behind it, but the card subtracts 7.5rem (3.5rem top + 4rem bottom) — this mismatch plus the `paddingBottom` on the container causes partial card visibility.

## Plan

1. **Feed container** (`src/pages/Feed.tsx`):
   - Remove `pt-14` and `paddingBottom` from the scroll container
   - Instead, give it an explicit height: `h-[calc(100dvh-3.5rem)]` on mobile (TopBar only, since BottomNav is fixed overlay) and same on desktop
   - Remove `flex-1` since we'll use explicit height

2. **MarketCard** (`src/components/MarketCard.tsx`):
   - Change card height to `h-[calc(100dvh-3.5rem)]` to exactly fill the scroll container viewport
   - Add internal bottom padding (`pb-20 md:pb-6`) to keep content above the BottomNav overlay
   - Remove the separate safe-area calculations — the BottomNav already handles its own safe-area padding

This ensures each card is exactly the height of the scroll container, so scroll-snap locks perfectly with no partial cards visible.

