

## Plan: Fix Share Links with Cloudflare Worker (No CNAME)

### Root Cause
Cloudflare blocks CNAME records that point from one Cloudflare account to another (Error 1014). Since Supabase runs on Cloudflare, the CNAME `opollmarket.com → dqtjuhqndncanfwgjwva.supabase.co` is blocked.

### Solution
Remove the CNAME record entirely. Use only a Cloudflare Worker to proxy `/s` requests.

### Step 1: DNS fix (manual, at Cloudflare)
1. **Delete** the CNAME record pointing to `dqtjuhqndncanfwgjwva.supabase.co`
2. Add a **proxied A record**: `@ → 192.0.2.1` (dummy IP, Cloudflare-proxied orange cloud)
3. This allows the Cloudflare Worker to intercept requests

### Step 2: Cloudflare Worker (manual setup)
Create a Worker with this code and attach route `opollmarket.com/s*`:

```javascript
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/s" || url.pathname === "/s/") {
      const target = "https://dqtjuhqndncanfwgjwva.supabase.co/functions/v1/og-share" + url.search;
      const resp = await fetch(target, {
        method: request.method,
        headers: new Headers({
          "User-Agent": request.headers.get("User-Agent") || "",
          "Accept": request.headers.get("Accept") || "*/*",
        }),
      });
      return new Response(resp.body, {
        status: resp.status,
        headers: resp.headers,
      });
    }
    // All other paths redirect to main site
    return Response.redirect("https://opoll.org" + url.pathname, 302);
  }
};
```

### Step 3: Code fix — BetModal.tsx
`BetModal.tsx` still uses the raw Supabase URL for Twitter share links. Update it to use `opollmarket.com/s` like ShareModal does.

### Files changed
- `src/components/BetModal.tsx` — replace raw Supabase URL with branded `opollmarket.com/s` link

### Summary
- No CNAME needed — delete it
- Cloudflare Worker handles proxying
- One code fix to align BetModal with the branded URL pattern

