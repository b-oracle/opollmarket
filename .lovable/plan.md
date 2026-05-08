## Problem
The `enforce_min_market_duration` DB trigger blocks any new market with `end_date` less than 3 days out. The crypto Up/Down spawner just hit it on BNB/5m. The rule should only apply to user-created **Sports** markets, not crypto rounds, quick-trade, or anything else.

## Fix
Update the `public.enforce_min_market_duration()` function so it only raises when **all** of the following are true:
- `category = 'Sports'`
- `is_crypto_round` is false (defensive — crypto rounds never use Sports anyway)
- The existing sports auto-resolve exemption (kickoff-driven) still passes through

Effective behaviour after the fix:
- Sports manual markets → still need 3+ day window
- Sports auto-resolve (kickoff) → exempt (unchanged)
- Crypto Up/Down rounds (5m, 15m, 1h, 24h) → exempt
- Quick Trade, Politics, Crypto news, Custom, etc. → exempt

## Migration SQL
```sql
CREATE OR REPLACE FUNCTION public.enforce_min_market_duration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     AND NEW.end_date IS NOT NULL
     AND NEW.category = 'Sports'
     AND COALESCE(NEW.is_crypto_round, false) = false
     AND NOT (COALESCE(NEW.auto_resolve, false) AND NEW.sport_match_id IS NOT NULL)
     AND NEW.end_date < (CURRENT_DATE + INTERVAL '3 days')::date
  THEN
    RAISE EXCEPTION 'Sports market resolution date must be at least 3 days from today (got %)', NEW.end_date
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
```

## Verification
After the migration runs:
1. Re-hit **Spawn now** for BNB/5m, BTC/5m, ETH/5m, SOL/5m, BTC/15m, ETH/15m, SOL/15m in `/admin/quick-trade`.
2. Confirm the Spawn Audit Log shows `success` and rows appear in `crypto_round_meta`.
3. Confirm the feed renders the live Up/Down cards.

## Front-end checks
The market creation form for Sports should still be enforcing the 3-day minimum on its own — I'll grep for it after the migration is approved and tighten the client-side message to mention "Sports" if it currently says otherwise. No other UI changes needed.