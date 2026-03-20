

## Fix: Replace Supabase URLs with opoll.org in all share links

### Problem
When sharing to Twitter (and Facebook), the share URL contains the raw Supabase function URL (e.g., `dqtjuhqndncanfwgjwva.supabase.co/functions/v1/og-share?id=...`). This looks unprofessional and confusing to users.

### Solution
Replace all `og-share` Supabase URLs with clean `opoll.org/market/...` links across all share flows. The tradeoff is that Twitter/Facebook won't show per-market OG previews (they'll see the generic site-level OG tags), but the links will be clean and branded.

### Files to change

**1. `src/components/ShareModal.tsx`**
- Remove the `ogShareLink` variable entirely (lines 116-121)
- Use `cleanShareLink` for all social share buttons (Twitter, Facebook) instead of `ogShareLink`
- This ensures Twitter and Facebook share links use `https://opoll.org/market/...`

**2. `src/pages/Create.tsx`**
- Line 2963: Replace `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/og-share?id=${newMarketId}` with `https://opoll.org/market/${newMarketId}`
- Also fix lines 2972 and 2981 to use `https://opoll.org/market/...` instead of `window.location.origin` (ensures clean URL even from preview/dev environments)
- Fix line 2991 (copy link) similarly

### Impact
- All share links will show `opoll.org` domain
- Per-market rich previews on Twitter/Facebook will show generic site OG tags (the generic tags are already good — they describe OPoll well)
- No backend changes needed

