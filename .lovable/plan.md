

# Improve Space Controls Bar — Mobile Responsive Layout

## Problem
The controls bar at the bottom of a Space crams all buttons (mic, mute all, hand, record, leave, end space) into a single horizontal row with `gap-3`. On a ~400px mobile viewport, this overflows or looks cramped and unpolished.

## Design
Replace the flat row with a compact, mobile-friendly layout:
- **Icon-only buttons** for all controls (remove text labels from "Mute All" / "Unmute All" / "End Space" on mobile)
- Use **tooltips** or rely on icon clarity instead of text
- Wrap the bar in a responsive container: on mobile, use smaller button sizes (`w-10 h-10`) and tighter gap (`gap-2`)
- "End Space" becomes a smaller icon-only destructive button on mobile, with text visible on larger screens
- "Mute All" becomes icon-only on mobile with text on `sm:` and above
- Ensure the bar uses `flex-wrap` as a safety net so buttons never overflow off-screen

## Changes

### File: `src/components/social/SpaceRoom.tsx` (lines 1860-1933)

**Controls container**: Change from `gap-3` to `gap-2` and add `flex-wrap justify-center`

**All icon buttons** (mic, hand, record, leave): Reduce from `w-11 h-11` → `w-10 h-10` with `w-5 h-5` icons staying the same

**"Mute All" / "Unmute All" button**: Make text hidden on small screens:
- `h-10 px-3 sm:px-4` with `<span className="hidden sm:inline">Mute All</span>` — icon always visible, text only on `sm:`+

**"End Space" button**: Same pattern — icon always visible, text hidden on mobile:
- Add `X` or `PhoneOff`-style icon, text via `<span className="hidden sm:inline">End Space</span>`

**"Request to Speak" / "Request Sent"**: Same pattern — truncate text on mobile using `hidden sm:inline`

This keeps the bar compact and readable at 400px while showing full labels on tablets/desktop.

