

## Plan: Use Custom Domain for Share Links

### How it works
You point `opollmarket.com` DNS to Supabase's servers via a CNAME record. Then share links become `https://opollmarket.com/functions/v1/og-share?id=...` — fully branded, no Supabase URL exposed.

### Steps

**1. DNS setup (at your domain registrar)**
Add a CNAME record for `opollmarket.com`:
- **Type**: CNAME
- **Name**: `@` (root) or leave blank (depends on registrar)
- **Value**: `dqtjuhqndncanfwgjwva.supabase.co`

> **Note**: Some registrars don't allow CNAME on root domains. If that's the case, use a subdomain like `link.opollmarket.com` or use a registrar that supports CNAME flattening (e.g., Cloudflare).

**2. Update `ShareModal.tsx`**
Replace the Supabase URL in `ogShareLink` with the custom domain:
```typescript
const ogShareLink = `https://opollmarket.com/functions/v1/og-share?id=${marketId}`;
```

**3. Update `og-share/index.ts`**
Update the CORS headers to include the new origin. No other backend changes needed — the function already works correctly.

### Important caveat
Supabase custom domains for Edge Functions require the **Pro plan** on Supabase to map a custom domain to the project. Since this project runs on Lovable Cloud, this may not be directly configurable. 

**Practical alternative**: Use Cloudflare (free tier) as a reverse proxy:
1. Add `opollmarket.com` to Cloudflare (DNS only, free)
2. Create a Cloudflare Worker that proxies requests from `opollmarket.com/s/*` to the Supabase `og-share` function
3. Share links become `https://opollmarket.com/s/MARKET_ID` — clean and branded
4. Update `ShareModal.tsx` to use this URL pattern

This is the most reliable approach since it doesn't depend on Supabase custom domain support.

### Files changed
- `src/components/ShareModal.tsx` — update share link URL
- `supabase/functions/og-share/index.ts` — minor CORS update

