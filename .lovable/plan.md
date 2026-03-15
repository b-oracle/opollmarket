

## Plan: Remove Trades Tooltip on Social Profile

**File:** `src/pages/UserProfile.tsx` (lines 396-409)

Replace the `TooltipProvider > Tooltip > TooltipTrigger > TooltipContent` wrapper around the "Trades" stat with a plain `<div>` that just shows the total count and label -- removing the hover popup that breaks down predictions vs quick trades.

