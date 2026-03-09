

# Security PIN & Google 2FA for Login and Withdrawals

## Overview
Add a two-layer security system: a 6-digit PIN (passcode) and optional Google Authenticator TOTP. Users must set up at least one during registration. Either/both can be required for withdrawal processing, togglable from profile settings.

## Database Changes

**New table: `user_security_settings`**
- `user_id` (uuid, PK, references profiles)
- `pin_hash` (text, nullable) — bcrypt hash of 6-digit PIN
- `totp_secret` (text, nullable) — encrypted TOTP secret for Google Authenticator
- `totp_enabled` (boolean, default false) — whether TOTP is fully verified/active
- `pin_enabled` (boolean, default false)
- `require_pin_withdrawal` (boolean, default true)
- `require_totp_withdrawal` (boolean, default false)
- `security_setup_complete` (boolean, default false) — gates post-registration redirect
- `created_at`, `updated_at`

RLS: Users can SELECT/UPDATE own row only. INSERT via service role (trigger on profile creation).

**Trigger**: Auto-create a `user_security_settings` row when a profile is created.

## New Edge Functions

1. **`setup-security-pin`** — Accepts a 6-digit PIN, hashes it server-side (bcrypt via Deno), stores in `user_security_settings`. Marks `pin_enabled = true`, `security_setup_complete = true`.

2. **`setup-totp`** — Two actions:
   - `generate`: Creates a TOTP secret, returns the otpauth URI (for QR code) and the secret string
   - `verify`: Accepts a 6-digit TOTP code, validates it against the stored secret, sets `totp_enabled = true`, `security_setup_complete = true`

3. **`verify-security`** — Accepts `{ type: "pin" | "totp", code: string }`, validates against stored credentials, returns `{ valid: boolean }`. Used before withdrawal processing.

## Frontend Changes

### 1. Security Setup Page (`/setup-security`)
- New page shown after registration (before user can access the app)
- Two cards: "Set a 6-digit PIN" and "Set up Google Authenticator"
- PIN flow: enter PIN → confirm PIN → submit
- TOTP flow: show QR code (using `otpauth://` URI rendered as QR via a simple canvas/SVG lib) → user enters code from app → verify
- User must complete at least one to proceed
- Skip button hidden — at least one is mandatory

### 2. Auth Flow Guard
- In `App.tsx` or a wrapper component, check if authenticated user has `security_setup_complete = false` → redirect to `/setup-security`
- Query `user_security_settings` on auth state change

### 3. Profile Security Settings Section
- New "Security" section on Profile page
- Toggle switches for:
  - "Require PIN for withdrawals" (if PIN is set up)
  - "Require 2FA for withdrawals" (if TOTP is set up)
- Options to change PIN or reset TOTP

### 4. Withdrawal Security Verification
- In `DepositWithdrawModal.tsx`, before calling `request-withdrawal`:
  - Fetch user's security settings
  - If `require_pin_withdrawal` → show PIN input modal
  - If `require_totp_withdrawal` → show TOTP input modal
  - Call `verify-security` edge function for each required method
  - Only proceed with withdrawal if all required verifications pass

### 5. `request-withdrawal` Edge Function Update
- Add server-side check: verify that the user passed security verification within the last 5 minutes (tracked via a short-lived token or a `last_verified_at` timestamp on the security settings row)

## File Impact Summary

| Area | Files |
|------|-------|
| Database | 1 migration (table + trigger + RLS) |
| Edge Functions | 3 new: `setup-security-pin`, `setup-totp`, `verify-security` |
| Edge Function Edit | `request-withdrawal` (add verification check) |
| New Pages | `src/pages/SetupSecurity.tsx` |
| New Components | `src/components/SecurityVerificationModal.tsx`, `src/components/PinInput.tsx` |
| Modified Pages | `src/pages/Profile.tsx` (security settings section) |
| Modified Components | `src/components/DepositWithdrawModal.tsx` (pre-withdrawal verification) |
| Routing | `src/App.tsx` (add route + auth guard) |

## Dependencies
- TOTP generation/verification: handled in Deno edge function using `otpauth` npm package via esm.sh
- QR code display: use a lightweight QR renderer (e.g. inline SVG generation or a small library)
- PIN hashing: bcrypt via Deno std library

