

## Add Separate Gold Token Threshold

### Current State
- Single `min_token_balance` field (10M) controls blue tick token requirement
- Gold tick requires BOTH NFT (as avatar) AND meeting the same token threshold
- No separate token threshold for gold

### Changes Required

**1. Database — Add `min_gold_token_balance` column**
```sql
ALTER TABLE commission_settings 
  ADD COLUMN min_gold_token_balance numeric NOT NULL DEFAULT 100000000;
```
Then update the live row:
```sql
UPDATE commission_settings SET min_gold_token_balance = 100000000;
```

**2. Edge Functions — Use separate thresholds**

`update-verification/index.ts` and `bulk-update-verification/index.ts`:
- Read `min_gold_token_balance` from settings alongside `min_token_balance`
- Add `hasGoldTokens = balance >= minGoldTokenBalance` check
- Update level logic:
  - Gold = NFT verified AND `hasGoldTokens` (100M+)
  - Blue = NFT verified OR `hasTokens` (10M+)

**3. Admin Settings UI** (`AdminSettings.tsx`)
- Add new state `minGoldTokenBalance` 
- Add input field labeled "Min BC400 for Gold Tick" below existing "Min BC400 Token Balance" (which becomes "Min BC400 for Blue Tick")
- Include in save payload and audit log

**4. Frontend fallbacks**
- `Create.tsx` line 153: keep blue fallback at 10M, no gold reference needed there
- Edge function fallbacks: `min_gold_token_balance` defaults to `100_000_000`

**5. Audit log** (`AdminAuditLog.tsx`)
- Add display for `min_gold_token_balance` changes

### Files Modified
- `supabase/functions/update-verification/index.ts`
- `supabase/functions/bulk-update-verification/index.ts`
- `src/pages/admin/AdminSettings.tsx`
- `src/pages/admin/AdminAuditLog.tsx`
- Database migration (new column)
- Data update (set initial value)

