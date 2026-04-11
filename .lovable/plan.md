

## Plan: Increase pinned markets limit from 6 to 10

Two files need a single-character change each:

1. **`src/components/social/TaggedMarketsCarousel.tsx`** (line 69): Change `max={6}` to `max={10}`
2. **`src/components/social/CreateSpaceModal.tsx`** (line 224): Change `max={6}` to `max={10}`

No database or backend changes required.

