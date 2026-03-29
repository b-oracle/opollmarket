

# Make Twitter/X Handle a Required Field with Clear "Handle Only" Guidance

## Problem
When creating a Twitter/X auto-resolve market, the X handle/tweet ID field is optional — creators can skip it. Also, the label doesn't clearly state that only the handle (not a link) should be entered for username-based metrics.

## Changes

### 1. `src/pages/Create.tsx` — Add validation rule
Add a `twitterResource` entry to the `errors` object (~line 743):
- When `autoResolve` is true and `category === "Twitter/X"`, require `twitterResourceId` to be non-empty
- For `posts`/`impressions` metrics (username-based), validate it contains no slashes or "http" (reject URLs)

### 2. `src/pages/Create.tsx` — Block step advancement
In `tryAdvanceStep2` (~line 757), add a check: if category is Twitter/X and autoResolve is on, shake and block if `twitterResource` error exists.

### 3. `src/pages/Create.tsx` — Update label and helper text
Change the label from "X (Twitter) Username" to **"X Handle (username only, not a link)"** for the `posts`/`impressions` metric types. Update placeholder to `"e.g. elonmusk (no @ or links)"`. Update the helper text below to reinforce "Enter the X handle only — do not paste a profile link."

### 4. `src/pages/Create.tsx` — Show validation error
Display the error message below the input when touched and invalid, matching the existing error styling pattern.

## Files Modified
- `src/pages/Create.tsx` — validation rule, step gate, label/placeholder/helper updates, error display

