

## Cancel Scheduled Spaces + Space Broadcasting

### 1. Cancel Scheduled Spaces

**SpaceCard.tsx** — Add a "Cancel" button next to "Go Live Now" for the host on scheduled spaces.

- When tapped, show a confirm dialog
- On confirm: update the space status to `"cancelled"` (or delete the row), delete associated `space_reminders`, and notify reminded users via `notifications` insert
- No database migration needed — existing `spaces.status` is text and can accept `"cancelled"`

### 2. Space Broadcasting (Paid Visibility Boost)

Mirror the existing market broadcast system for spaces. Anyone can pay to broadcast a space (scheduled or live) to all users via notifications.

**Database Migration** — Create `space_broadcasts` table:
```sql
CREATE TABLE public.space_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'pending',
  tier text NOT NULL DEFAULT 'alert',
  created_at timestamptz DEFAULT now(),
  bonus_amount numeric DEFAULT 0
);
ALTER TABLE public.space_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own broadcasts" ON public.space_broadcasts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own broadcasts" ON public.space_broadcasts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
```

**Edge Function** — `send-space-broadcast/index.ts`
- Accepts `{ space_id, broadcast_id }`
- Fetches space title, inserts notification for all profiles (batched), updates `space_broadcasts.status` to `"sent"`
- Same pattern as existing `send-market-broadcast`

**SpaceCard.tsx** — Add a "Broadcast" (Megaphone) button visible to everyone on scheduled and live spaces.

**New Component** — `BroadcastSpaceModal.tsx`
- Bottom sheet with cost summary (uses `broadcast_price` from `commission_settings`)
- Payment flow: deduct from balance (bonus prioritized) using `debit_balance_atomic`, insert `space_broadcasts` record, invoke `send-space-broadcast` function
- Same UX pattern as the broadcast tab in `BoostMarketModal`

**MyPromotions.tsx** — Add a "Space Broadcasts" section alongside existing market broadcasts so users can track their space broadcast history.

### Files Changed
1. **Migration** — new `space_broadcasts` table
2. **`supabase/functions/send-space-broadcast/index.ts`** — new edge function
3. **`src/components/social/BroadcastSpaceModal.tsx`** — new modal component
4. **`src/components/social/SpaceCard.tsx`** — add Cancel button + Broadcast button
5. **`src/pages/MyPromotions.tsx`** — show space broadcast history

