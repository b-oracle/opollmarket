

# Make Transaction History Collapsible

## What changes
Wrap the entire "Transaction History" section in `src/pages/Profile.tsx` (lines 1544–1803) with a collapsible accordion-style toggle. Clicking the "Transaction History" header row will expand/collapse the filters and transaction list.

## Technical approach
- Add a `txHistoryOpen` state (default: `true` so it's visible on first load)
- Replace the existing header `<div>` with a clickable row that includes a chevron icon that rotates on open/close
- Wrap the filters, status pills, transaction list, and pagination inside an `AnimatePresence` + `motion.div` block (already imported) for smooth expand/collapse animation
- Keep the refresh button in the header row, stopping propagation so it doesn't toggle the section

## Files modified
- `src/pages/Profile.tsx` — Add state, wrap transaction history content in collapsible container

