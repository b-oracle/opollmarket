

## Fix Login PIN Behavior

### Problems Identified

1. **Inactivity timeout is 1 hour** — user wants 30 minutes
2. **Race condition in Auth.tsx onVerified**: The `onVerified` callback uses `supabase.auth.getSession().then(...)` to get the user ID asynchronously. This is fragile — the user is already known at that point from the login flow, and the async chain can silently fail, causing the App-level `LoginSecurityGuard` to not find the verified flag and potentially re-prompt
3. **Feature toggle dependency**: The inactivity-based re-prompt only works when the `session_timeout` feature toggle is enabled. If it's off, PIN verification persists indefinitely after first login (no re-prompt on inactivity)

### Solution

**1. Change inactivity timeout from 1 hour to 30 minutes**
- `src/App.tsx` line 228: Change `SESSION_PIN_TIMEOUT_MS` from `3_600_000` to `1_800_000` (30 minutes)

**2. Fix the Auth.tsx onVerified race condition**
- `src/pages/Auth.tsx` lines 408-415: Instead of using async `getSession()`, use the `user` object already available in component state (from `useAuth()`) to write the localStorage key synchronously. This guarantees the App-level guard sees the verified flag immediately.

**3. Ensure session_timeout toggle is enabled**
- Verify the `session_timeout` feature toggle exists and is enabled in the database, since the inactivity re-prompt logic is gated behind it

### Files Changed
- `src/App.tsx` — 1 line change (timeout constant)
- `src/pages/Auth.tsx` — ~5 lines changed (onVerified handler)
- Possibly a migration to ensure `session_timeout` toggle exists

