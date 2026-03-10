

## Fix Badge Position on Profile Avatar

**Problem**: The `NftBadge` on the Profile page avatar is positioned with `absolute -bottom-0.5 -right-0.5`, but the avatar container at line 681 has `mb-3` which pushes the badge away from the avatar edge. The badge needs to sit on the avatar's edge, not below the margin.

**Fix** (2 locations in `src/pages/Profile.tsx`):

1. **Line 681 (main profile avatar)**: Move `mb-3` from the avatar `div` to the parent `relative` wrapper, so the badge stays anchored to the avatar circle. Adjust badge position to `absolute bottom-2.5 -right-0.5` to account for the margin shift — or better, restructure so the `relative` container only wraps the avatar circle without the margin.

2. **Line 654 (social card avatar, line 661)**: This one already looks correct (`overflow-hidden` on the avatar + badge outside). Verify no issue here.

### Concrete change:

**Line 680-689** — Restructure so the `relative` wrapper tightly wraps only the avatar, and `mb-3` is on an outer element:

```tsx
<div className="flex flex-col items-center mb-8">
  <div className="relative mb-3">
    <div className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center overflow-hidden">
      {/* avatar image/fallback */}
    </div>
    {/* NftBadge stays at absolute -bottom-0.5 -right-0.5 */}
  </div>
  {/* name, admin badge, etc. */}
</div>
```

Move `mb-3` from the inner avatar div (line 681) to the `relative` wrapper (line 680), so the badge sits flush on the avatar's bottom-right edge.

