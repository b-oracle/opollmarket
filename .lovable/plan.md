

# Only Prompt Security Verification on Actual Sign-In

## Problem
The `LoginSecurityGuard` uses `sessionStorage` to track verification. Since `sessionStorage` is cleared when the browser/tab is closed, every app reopen or refresh (after tab close) triggers the PIN modal again — even though the user already has a valid session.

## Solution
Switch the verification cache from `sessionStorage` to `localStorage`. This persists across browser restarts. Clear it explicitly on sign-out only.

### Changes

**`src/App.tsx`** — `LoginSecurityGuard`
- Change `sessionStorage.getItem(...)` → `localStorage.getItem(...)`
- Change `sessionStorage.setItem(...)` → `localStorage.setItem(...)`

**`src/hooks/useAuth.ts`** — `signOut` callback
- Add `localStorage.removeItem(login_sec_verified_${userId})` before clearing state, so signing out forces re-verification on next login

**`src/pages/Auth.tsx`** — login handler
- Update the existing `sessionStorage.setItem` call to use `localStorage` instead

This way:
- **Sign-in** → PIN prompted → verified → stored in `localStorage`
- **Refresh / reopen app** → `localStorage` still has the flag → no prompt
- **Sign-out** → flag cleared → next sign-in will prompt again

