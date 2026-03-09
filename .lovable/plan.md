

## Plan: Remove drag gestures from MarketCard and Profile, keep swipe-to-predict

The video shows two drag gestures interfering with normal use — both pages already have buttons for the same actions, making the drags redundant and disruptive.

### Changes

**1. `src/components/MarketCard.tsx` — Remove horizontal swipe-to-vote**

- Remove `dragX`, `swiping`, `touchStartRef`, `touchLockedRef` state/refs
- Remove `SWIPE_THRESHOLD`, `LOCK_ANGLE_THRESHOLD` constants
- Remove the `useEffect` (lines ~133–203) that attaches touch listeners for horizontal swipe
- Remove `swipeProgress` and `swipeSide` computed values
- Remove `transform: translateX(dragX)` and transition from card root style (lines ~247–248)
- Remove the two YES/NO swipe overlay `motion.div` elements (lines ~252–286) with ThumbsUp/ThumbsDown icons
- Keep YES/NO tap buttons and bet modal — users tap to trade
- Keep `touchAction: "pan-y"` so vertical feed scrolling works normally

**2. `src/pages/Profile.tsx` — Remove slide-to-reveal gesture**

- Remove `revealX`, `isDragging`, `revealAnimating`, `touchStartX`, `touchStartY`, `touchStartedInEdge`, `swipeLockedDir` state/refs
- Remove `handleTouchStart`, `handleTouchMove`, `handleTouchEnd` callbacks
- Remove `onTouchStart`/`onTouchMove`/`onTouchEnd` from root div (lines ~457–459)
- Remove the backdrop overlay and slide-to-reveal panel (lines ~482–540+)
- Remove the right-edge glow hint and `swipeHintDismissed` state
- Keep existing navigation button/link to social profile

**3. No changes to Feed.tsx** — vertical pull-to-refresh stays as-is

### Result
- Feed cards stay stationary horizontally; vertical snap-scroll works without interference
- Profile page has no drag gesture; social profile accessed via buttons
- Two files edited: `MarketCard.tsx`, `Profile.tsx`

