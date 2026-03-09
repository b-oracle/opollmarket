

## Plan: Replace swipe gesture with slide-to-reveal panel on Profile page & clean up UserProfile swipe

### What changes

**1. Profile.tsx — Replace swipe-navigate with slide-to-reveal**

Currently: swiping left from right edge translates the entire page and navigates to `/user/:id`. This feels like a snap/swipe.

New behavior: Dragging from the right edge **reveals the UserProfile page sliding in from the right**, like a drawer/panel overlaying the Profile page. The Profile page stays in place; instead, a full-screen panel containing the social profile slides in from the right following the user's finger.

Implementation:
- Remove the `translateX` on the root div — the Profile page no longer moves
- Keep the touch handlers but instead of translating the page, track a `revealProgress` (0 to 1) that controls a sliding overlay panel
- When the user drags past a threshold (e.g. 100px), animate the panel fully open, then navigate to `/user/:id`
- The overlay panel renders as a `position: fixed` div sliding from `right: -100%` to `right: 0` following the drag
- Keep the right-edge glow hint as-is

State changes:
- Replace `swipeDragX` with `revealX` (0 = hidden, positive = how many px revealed from right)
- On touch move: set `revealX` to drag distance
- On touch end: if `revealX > 100`, animate to full width then navigate; else snap back to 0
- The overlay panel shows a preview (user's avatar, name, "Social Profile" label) while dragging

**2. UserProfile.tsx — Remove all swipe-back logic**

- Remove `swipeDragX`, `swipingActive` refs and state
- Remove `swipeStartX`, `swipeStartY`, `swipeFromEdge`, `swipeLockedDir` refs
- Remove `handleSwipeStart`, `handleSwipeMove`, `handleSwipeEnd` callbacks
- Remove `transform`/`transition` styles from root div
- Remove `onTouchStart`/`onTouchMove`/`onTouchEnd` from root div
- Remove the left-edge glow hint (`motion.div` at lines 331-349)
- Keep the back button which already navigates to `/profile` for own profile or `navigate(-1)` otherwise

**3. Files touched**
- `src/pages/Profile.tsx` — rework swipe to slide-reveal overlay
- `src/pages/UserProfile.tsx` — remove swipe-back code only

