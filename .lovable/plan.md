
## Goal

Add an Android-only fallback so if native Google sign-in fails, users can still use the existing web-based Google OAuth flow without changing how web/PWA users currently sign in.

## What will change

### 1. Extract the existing web Google OAuth into a reusable fallback

In `src/pages/Auth.tsx`, I will create a small helper inside the component, such as:

```ts
const signInWithWebGoogle = async () => {
  return lovable.auth.signInWithOAuth("google", {
    redirect_uri: window.location.origin,
  });
};
```

This keeps the current working web OAuth logic intact and makes it reusable after native failure.

### 2. Add Android fallback behavior after native failure

For Android Capacitor only:

```text
Tap Continue with Google
  -> try native Google sign-in first
  -> if native sign-in succeeds, verify session and navigate
  -> if native sign-in fails or no valid session is created:
       show a short fallback message
       launch the existing web Google OAuth flow
```

The user experience will be:

```text
Native Google sign-in could not complete. Opening browser-based Google sign-in instead.
```

Then the app will call the same existing web OAuth flow currently used by browser users.

### 3. Preserve user cancellation behavior

If the user explicitly cancels the native Google picker, I will not force the fallback automatically. Cancellation is an intentional action, so the app should simply show/cancel cleanly.

Fallback will run for real native failures such as:

- native plugin unavailable
- no ID token returned
- invalid audience/client mismatch
- nonce/session exchange failure
- no verified app session after native exchange

### 4. Avoid duplicate redirects or conflicting sessions

Before launching fallback OAuth, the code will only proceed if the native flow did not create a valid session.

The web OAuth fallback will remain:

```ts
lovable.auth.signInWithOAuth("google", {
  redirect_uri: window.location.origin,
});
```

I will not modify the generated auth client files.

### 5. Optional user-facing fallback button if automatic launch is blocked

If the web OAuth call returns an error instead of redirecting, the app will show a clear toast message. If needed, I will add a secondary “Use web Google sign-in” button/message for Android users, but the first implementation will attempt the fallback automatically after native failure.

## What will not change

- Existing web/PWA Google OAuth behavior.
- Existing email/password login and signup.
- Existing referral logic.
- Existing login security modal behavior.
- Native Google sign-in as the preferred Android path.

## Files to update

- `src/pages/Auth.tsx`
  - Add reusable web Google sign-in helper.
  - Update the Android Google button handler to try native first, then fallback to web OAuth on non-cancel failures.

Potentially update:
- `README.md`
  - Add a short note explaining that Android uses native sign-in first and falls back to web OAuth if native token exchange fails.

## Verification

After implementation, I will verify:

- TypeScript/build succeeds.
- Browser/PWA still uses the existing web Google OAuth path directly.
- Android code path still tries native Google sign-in first.
- Android fallback path calls the same existing web OAuth flow after native failure.
- Cancelled native sign-in does not unexpectedly launch fallback.
