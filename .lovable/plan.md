

## Plan: Always Show Buy/Sell Buttons on Feed Cards

**Problem**: The YES/NO prediction buttons only appear on the currently active (scrolled-to) card because they're wrapped in `{isActive && (...)}`. Cards that aren't in focus hide these buttons.

**Solution**: Remove the `isActive` conditional from the prediction buttons section in `MarketCard.tsx` so all cards always display their buy/sell buttons. Keep the animation but remove the guard.

**Changes — `src/components/MarketCard.tsx`**:
1. Remove the `{isActive && (` wrapper around the prediction buttons block (~line 370) so YES/NO buttons and multi-option buttons render on every card regardless of scroll position.
2. Keep the `motion.div` animation but make it non-conditional (always animate in).
3. Also remove the `{isActive && !isMulti && (` wrapper around the swipe hint text (~line 430), or keep it active-only since it's just a hint — user preference, but I'll keep the swipe hint as active-only since it's supplementary.

