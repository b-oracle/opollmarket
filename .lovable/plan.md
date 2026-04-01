

# Session Timeout & Inactivity Auto-Logout

## Overview
Add two timeout mechanisms:
1. **1-hour session timeout** — after 1 hour of inactivity, require PIN re-verification to continue
2. **24-hour inactivity timeout** — after 24 hours of total inactivity, fully log out the user (requires email login)

Both controlled by a `session_timeout` feature toggle that super admins can enable/disable.

## How It Works

### PIN Re-verification (1 hour)
- The existing `LoginSecurityGuard` in `App.tsx` stores a `login_sec_verified_{userId}` flag in localStorage
- Currently this flag persists indefinitely — we'll store a **timestamp** instead of `"1"`
- On every app render / visibility change, compare the stored timestamp to `Date.now()`
- If >1 hour has elapsed and the `session_timeout` toggle is enabled, clear the flag → triggers the existing `SecurityVerificationModal`
- Users without PIN/TOTP set up are unaffected (the guard already skips them)

### Full Logout (24 hours)
- Store a `last_active_{userId}` timestamp in localStorage, updated on user interactions (page visibility, navigation)
- On app boot / visibility change, if >24 hours have elapsed and toggle is enabled, call `signOut()`

## Files Changed

### 1. Database — Add feature toggle row
- Insert `session_timeout` row into `feature_toggles` table (using insert tool, not migration)

### 2. `src/App.tsx` — LoginSecurityGuard enhancements
- Change `isSessionVerified()` to read a **timestamp** from localStorage instead of `"1"` (backward-compatible: treat `"1"` as expired)
- Change `markSessionVerified()` to store `Date.now().toString()`
- Add a `useEffect` with a visibility change listener + 60-second interval that:
  - Checks if timestamp is >1 hour old → clears verification flag, triggers PIN modal
  - Checks if `last_active` is >24 hours old → calls `signOut()`
  - Updates `last_active` timestamp on activity
- Gate both checks behind `isFeatureEnabled("session_timeout")` from `useFeatureToggles`

### 3. `src/pages/Auth.tsx` — Update verified marker
- Change the post-login `localStorage.setItem` to store `Date.now().toString()` instead of `"1"` (line ~412)

### 4. `src/hooks/useAuth.ts` — No changes needed
- Sign-out already clears the `login_sec_verified_` key

## Technical Details
- Timestamps stored as epoch milliseconds in localStorage strings
- 1-hour = `3_600_000` ms, 24-hour = `86_400_000` ms
- Backward-compatible: existing `"1"` values are treated as expired (forces re-verification once)
- The interval check runs every 60 seconds to avoid excessive polling
- Feature toggle default: **disabled** (opt-in by super admin)

