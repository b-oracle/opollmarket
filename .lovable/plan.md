

## Plan: Adapt BetModal colors to match multi-option colors

**Problem**: When clicking a multi-option market option, the BetModal always shows a primary-colored dot and green "neon-yes" text, ignoring the option's actual color (blue, red, yellow, purple, etc.).

**Solution**: Pass the option's hex color from MarketCard into BetModal and use it for the dot and option label styling.

### Changes

**1. `src/components/BetModal.tsx`**
- Add an `optionColor?: string` prop
- When `optionColor` is provided, use it as inline `style={{ backgroundColor: optionColor }}` on the dot (line 132) and `style={{ color: optionColor }}` on the option label text (line 134)
- Apply the same color override to other places that use `sideTextClass` when `optionLabel` is present: the confirm step side display (line 259), success step share count text (line 316), and payout text (line 325)

**2. `src/components/MarketCard.tsx`**
- When opening the BetModal for a multi-option, pass `optionColor: optionColors[i % optionColors.length]` alongside `optionLabel` and `optionPrice`
- Update the `betModal` state type to include `optionColor?: string`
- Pass `optionColor` to the `<BetModal>` component

