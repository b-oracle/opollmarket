

# Deferred Commission Distribution (48-Hour Hold)

## Concept

Instead of instantly crediting commissions (creator fee, referrer fee) to user balances at trade time, we queue them as **pending commissions**. After 48 hours, a scheduled function releases them. If the market is cancelled within that window, the pending commissions are simply voided -- no clawback needed.

## Database Changes

### New table: `pending_commissions`

| Column | Type | Description |
|---|---|---|
| id | uuid PK | |
| user_id | uuid | Commission recipient |
| market_id | uuid | Source market |
| amount | numeric | Commission amount |
| type | text | `creator`, `referral`, `bc400` |
| status | text | `pending`, `released`, `cancelled` |
| releases_at | timestamptz | `now() + interval '48 hours'` |
| created_at | timestamptz | |
| trade_transaction_id | uuid | Optional ref to the buy transaction |

RLS: Users can SELECT own rows. Admins can SELECT all.

### Enable realtime (optional) for admin monitoring.

## Edge Function Changes

### 1. `place-bet/index.ts`
- **Keep**: Credit entire `totalFees` to admin pool reserve (this is the platform holding the money).
- **Remove**: Direct creator commission payout (lines 195-208) and referrer commission payout (lines 212-233). Instead, insert rows into `pending_commissions` with `status: 'pending'` and `releases_at: now() + 48h`.
- **Keep**: Instant notification to creator/referrer about their earned commission (informational only, no balance credit yet). Adjust wording: "You earned $X commission -- it will be credited in 48 hours."

### 2. `copy-trade/index.ts` and `approve-copy-trade/index.ts`
- Same pattern: queue commissions to `pending_commissions` instead of instant payout.

### 3. `telegram-bot/index.ts`
- Same pattern for any commission distribution in the bet flow.

### 4. New function: `process-pending-commissions/index.ts`
- Scheduled via pg_cron (every 30 minutes or hourly).
- Selects all `pending_commissions` where `status = 'pending'` AND `releases_at <= now()`.
- For each: check if the market is still active/resolved (not cancelled). If valid:
  - Deduct from admin balance, credit to recipient.
  - Insert `commission` transaction record.
  - Update status to `released`.
  - Send notification: "Your $X commission has been credited! 💰"
- If market is cancelled: update status to `cancelled` (no balance movement, money stays in admin pool).

### 5. `cancel-market/index.ts`
- **Simplify**: Remove the commission clawback loop entirely (lines 142-167).
- Instead: Update all `pending_commissions` for this market to `status = 'cancelled'`.
- Send notifications to affected users: "Market cancelled -- your pending $X commission will not be credited."

## Frontend Changes

### `BetModal.tsx`
- No change needed -- fee display stays the same.

### Admin Settings
- No change needed.

### Optional: Portfolio/notifications
- Pending commissions could show in user's portfolio as "Pending" with a countdown, but this is a nice-to-have.

## Scheduled Job Setup

```sql
select cron.schedule(
  'process-pending-commissions',
  '*/30 * * * *',
  $$ select net.http_post(
    url:='https://dqtjuhqndncanfwgjwva.supabase.co/functions/v1/process-pending-commissions',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer <anon_key>"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id; $$
);
```

## Files to create/modify
- **Create**: `pending_commissions` table (migration)
- **Create**: `supabase/functions/process-pending-commissions/index.ts`
- **Modify**: `supabase/functions/place-bet/index.ts` -- queue instead of pay
- **Modify**: `supabase/functions/copy-trade/index.ts` -- same
- **Modify**: `supabase/functions/approve-copy-trade/index.ts` -- same
- **Modify**: `supabase/functions/telegram-bot/index.ts` -- same
- **Modify**: `supabase/functions/cancel-market/index.ts` -- void pending instead of clawback
- **Setup**: pg_cron job for `process-pending-commissions`

