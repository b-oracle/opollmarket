

## Fix: Quick Trade page hidden behind top nav bar

The Quick Trade page renders a fixed `TopBar` but the main content container has no top padding/margin to offset it. The content starts immediately at `pt-4`, causing the header ("Quick Trade", asset selector, etc.) to be hidden behind the 56px-tall TopBar.

### Change

**`src/pages/QuickTrade.tsx` (line 439)**

Change the content wrapper from:
```
<div className="min-h-screen bg-background pb-24 md:pb-8">
  <div className="max-w-xl mx-auto px-4 pt-4">
```
to:
```
<div className="min-h-screen bg-background pb-24 md:pb-8 pt-[calc(3.5rem+env(safe-area-inset-top))]">
  <div className="max-w-xl mx-auto px-4 pt-4">
```

This adds `pt-[calc(3.5rem+env(safe-area-inset-top))]` (3.5rem = 56px matching h-14 TopBar height, plus safe area for notched devices) — consistent with other pages in the app.

