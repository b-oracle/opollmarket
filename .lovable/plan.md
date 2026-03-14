

## Plan: Market Broadcast Feature + Creation Checkout Integration

### Overview
Add a "Broadcast" ad feature alongside Boost in the BoostMarketModal, and integrate both as optional checkout add-ons during market creation.

---

### 1. Database: `market_broadcasts` Table
Create a new migration with a `market_broadcasts` table to track broadcast purchases:
- `id`, `market_id`, `user_id`, `status` (pending/sent/expired), `amount` ($5), `tier` (alert -- single tier for now), `nowpayments_payment_id`, `tx_hash`, `created_at`
- RLS: publicly readable, authenticated users can insert own, admins can update

### 2. Edge Function: `create-broadcast-payment`
New edge function mirroring `create-boost-payment`:
- Accepts `market_id`, `tier: "alert"`
- Creates NOWPayments invoice for $5
- Inserts pending record into `market_broadcasts`
- Returns payment details (address, amount, QR data)

### 3. Edge Function: `send-market-broadcast`
New edge function triggered when broadcast payment is confirmed (via webhook update or polling):
- Fetches all user IDs from `profiles` table
- Randomly selects a batch (e.g., all users for now)
- Bulk inserts notifications with market link
- Updates broadcast status to `sent`

### 4. Update NOWPayments Webhook
Modify `nowpayments-webhook` to detect broadcast order IDs (prefix `broadcast_`) and activate the broadcast by invoking `send-market-broadcast`.

### 5. Redesign `BoostMarketModal` UI
Transform the modal into a two-section layout on the selection step:

**Section 1: Boost Market** (existing 3 tiers -- Flash $20, Standard $50, Whale $150)
- User can select one boost tier (or none)

**Section 2: Broadcast** (new)
- Single "Alert" option with Megaphone icon, $5 price
- User can toggle it on/off independently of boost selection

**Combined checkout:**
- "Continue" button shows combined total (e.g., "$55" if Standard + Alert selected, or "$5" if only Alert)
- Confirm step shows combined summary
- Payment step creates one or both payments
- Both selections are independent -- user can pick one from each section or just one

### 6. Market Creation Checkout Integration
In `Create.tsx` Step 3 (Liquidity & Review), add two optional toggle cards before the Cost Breakdown:

- **Boost Market** toggle with tier selector (Flash/Standard/Whale) -- adds tier price to total
- **Broadcast Market** toggle -- adds $5 to total

These are deducted from user balance at creation time (same as creation fee / auto-resolve fee). After market is created:
- If boost selected: insert into `market_boosts` with status `active` (paid from balance, no crypto payment needed)
- If broadcast selected: insert into `market_broadcasts` with status `sent` and trigger notifications immediately

Update the cost breakdown and total calculation to include these optional add-ons.

### Technical Details

**Migration SQL:**
```sql
CREATE TABLE public.market_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL,
  user_id uuid NOT NULL,
  tier text NOT NULL DEFAULT 'alert',
  amount numeric NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'pending',
  nowpayments_payment_id text,
  tx_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.market_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Broadcasts publicly readable" ON public.market_broadcasts FOR SELECT USING (true);
CREATE POLICY "Users can create own broadcasts" ON public.market_broadcasts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can update broadcasts" ON public.market_broadcasts FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
```

**Files to create:**
- `supabase/functions/create-broadcast-payment/index.ts`
- `supabase/functions/send-market-broadcast/index.ts`

**Files to modify:**
- `src/components/BoostMarketModal.tsx` -- add Broadcast section alongside Boost tiers
- `src/pages/Create.tsx` -- add optional Boost + Broadcast toggles in Step 3, update cost calculation and `handleCreateMarket`
- `supabase/functions/nowpayments-webhook/index.ts` -- handle broadcast order IDs
- `supabase/functions/create-boost-payment/index.ts` -- minor: support combined orders if needed

