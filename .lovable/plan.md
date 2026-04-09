

## Plan: Unify Share Links to Use opoll.org

### Problem
The social share buttons (Twitter, Facebook, WhatsApp, Telegram) use `ogShareLink` which constructs a raw Supabase function URL (`dqtjuhqndncanfwgjwva.supabase.co/functions/v1/og-share?id=...`). The Copy button and native Share use `cleanShareLink` which correctly uses `https://opoll.org/market/...`.

### Solution
Remove the `ogShareLink` variable entirely and use `cleanShareLink` for all share targets. The OG preview cards on social platforms will still work because opoll.org serves proper OG meta tags via its routing.

### Changes

**File: `src/components/ShareModal.tsx`**
- Delete the `ogShareLink` computed variable (lines 117-124)
- Update `handleTwitter`, `handleFacebook`, `handleWhatsApp`, `handleTelegram` to use `cleanShareLink` instead of `ogShareLink`

This is a single-file, 6-line change.

