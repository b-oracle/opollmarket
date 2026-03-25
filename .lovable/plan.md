

# Fix Commissions Page Bottom Spacing and Pagination

## Problem
The commission history list items at the bottom are hidden behind the bottom navigation bar. The pagination controls also get cut off. The page has `pb-24` but needs more bottom padding to account for the safe area inset.

## Changes

### `src/pages/Commissions.tsx`

1. **Fix bottom padding on container** (line 361): Change `pb-24` to use `calc()` with safe-area-inset like other pages do:
   - `style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}`

2. **Add bottom margin to pagination** (line 526): Add `mb-6` to the pagination wrapper so there's breathing room between the last pagination control and the bottom nav.

3. **Add bottom margin to the history list** when there's no pagination: Add `mb-4` to the records container.

These are minimal CSS spacing fixes — no logic changes needed. The pagination already exists and works; it's just getting clipped by the bottom nav.

