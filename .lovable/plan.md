

## Make Desktop Footer Sticky (Fixed to Bottom)

### Changes

**`src/components/DesktopFooter.tsx`** — Change the footer's outer `<footer>` element to use `fixed bottom-0 right-0 left-60 z-40` positioning so it stays pinned to the bottom of the viewport at all times, never scrolling with content.

**`src/App.tsx`** — Add bottom padding (`md:pb-[footer-height]`) to the main content wrapper so page content isn't hidden behind the fixed footer.

This is the standard sticky footer pattern: fixed position at viewport bottom, with compensating padding on the content area.

