

## Fix Security PIN/2FA Login Verification Issues

### Problem
When a user sets up a PIN, the login flow does not ask for PIN verification because `require_pin_login` defaults to `false` in the database. The user has to manually find and toggle this on the Profile page — which is unintuitive. Similarly for TOTP.

Additionally, the SecurityVerificationModal text needs review for correctness when only one method is active.

### Changes

**1. Auto-enable login requirement when setting up PIN** (`supabase/functions/setup-security-pin/index.ts`)
- Add `require_pin_login: true` and `require_pin_withdrawal: true` to the upsert payload (line 80-86)
- This means: set up PIN → login and withdrawal protection are ON by default

**2. Auto-enable login requirement when enabling TOTP** (`supabase/functions/setup-totp/index.ts`)
- In the "verify" action (line 146-153), add `require_totp_login: true` and `require_totp_withdrawal: true` to the update payload
- This means: enable 2FA → login and withdrawal protection are ON by default

**3. Text corrections in SecurityVerificationModal** (`src/components/SecurityVerificationModal.tsx`)
- PIN step text: "Enter your 6-digit PIN" — correct, no change
- TOTP step text: "Enter the code from Google Authenticator" — correct, no change
- These texts already differentiate correctly based on `step`

**4. Text correction in Auth.tsx login modal title**
- The modal is `SecurityVerificationModal` which always shows "Security Verification" — this is fine contextually. The step-based content already shows the correct icon (Lock for PIN, Smartphone for TOTP) and correct prompt text.

### Summary
The real fix is 2 edge function changes: auto-set `require_pin_login: true` and `require_totp_login: true` when users set up each method, so login protection is immediate without manual toggling.

