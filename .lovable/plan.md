

## Plan: Remove blue edge from ProfileShareCard

The ProfileShareCard's outer border uses `2px solid ${colors.border}` which, combined with the resolved theme border color, creates a visible blue/cyan edge around the card. The standard cards on the platform use a simple `1px solid` border with the muted border color.

### Change

**`src/components/ProfileShareCard.tsx`** (line 84) — Change the border from `2px solid ${colors.border}` to `1px solid ${colors.border}` to match the standard card styling used across the platform. This removes the thick blue edge while keeping a subtle border consistent with other cards.

