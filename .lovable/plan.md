

# Fix: Move desktop navigation breakpoint from 768px to 1024px

## Problem
The desktop sidebar shows at `md:` (768px), but the Feed container uses `isDesktop` (1024px) for its layout offset. At tablet widths (768-1023px), the sidebar is visible and steals space, the TopBar is offset, and the BottomNav is hidden — but the Feed content doesn't account for any of this, causing the "dark mask" effect and clipped side actions. The user wants mobile navigation behavior on tablets.

## Root Cause
Multiple components use the `md:` breakpoint (768px) to switch between mobile and desktop layouts, but the Feed uses 1024px. This mismatch means at 768-1023px: sidebar visible, bottom nav hidden, feed content at left:0 (behind sidebar).

## Solution
Change all navigation-related breakpoints from `md:` (768px) to `lg:` (1024px) across the app:

### 1. `src/components/DesktopSidebar.tsx` (line 37)
- Change `hidden md:flex` to `hidden lg:flex`

### 2. `src/components/TopBar.tsx` (line 48)
- Change `md:left-[4.5rem]` to `lg:left-[4.5rem]`
- Change `md:left-60` to `lg:left-60`

### 3. `src/components/TopBar.tsx` (lines 61, 65)
- Change `md:hidden` to `lg:hidden` (logo visibility)
- Change `hidden md:block` to `hidden lg:block` (empty spacer)
- Change `md:max-w-full` to `lg:max-w-full`

### 4. `src/components/BottomNav.tsx` (line 34)
- Change `md:hidden` to `lg:hidden`

### 5. `src/App.tsx` — ConditionalLayout (line 92)
- Change `md:ml-[4.5rem]` to `lg:ml-[4.5rem]`
- Change `md:ml-60` to `lg:ml-60`

### 6. `src/components/DesktopFooter.tsx` (line 39)
- Change `hidden md:block` to `hidden lg:block`

### 7. `src/pages/MarketDetail.tsx` (line 868)
- Change `md:left-60` and `md:bottom-0` and `md:max-w-4xl` to `lg:` equivalents

## Summary
- **6 files** changed, all search-and-replace of `md:` to `lg:` for sidebar/nav breakpoints
- No logic changes — purely CSS breakpoint alignment
- After this, tablets (768-1023px) get full mobile layout: bottom nav, no sidebar, full-width feed

