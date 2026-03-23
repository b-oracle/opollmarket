

## Plan: Upgrade Telegram Bot & Enrich Notification Delivery

### Summary

The Telegram bot is already feature-rich (link, markets, quick trade, portfolio, balance, FAQ). The `telegram-notify` edge function is already called by the `send_push_on_notification` database trigger for every notification insert. However, the notifications sent are plain text with no actionable buttons and no type-specific formatting. Additionally, users don't receive loss notifications for quick trades, and there's no notification preferences system.

### What Will Change

**1. Enhance `telegram-notify` with rich, type-aware messages**

Currently sends bare text. Will upgrade to:
- Map notification `type` (payout, resolution, refund, info, follow, referral, first_prediction_required) to emoji-prefixed formatted messages
- Add inline keyboard buttons contextually (e.g. "View Market" button for market-related notifications, "View Portfolio" for payouts, "View Profile" for follows)
- Include progress bars for resolution payouts showing win amount
- Use the `actor_id` field to deep-link follow notifications to the follower's profile

**2. Add Quick Trade loss notifications**

The `resolve-quick-round` function currently only inserts notifications for winners and streak milestones. Will add loss notifications so users are informed of outcomes on both sides:
- Insert a notification for losers: "Quick Trade Result 📉 — You lost $X on ASSET. Try again!"
- These will automatically reach Telegram via the existing trigger

**3. Add `/notifications` command to Telegram bot**

New command showing recent notification history (last 10) with type icons, so users can review what they missed.

**4. Add `/settings` command for Telegram notification preferences**

Add a `telegram_notification_preferences` column (JSONB) to `telegram_users` table with toggles for:
- `payouts` (default: on)
- `resolutions` (default: on)  
- `quick_trades` (default: on)
- `followers` (default: on)
- `info` (default: on)

Update `telegram-notify` to check these preferences before sending. Add `/settings` command with inline keyboard toggles.

**5. Minor bot UX improvements**

- Deduplicate the `assetEmojis` map (currently repeated 5 times) into a single constant
- Add `/notifications` and `/settings` to the `/help` command listing
- Update the "Link your account" prompts to use the secure `/link` flow text instead of legacy `/link email password`

### Technical Details

**Files to modify:**
- `supabase/functions/telegram-notify/index.ts` — Rich formatting + preference checking
- `supabase/functions/telegram-bot/index.ts` — New commands, dedup asset emojis, fix legacy text
- `supabase/functions/resolve-quick-round/index.ts` — Add loser notifications

**Database migration:**
- Add `notification_preferences JSONB DEFAULT '{}'` column to `telegram_users` table

**No frontend changes needed** — all improvements are backend/bot-side.

### Implementation Order
1. Database migration (add preferences column)
2. Update `telegram-notify` with rich formatting + preference filtering
3. Update `resolve-quick-round` to notify losers
4. Update `telegram-bot` with `/notifications`, `/settings`, dedup, text fixes
5. Deploy all three edge functions

