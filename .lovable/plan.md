
## Goal

Complete the native Android Google sign-in flow so the Google ID token is exchanged by Lovable Cloud auth into a real app session, without changing the existing web Google OAuth flow.

## Key clarification

There are two separate pieces:

```text
Android native Google picker
  -> returns Google ID token
  -> Lovable Cloud auth verifies token audience/nonce
  -> Lovable Cloud auth returns app access + refresh session
  -> existing useAuth() detects the session
```

The app already has the client-side exchange call:

```ts
supabase.auth.signInWithIdToken({
  provider: "google",
  token: idToken,
  nonce,
})
```

What still needs hardening is:
- backend/provider configuration so the token audience is accepted
- session validation after exchange
- better Android-specific error handling
- verification steps for the native app

## Implementation plan

### 1. Configure the backend Google provider for native token exchange

I will preserve the existing web Google OAuth setup and extend the Google provider configuration so the backend accepts native Google ID tokens.

The backend Google provider should include the accepted Google OAuth client IDs, with the Web client ID first:

```text
WEB_CLIENT_ID.apps.googleusercontent.com,ANDROID_CLIENT_ID.apps.googleusercontent.com
```

If you have separate debug, release, or Play Store Android client IDs, those should also be included.

The existing Web client secret remains the one used for web OAuth. The Android client ID does not replace it.

### 2. Replace the placeholder Web Client ID in native Android code

Update:

```ts
src/lib/nativeGoogleAuth.ts
```

Replace:

```ts
REPLACE_WITH_YOUR_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com
```

with your actual Web application Client ID.

This value is public and safe to ship in the app. It is used by the native Google plugin to request an ID token that the backend can verify.

### 3. Harden the native token exchange helper

Update `signInWithNativeGoogle()` to:

- initialize Google sign-in only on native Android
- request the Google ID token from the native plugin
- exchange the ID token with Lovable Cloud auth
- verify that a session was actually returned
- call `supabase.auth.getUser()` after exchange to confirm the session is valid
- throw clear, actionable errors for:
  - missing Web Client ID
  - missing Google ID token
  - invalid audience/client ID mismatch
  - nonce mismatch
  - cancelled sign-in
  - no app session returned after exchange

The successful path will return a verified session/user object instead of assuming the exchange worked.

### 4. Update the Auth page native branch only

In `src/pages/Auth.tsx`, keep this split:

```text
Web/PWA/browser:
  use existing lovable.auth.signInWithOAuth("google")

Capacitor Android:
  use signInWithNativeGoogle()
```

For the Android branch, I will only navigate after the helper confirms there is a valid app session.

The existing web Google OAuth flow will remain unchanged.

### 5. Add verification guidance and diagnostics

Update the Android native Google sign-in documentation to confirm:

- Android OAuth Client ID remains in Google Cloud Console
- Android OAuth Client ID must use package:

```text
app.lovable.fbc135e2c42c4d3fbb3ee7385ced809f
```

- SHA-1 fingerprints must include:
  - debug keystore
  - release upload key
  - Play App Signing key, if distributed through Google Play

Add a short troubleshooting section for common backend exchange failures:

```text
invalid audience / invalid_client:
  backend Google provider does not include the client ID in the ID token audience

nonce mismatch:
  Google token nonce and backend nonce check do not match

no ID token returned:
  native Google client/webClientId setup is wrong or Play Services account picker failed
```

### 6. Verification steps

After implementation, I will verify what can be verified in the Lovable environment:

- TypeScript compile/build succeeds
- existing web Google OAuth code path is still present and unchanged
- native Android code path compiles
- token exchange helper explicitly validates session creation

For full native verification, you will then run locally:

```bash
npm install
npm run build
npx cap sync android
```

Then test on a real Android device or emulator with Google Play Services:

```text
Open Android app
Tap Continue with Google
Pick Google account
Confirm app navigates into the authenticated app
Close and reopen app
Confirm user remains signed in
```

## Input needed before the implementation can be finalized

I will need the actual public Google OAuth Client IDs:

```text
1. Web application Client ID
2. Android OAuth Client ID
```

If you have multiple Android client IDs for debug/release/Play Store, provide all of them so the backend accepts tokens from every build variant.
