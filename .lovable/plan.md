

## Issues

1. **Hero text hidden**: The `pt-20` (80px) top padding on the Index page content isn't enough to clear the TopBar when safe-area-inset-top is added (e.g. on iPhones with notch/dynamic island). The hero text gets clipped behind the fixed header.

2. **Border under bottom nav**: The `glass-strong` class applies `border: 1px solid ...` on all sides, creating a visible border line on top of the BottomNav.

## Plan

### 1. Fix hero text being hidden behind TopBar
**`src/pages/Index.tsx`** — Change the content wrapper's top padding from `pt-20` to include safe-area-inset-top:
```
style={{ paddingTop: 'calc(5rem + env(safe-area-inset-top))' }}
```
Remove the `pt-20` class and use inline style instead.

### 2. Remove border on BottomNav
**`src/components/BottomNav.tsx`** — Add `border-0` class (or `border-none`) to the `<nav>` element to override the `glass-strong` border, or replace with `border-t-0` specifically. Alternatively, add inline `style={{ border: 'none' }}` or use a custom class. Simplest: add `border-0` to the className.

Also do the same for the **TopBar** (`src/components/TopBar.tsx`) `<header>` — add `border-0` to remove the bottom border from the glass-strong class.

### Files to modify
- `src/pages/Index.tsx` — Fix top padding to account for safe area
- `src/components/BottomNav.tsx` — Remove glass-strong border
- `src/components/TopBar.tsx` — Remove glass-strong border

