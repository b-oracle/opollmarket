

## Fix Messages Header Scrolling

### Problem
The `ConditionalLayout` wrapper applies `min-h-screen flex flex-col` to all routes. While ConversationList internally uses `h-[100dvh] overflow-hidden`, the parent's `min-h-screen` creates a document-level scroll context that can still allow the whole page (including the header) to scroll on mobile.

### Solution
Update `ConditionalLayout` in `src/App.tsx` to detect fullscreen routes (`/messages`, `/messages/:id`) and apply `h-[100dvh] overflow-hidden` instead of `min-h-screen` for those routes. This locks the outer container so the inner flex layout controls scrolling exclusively.

### File: `src/App.tsx`
1. Add `/messages` to a list of "fullscreen" routes (similar to how `noFooterRoutes` works)
2. In `ConditionalLayout`, check if the current path starts with `/messages` — if so, use `h-[100dvh] overflow-hidden` instead of `min-h-screen`
3. Also add `/messages` to `noFooterRoutes` so the desktop footer doesn't render and push content

This is the same pattern used for other viewport-locked views and ensures the header stays pinned while only the message list scrolls.

