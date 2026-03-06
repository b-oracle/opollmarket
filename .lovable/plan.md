

## Problem

The mobile swipe/scroll feed is broken because of a **height mismatch** between the scroll container and the individual cards:

- **Container height**: `calc(100dvh - 3.5rem - 3rem - env(safe-area-inset-top))` — subtracts TopBar (3.5rem) + BottomNav (3rem) + safe area
- **Card height**: `h-[calc(100dvh - 3.5rem)]` — only subtracts TopBar

Cards are significantly taller than the container, so CSS scroll-snap cannot work properly. Each card overflows the viewport, preventing the snapping/bouncing behavior.

Additionally, the BottomNav is actually `h-16` (4rem) not 3rem, plus safe-area-inset-bottom, so the subtraction is also incorrect.

## Fix

### 1. Align card height with container height (`MarketCard.tsx`)

Change the snap-item height from `h-[calc(100dvh-3.5rem)]` to match the container exactly. Use a CSS custom property or the same calc expression so both stay in sync.

### 2. Fix container height calculation (`Feed.tsx`)

Update the container height to correctly account for the BottomNav's actual height (4rem + safe-area-inset-bottom):

```
height: calc(100dvh - 3.5rem - 4rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))
```

### 3. Update MarketCard snap-item height to match

```
h-[calc(100dvh-3.5rem-4rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))]
```

Since this calc is complex for a Tailwind class, we'll use an inline style or a CSS variable set on the container.

### 4. Ensure overscroll bounce works

Add `overscroll-behavior-y: contain` on the snap-feed container in CSS to keep the native bounce feel contained, and verify `-webkit-overflow-scrolling: touch` is present (it is).

### Files to change

- **`src/pages/Feed.tsx`** — Fix container height calc, pass height via CSS variable
- **`src/components/MarketCard.tsx`** — Use matching height (via CSS variable or inline style) instead of hardcoded calc
- **`src/index.css`** — Add `overscroll-behavior-y: contain` to `.snap-feed`

