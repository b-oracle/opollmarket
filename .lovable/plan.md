

## Plan: Remove drag gesture from Profile page

### What will change

Remove all swipe/drag-to-reveal logic from `src/pages/Profile.tsx`. Users will navigate to their social profile via existing buttons only.

### Removals in `src/pages/Profile.tsx`

**State & refs to delete:**
- `swipeHintDismissed` state + localStorage read (line 206)
- `revealX` state (line 207)
- `revealAnimating` ref (line 208)
- `touchStartX`, `touchStartY` refs (lines 210-211)
- `touchStartedInEdge` ref (line 213)
- `touchLockedDir` ref (line 214)
- `isDragging` ref (line 215)
- `screenW` variable (line 216)

**Callbacks to delete:**
- `handleTouchStart` (lines 218-226)
- `handleTouchMove` (lines 228-243)
- `handleTouchEnd` (lines 245-271)

**JSX to delete:**
- `onTouchStart`, `onTouchMove`, `onTouchEnd` props from root div (lines 457-459)
- Swipe hint glow on right edge (lines 461-480)
- Slide-to-reveal backdrop overlay (lines 482-488)
- Slide-to-reveal panel (lines 489-524)

**No other files affected.** The existing button/link to navigate to `/user/:id` remains.

