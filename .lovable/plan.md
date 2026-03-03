

## Plan: Reduce Banner Size & Overlay Title

The banner image already has the title overlaid (line 309). The change is simply reducing the banner height.

### Changes in `src/pages/MarketDetail.tsx`

**Lines 298-311** — Replace `aspect-video` (16:9) with a shorter fixed height (`h-48`) and keep the existing title overlay:

```tsx
<div className="relative w-full max-w-lg mx-auto rounded-xl overflow-hidden">
  <div className="h-48 w-full overflow-hidden">
    <img ... />
  </div>
  <!-- gradient and title overlay remain unchanged -->
</div>
```

This reduces the banner from ~56% width ratio (aspect-video) to a fixed 192px height, making it more compact while keeping the title overlaid at the bottom.

