

# Color-Coded Range Badge in Portfolio

## Problem
The portfolio shows range/multi-option labels (e.g., "20 - 100") with a generic accent color instead of matching the color assigned to that option on the market detail page.

## Solution
Use the same `optionColors` palette from MarketDetail, mapping each option's `sort_order` to its color index.

## Changes

### 1. Shared option colors constant
Extract `optionColors` array to a shared file (e.g., `src/lib/optionColors.ts`) so both MarketDetail and Portfolio use the same palette:
```ts
export const optionColors = ["#02C7FC", "#EF4444", "#EAB308", "#A855F7", "#F97316", "#9CA3AF"];
```

### 2. Portfolio data — fetch `sort_order`
- Update the Supabase select to include `market_options(label, sort_order)`
- Add `optionSortOrder: number | null` to `EnrichedPosition`
- Pass `sort_order` through enrichment

### 3. Portfolio badge rendering (~line 779)
Replace the generic accent styling with inline `style` using the color from `optionColors[sortOrder % length]`:
```tsx
pos.optionLabel
  ? { backgroundColor: optionColors[pos.optionSortOrder ?? 0] + '22', color: optionColors[pos.optionSortOrder ?? 0], borderColor: optionColors[pos.optionSortOrder ?? 0] + '55' }
  : // existing yes/no classes
```

### 4. MarketDetail — import shared constant
Replace the local `optionColors` declaration with the import from the shared file.

## Files Modified
- `src/lib/optionColors.ts` (new)
- `src/pages/Portfolio.tsx`
- `src/pages/MarketDetail.tsx`

