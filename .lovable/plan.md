

# Tier-Based Glow for Boosted Markets

## Current State
- **MarketDetail page** already has tier-based glow (lines 611-641) with correct colors per tier
- **BoostedCarousel**, **MarketCard (feed)**, and **Index page (market list)** all use generic `primary` color for boost visuals regardless of tier

## Tier Color Mapping (from BoostCountdown.tsx)
- **Flash**: `hsl(var(--primary))` (cyan) — Zap icon
- **Standard**: `hsl(280, 70%, 60%)` (purple) — Flame icon  
- **Whale Pin**: `hsl(45, 93%, 58%)` (gold) — Crown icon

## Changes

### 1. Create a shared utility for boost tier colors
Add a helper function (e.g., in a new `src/lib/boostTiers.ts`) that returns glow color, border color, icon, and label for a given tier. This avoids duplicating the color map across files.

### 2. BoostedCarousel — Tier-colored glow on each card
- Replace the generic `ring-primary/20` border with a tier-colored ring/border
- Replace the generic `bg-primary/90` corner badge with tier-colored background
- Color the "Boosted" badge text and icon per tier
- Add a subtle `box-shadow` glow matching the tier color
- For non-boosted (trending) cards, keep the current primary color

### 3. Index page market list — Tier-colored glow on list items
- Replace `ring-1 ring-primary/30 bg-primary/5` with tier-colored ring and background tint
- Replace the corner Zap badge `bg-primary/90` and shadow with tier-colored versions
- Use tier-appropriate icon (Zap/Flame/Crown) instead of always Zap

### 4. MarketCard (feed) — Tier-colored glow on feed cards
- Replace `ring-1 ring-primary/30` with tier-colored ring
- Replace the gradient overlay `from-primary/15` with tier-colored gradient
- Replace the boost action icon `bg-orange-500/20` with tier color
- Use tier-appropriate icon in the "Boosted" badge
- Color the "Boosted 🔥" label per tier

### Files to modify
- `src/lib/boostTiers.ts` (new) — shared tier color/icon utility
- `src/components/BoostedCarousel.tsx` — tier-colored card borders, badges, glow
- `src/pages/Index.tsx` — tier-colored list item styling
- `src/components/MarketCard.tsx` — tier-colored feed card styling

