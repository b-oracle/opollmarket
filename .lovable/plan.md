

## Convert UFC/MMA Markets from Binary (Yes/No) to Multi-Option (Fighter Names)

Currently, MMA markets are created as `binary` type, so users see generic "Yes" and "No" buttons. They should instead see "Buy Fighter1 Name" and "Buy Fighter2 Name" — exactly how football markets show "Home Win / Draw / Away Win".

The UI already fully supports this — `BetModal`, `MarketCard`, and `MarketDetail` all render named option buttons for `multi` type markets. The only changes needed are in the edge functions.

### Changes

**1. `supabase/functions/import-sports-fixtures/index.ts`**

- Change MMA `marketType` from `"binary"` to `"multi"`
- After inserting the market, create two `market_options` rows: `"{Fighter1} Win"` and `"{Fighter2} Win"` (using actual fighter names)
- Update `sport_predicted_outcome` to `"multi_option"` (same as football)
- Set initial prices to 0.50 each

**2. `supabase/functions/check-sports-resolve/index.ts`**

- The `determineWinningOption()` function already matches option labels containing fighter names + "win" against the result — this should work as-is for MMA multi-option markets
- Update the resolution path: when an MMA market is now `multi` type, it will flow through the multi-option resolution branch (using `winning_option_id`) instead of the binary branch (using `winning_side`), which is correct

**3. `supabase/functions/search-fixtures/index.ts`** (if MMA user-created markets also need this)

- Ensure user-created MMA markets also default to `multi` type with fighter name options

### No UI Changes Needed

The existing `MarketCard` and `MarketDetail` components already render multi-option markets with colored option buttons showing the label text (e.g., "Conor McGregor Win — 50%"). The `BetModal` header already shows "Buy {optionLabel}".

### Impact on Existing Markets

Existing binary MMA markets will continue to work as binary. Only newly imported markets going forward will use the multi-option format.

### Files Changed
| File | Action |
|------|--------|
| `supabase/functions/import-sports-fixtures/index.ts` | Edit — MMA → multi type + create fighter options |
| `supabase/functions/search-fixtures/index.ts` | Edit — same change for user-created MMA markets |

