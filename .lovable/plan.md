
## Goal

Add native Google sign-in for the Capacitor Android app while keeping the existing web Google OAuth button and flow unchanged.

Important clarification: the Android OAuth Client ID is not normally pasted into the React web login button. For native Android Google sign-in, the Android client stays in Google Cloud Console and is tied to your app package name + SHA-1 fingerprint. The app code usually uses the Web application Client ID as the native plugin’s `webClientId` / `serverClientId`, then exchanges the returned Google ID token for an app session.

## What I will implement

1. Add a native-only Google sign-in path
   - Install and use a Capacitor Google/social login plugin.
   - Detect when the app is running inside native Capacitor on Android.
   - Show/use the native Google sign-in flow only in that environment.
   - Leave the current `lovable.auth.signInWithOAuth("google", ...)` web flow untouched for browser/PWA/custom-domain usage.

2. Add a native auth helper
   - Create a helper such as `src/lib/nativeGoogleAuth.ts`.
   - Initialize the native plugin with the Web Client ID you already have.
   - Generate and hash a nonce for secure Google ID-token exchange.
   - Call native Google login.
   - Exchange the returned Google `idToken` with the existing backend auth session using `supabase.auth.signInWithIdToken({ provider: "google", token, nonce })`.
   - Add retry/error handling for cached-token or nonce mismatch issues.

3. Update the Auth page UI
   - Keep the current web Google button exactly as-is for web.
   - On Capacitor Android, route the Google button to the native sign-in helper instead.
   - Show clear errors if native sign-in is unavailable, cancelled, or misconfigured.
   - Preserve the existing email/password, signup, referral, and login-security behavior.

4. Add Capacitor configuration
   - Add the native plugin dependency.
   - Add any required plugin config in `capacitor.config.ts` if the chosen plugin supports config there.
   - Store the public Web Client ID in app code/config, not as a secret.
   - Do not modify generated auth integration files.

5. Document the required Android-native setup
   - Because this repo currently does not include an `android/` directory, I’ll add instructions for the local Android project steps after you run/pull/sync.
   - Required local Android steps will include:
     - Ensure Google Cloud Android OAuth Client uses package:
       ```text
       app.lovable.fbc135e2c42c4d3fbb3ee7385ced809f
       ```
     - Add the correct debug/release/Play Store SHA-1 fingerprints.
     - Run:
       ```bash
       npm install
       npm run build
       npx cap sync android
       ```
     - If the plugin requires a `MainActivity` patch, add the exact code block/path to patch locally in Android Studio.

## What will not change

- The existing web Google OAuth flow will not be disabled or replaced.
- The generated `src/integrations/lovable/index.ts` file will not be edited.
- Email/password login and signup will not be changed.
- The app’s existing auth session provider will continue to listen for backend auth session changes as it does now.

## Technical approach

```text
Web / PWA / browser:
Auth Google button
  -> lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })
  -> existing working web OAuth flow

Capacitor Android:
Auth Google button
  -> native Google plugin
  -> Google account picker
  -> returns Google ID token
  -> supabase.auth.signInWithIdToken({ provider: "google", token, nonce })
  -> existing app session is established
```

## Configuration I will need during implementation

You said you already have the Web application Client ID. During implementation, I’ll need that public Client ID value to place into the native Google sign-in config.

The Android OAuth Client ID you created should remain configured in Google Cloud Console with the package name and SHA-1 fingerprints. It is not the value typically passed as the plugin’s `webClientId` for backend session exchange.
