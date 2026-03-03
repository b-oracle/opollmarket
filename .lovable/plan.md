

## Plan: Overlay title on blurred hero image

### Current State
Lines 288-303: The image is rendered in a container, followed by the title below it in a separate `div`.

### Changes — `src/pages/MarketDetail.tsx`

**Merge the title into the image container** (lines 288-303):
1. Add `blur-[2px] opacity-70` to the `<img>` element to make it slightly blurred and opaque
2. Move the `<h1>` title inside the image container, positioned absolutely at the bottom over the gradient overlay
3. Remove the title from its current location below the image
4. Strengthen the gradient overlay so white text is readable

The result: image becomes a blurred, semi-transparent hero backdrop with the market title overlaid at the bottom.

```text
┌─────────────────────────┐
│  [blurred image]        │
│                         │
│  ▓▓▓▓ gradient ▓▓▓▓▓▓▓ │
│  Market Title Here      │
└─────────────────────────┘
│  Description text...    │
```

### Specific Edits

**Lines 288-303** — Replace image block + title:
- `<img>`: add `blur-[2px] opacity-70`  
- Gradient: strengthen to `from-background via-background/60 to-transparent`
- Add `<h1>` absolutely positioned inside the image container (`absolute bottom-4 left-4 right-4 text-2xl font-bold text-white`)
- Remove the standalone `<h1>` from line 302
- Adjust the `pt-2` section to start directly with description

Single file change: `src/pages/MarketDetail.tsx`

