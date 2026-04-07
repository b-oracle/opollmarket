

## Plan: Restrict Twitter/X Auto-Resolve Markets to 5-Day Maximum

### Problem
Twitter/X auto-resolve markets can currently be set with distant end dates (e.g., December 2029), causing excessive X API polling costs over extended periods.

### Solution
Enforce a maximum 5-day resolution window for any market using Twitter/X auto-resolve, in both the user-facing Create page and the Admin Create Market page.

### Changes

**1. `src/pages/Create.tsx`**
- Update the `endDate` validation rule: when `category === "Twitter/X"` and `autoResolve` is true, validate that `endDate` is within 5 days from today. Show error: "Twitter/X markets must resolve within 5 days"
- Dynamically set the `max` attribute on the end-date input to 5 days from now when Twitter/X auto-resolve is active
- Add a helper note below the date picker when Twitter/X is selected explaining the 5-day limit

**2. `src/pages/admin/AdminCreateMarket.tsx`**
- Apply the same 5-day max validation for Twitter markets (`isTwitterMarket` flag)
- Cap the date picker max value accordingly

**3. `supabase/functions/publish_draft_market` (database function)**
- Add a server-side guard in the `publish_draft_market` function: if `twitter_resource_id` is set, reject if `end_date` is more than 5 days from now

### Technical Details
- Validation: `new Date(endDate) > new Date(Date.now() + 5 * 86400000)` → error
- The 5-day cap applies only when Twitter/X auto-resolve is enabled; non-auto-resolve Twitter/X markets are unaffected
- Server-side enforcement in the publish function prevents bypassing the UI constraint

