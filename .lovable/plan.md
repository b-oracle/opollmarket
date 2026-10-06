# Make minimum liquidity and minimum first prediction adjustable

Minimum liquidity is already editable in Admin Settings (currently $10). This adds the same control for the creator's first prediction (currently fixed at $5).

## What changes
- **Admin Settings** (next to "Minimum Liquidity"): new field "Minimum First Prediction (USDT)", default 5. Both fields are validated (must be 0 or more) and saved together.
- **Create market flow**: the first-prediction step reads the admin value; the message, the input check, and the error ("Minimum prediction is $X") all use it.
- **Market page** banner ("Place your first prediction (min $X)...") uses the admin value.
- **Terms page and FAQ assistant**: wording changed to "the minimum set by the platform" (currently shown live where possible) so text never goes out of date.
- **Add Liquidity prompt**: fallback aligned to the admin minimum liquidity instead of $1.

## Technical details
- Migration: `ALTER TABLE commission_settings ADD COLUMN min_first_prediction numeric NOT NULL DEFAULT 5`; add the column to the `public_commission_settings` view so non-admins can read it.
- `useCommissionSettings` gains `min_first_prediction` (fallback 5); Create.tsx, MarketDetail.tsx, Terms.tsx consume it.
- AdminSettings.tsx: state, load, and include in both save payloads alongside `min_liquidity`.
- faq-ai prompt: fetch the value from commission_settings at request time instead of hardcoding $5; redeploy.
