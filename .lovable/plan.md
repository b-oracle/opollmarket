

## Fix Sticky Headers Across the Platform

### Problem
Several pages use `min-h-screen` with `sticky top-0` headers. On mobile, this means the header scrolls up before "sticking," creating a jittery experience — the same issue we fixed in ChatView.

### Scope
After auditing all pages, here's the breakdown:

**Need the viewport-locked flex fix (standalone full-screen views):**
1. **ConversationList.tsx** (Messages page) — `min-h-screen` + `sticky` header, same pattern as old ChatView
2. **SocialPage.tsx** — slide-over panel, uses `sticky` inside `h-full overflow-y-auto`. The sticky inside a scroll container works, but converting to flex would be more consistent

**Already correct / intentionally different:**
- **MarketDetail.tsx** — already uses `h-dvh overflow-y-auto` with sticky inside the scroll container (correct pattern for long-scroll content pages)
- **FAQ, Terms, Privacy, Disclaimer** — these are long-content pages under the global TopBar (which is already `fixed`). Their sub-headers use `sticky` correctly to pin while content scrolls beneath
- **AdminLayout.tsx** — admin panels use sticky inside `overflow-y-auto` main area (correct)
- **ChatView.tsx** — already fixed

### Changes

**`src/components/chat/ConversationList.tsx`**
- Outer: `min-h-screen bg-background pb-20` → `h-[100dvh] bg-background flex flex-col overflow-hidden`
- Header: remove `sticky top-0`, add `shrink-0`
- Content area (new chat picker + conversation list): wrap in `flex-1 overflow-y-auto min-h-0` div
- Remove `pb-20` (no longer needed since input isn't fixed/overlapping)
- Add safe-area bottom padding to the scrollable area instead

**`src/components/SocialPage.tsx`**
- Convert from `h-full overflow-y-auto` wrapper with `sticky` header to flex column layout
- Header: remove `sticky top-0 z-10`, add `shrink-0`
- Content: wrap in `flex-1 overflow-y-auto min-h-0`

### What stays the same
- FAQ, Terms, Privacy, Disclaimer, MarketDetail, Admin — no changes needed. These pages have long scrollable content where `sticky` inside a scroll container is the correct UX pattern.

