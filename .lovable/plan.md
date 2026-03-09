

## Plan: Make all share screenshot modals responsive with close buttons

### Problem
The `RankShareModal` uses a `Dialog/DialogContent` wrapper that doesn't handle mobile viewport constraints well — content can get cut off or feel "stuck" without proper scrolling. It also lacks the same responsive pattern used in `ShareModal`.

### Changes

**1. `src/components/RankShareModal.tsx`** — Replace `Dialog/DialogContent` wrapper with the same custom modal pattern used in `ShareModal`:
- Backdrop overlay with click-to-close
- Fixed positioning with `env(safe-area-inset-*)` awareness
- Scrollable content area with `overflow-y-auto overscroll-contain`
- Sticky header with "Share Your Rank" title and close (X) button
- Sticky footer for native share button
- Bottom offset `calc(4rem + env(safe-area-inset-bottom))` to avoid bottom nav overlap
- Max-width constrained, centered vertically

**2. `src/components/ShareModal.tsx`** — Already responsive. No changes needed — this is the reference pattern.

**3. `src/components/WinCelebrationModal.tsx`** — Already has a close button and opens `ShareModal` for the share flow. No changes needed.

### Technical detail
The `RankShareModal` currently wraps everything in `<Dialog><DialogContent>` which has a hidden close button (`[&>button]:hidden`) and relies on the radix dialog's default positioning. The replacement will use the same manual fixed-position modal structure as `ShareModal` with:
- Backdrop: `fixed inset-0 z-50 bg-background/60 backdrop-blur-sm`
- Container: `fixed inset-x-0 z-50 flex items-center justify-center` with safe area offsets
- Inner card: `w-full max-w-sm bg-card border rounded-2xl shadow-xl overflow-hidden flex flex-col` with `maxHeight: 100%`
- Scrollable middle section for the rank card + action buttons

