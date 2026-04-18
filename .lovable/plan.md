

## Plan: Global Floating "Live Space" Indicator

### Goal
Show a pulsating floating button across the app when there's at least one ongoing space the user can join. It deep-links the user to the Spaces tab (`/feed?tab=spaces`).

### Hide rules
The button is hidden when:
- The user is already inside a live space (covered by `SpaceMiniPlayer`).
- The user is on the social/spaces page (`/feed` with `tab=spaces`).
- Admin / Business / Embed / Auth routes.
- No live spaces are visible to the user (`useLiveSpacesCount` returns 0).
- A space replay mini-player is already on screen (avoid stacking).

### What to build

**1. New component: `src/components/social/LiveSpaceFloatingButton.tsx`**
- Uses `useLiveSpacesCount()` to know if any live spaces exist.
- Uses `useActiveSpace()` to hide itself when the user is already in a space.
- Uses `useLocation()` to read the current route + `tab` query param; hide on `/feed?tab=spaces`, admin/business/embed/auth/setup-security routes.
- Renders a fixed circular button:
  - Position: `fixed bottom-24 right-4 lg:bottom-6 lg:right-6 z-[65]` (above BottomNav `z-70`? — use `z-[65]`, sits below BottomNav and below the SpaceMiniPlayer at `z-[70]`, which is correct since miniplayer only shows when joined).
  - Size: `w-14 h-14` rounded-full, primary gradient background, pulsing ring (Tailwind `animate-ping` halo + scale animation via Framer Motion).
  - Icon: `Radio` or `Mic` from lucide-react with red "LIVE" dot.
  - Small numeric badge in the top-right showing live count (cap at 9+).
- On click: `navigate("/feed?tab=spaces")`.
- Animated entrance/exit via `framer-motion` `AnimatePresence`.

**2. Mount globally in `src/App.tsx`**
- Lazy-import the component.
- Render alongside `GlobalSpaceRoom` (inside `ActiveSpaceProvider`), so it has access to `useActiveSpace`. Wrap in `<Suspense fallback={null}>`.
- Place outside `Routes` so it persists across navigations.

**3. Ensure `/feed` reads the `tab=spaces` query param**
Quick check: `Feed.tsx` already imports `useSearchParams`. We'll verify it switches to the Spaces tab when `?tab=spaces` is present (NotificationBell already relies on this behavior, so it should work). No change expected — if the existing handler doesn't auto-switch, I'll add a small `useEffect` in `Feed.tsx` to set the active tab from the query param.

### Visual treatment
```text
┌─────────────────┐
│   🔴 (animate-  │   ← outer pulsing ring (red)
│      ping ring) │
│   ┌──────────┐  │
│   │  🎙 LIVE │  │   ← solid primary circle, white mic icon
│   │  • count │  │
│   └──────────┘  │
└─────────────────┘
```

### Files Changed
- **NEW** `src/components/social/LiveSpaceFloatingButton.tsx`
- `src/App.tsx` — mount the component globally
- `src/pages/Feed.tsx` — (only if needed) ensure `?tab=spaces` opens the spaces tab on load

### Out of scope
- Changing the existing `SpaceMiniPlayer` (it already handles the "already joined" case).
- Modifying the live spaces RPC or realtime channel — `useLiveSpacesCount` already invalidates on any `spaces` table change.

