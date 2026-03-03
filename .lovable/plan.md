

## Plan: Align Banner Dimensions with Page Content

### Problem
The banner image container uses `max-w-lg` with `rounded-xl` but no horizontal padding, while the content sections below use `max-w-lg mx-auto px-4`. This creates a misalignment — the banner stretches wider than the content cards below it.

### Changes

**`src/pages/MarketDetail.tsx`** (single file)

1. **Wrap the banner inside the same `max-w-lg mx-auto px-4` container** as the rest of the content, so it aligns horizontally with all other sections (chart, stats, order book, comments).

2. **Remove the separate `max-w-lg mx-auto` from the banner `div`** since it will inherit alignment from the parent container.

3. **Merge the banner and content into one unified `max-w-lg mx-auto px-4` wrapper** inside the `shareRef` div, so everything shares the same horizontal boundaries.

Essentially, the structure changes from:

```text
shareRef
├── banner (max-w-lg mx-auto, no px-4)
└── content (max-w-lg mx-auto px-4)
```

To:

```text
shareRef > max-w-lg mx-auto px-4
├── banner (full width of container, rounded)
└── content sections
```

This ensures the banner's left/right edges perfectly match the glass cards below it.

