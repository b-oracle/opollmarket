

## How Verification Currently Works

The `update-verification` edge function is only called in two places:
1. When a user visits their **Profile page** (on mount)
2. After a user **sets an NFT as avatar**

There is no periodic or scheduled check, so if a user removes tokens/NFTs from their wallet, their badge persists indefinitely until they revisit their profile page.

## Proposed Solution: Scheduled Hourly Verification Sweep

Add a **scheduled hourly check** using the existing `bulk-update-verification` edge function (already built for admin use). This function iterates all profiles with wallets and recalculates verification levels.

### Implementation

1. **Create a new edge function `cron-update-verification`** — a lightweight wrapper that calls `bulk-update-verification` with service role auth. This gives us a dedicated cron entry point that can be invoked by an external scheduler or by the existing `check-auto-resolve` pattern (which is already called on a schedule).

2. **Add the cron invocation** — Since Lovable Cloud doesn't have native cron, we'll add the verification sweep as an additional call inside the existing `check-auto-resolve` function (which is already triggered periodically). This piggybacks on the existing scheduled infrastructure without needing a new cron setup.

3. **Also trigger on sign-in** — Add a call to `update-verification` in the auth state change listener (`useAuth.ts`) when a user signs in, so stale badges are caught immediately on login.

### Changes

**File: `src/hooks/useAuth.ts`**
- In the `SIGNED_IN` event handler, invoke `update-verification` in the background so the user's badge is rechecked on every login.

**File: `supabase/functions/check-auto-resolve/index.ts`**
- At the end of the function (after existing auto-resolve logic), add a service-role call to `bulk-update-verification` so verification levels are refreshed every time the cron runs. This reuses existing infrastructure.

### Result
- **On sign-in**: User's own verification is rechecked immediately
- **On profile visit**: Already handled (existing behavior)
- **Every scheduled cron cycle**: All users with wallets get rechecked via bulk-update-verification
- No new infrastructure or external services needed

