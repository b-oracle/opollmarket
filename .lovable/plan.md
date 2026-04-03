

## Partner Revenue Share for API-Created Markets

### Problem
Currently, API partners only earn affiliate commission when bets are placed **through the API** itself. If a partner creates a market via the API and users predict on it through the website, the partner earns nothing. Partners should earn revenue share on **all** predictions on markets they created via their API key.

### Solution

**1. Database Migration — Tag markets with their originating API key**

Add `api_key_id` column to the `markets` table:
```sql
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL;
CREATE INDEX idx_markets_api_key ON public.markets (api_key_id) WHERE api_key_id IS NOT NULL;
```

**2. `supabase/functions/api-public/index.ts` — Store API key on market creation**

In the `create-market` action (~line 378), add `api_key_id: apiKeyRecord.id` to the market insert payload. This tags every API-created market with the partner who created it.

**3. `supabase/functions/place-bet/index.ts` — Record partner revenue share on every prediction**

After the existing commission logic (~line 298, after BC400 queue), add:
- Fetch the market's `api_key_id` (already have `marketId` in context)
- If `api_key_id` exists, look up the `affiliate_commission_percent` from `api_keys`
- Calculate the partner's share as a percentage of the total prediction fee (same formula as existing affiliate tracking)
- Insert into `affiliate_earnings` table
- Queue a `pending_commission` of type `"partner"` for deferred 48h release to the API key owner's balance

This means the market query at line 57 needs to also select `api_key_id`. The partner share comes **from the platform's portion** of the fee (not from the creator or referrer share).

**4. `supabase/functions/process-pending-commissions/index.ts` — Handle `partner` type**

Add handling for `type = 'partner'` commissions alongside the existing creator/referral logic — deduct from platform pool and credit to the API key owner's balance.

### Fee Flow Example
- User bets $100 on an API-created market
- 10% prediction fee = $10
- Creator gets their split (e.g. 30% of $10 = $3)
- Referrer gets their split (if applicable)
- BC400 pool gets its split
- **Partner gets 5% of $10 = $0.50** (from platform's remaining portion)
- Platform keeps the rest

### Files Changed
- New migration (1 file)
- `supabase/functions/api-public/index.ts` — 1 line addition
- `supabase/functions/place-bet/index.ts` — ~25 lines added after BC400 section
- `supabase/functions/process-pending-commissions/index.ts` — ~10 lines for partner type handling

