

# Fix: Range Highlighting for Labels with K/M Suffixes

## Problem
The Live Impressions Tracker shows 5,168,278 but doesn't highlight the active range ("4.1M - 8M Views"). The `parseBracketRange` function in `TwitterEngagementTracker.tsx` only parses plain integers (e.g. `80-99`). It fails on labels like `"501k - 1.5M Views"`, `"< 500k Views"`, `"15.1M - 60M+ Views"`.

## Fix

### File: `src/components/TwitterEngagementTracker.tsx`

Update `parseBracketRange` to:
1. Strip trailing non-numeric text (e.g. " Views")
2. Parse number suffixes: `k` → ×1,000, `M` → ×1,000,000, `B` → ×1,000,000,000
3. Handle decimal multipliers (e.g. `1.5M` → 1,500,000)
4. Support `+` suffix on the max value (e.g. `60M+` → treat as Infinity)

Add a helper `parseHumanNumber(str)` that converts `"4.1M"` → `4100000`, `"500k"` → `500000`, etc.

Update the regex patterns in `parseBracketRange` to use this helper instead of plain `parseInt`.

### Changes Summary
- ~20 lines changed in `parseBracketRange` + new `parseHumanNumber` helper
- No backend changes

