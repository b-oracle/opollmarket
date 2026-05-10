# Persistent In-Call Screen (WhatsApp-style)

## What's happening today

When you accept a call, three things go right and one goes wrong:

1. The native `IncomingCallActivity` finishes (correct — it only owns the *ringing* screen).
2. The Android foreground service keeps the mic alive in the background (correct — that's why audio continues).
3. Capacitor brings `MainActivity` (the WebView) to the front and deep-links to `/messages/<id>?auto_accept=1&call_id=…`.
4. **Nothing visible mounts.** The WebView opens the chat thread, but the in-app `VoiceCallOverlay` doesn't appear because it depends on a realtime `dm_calls` INSERT that has often already been consumed (or arrives milliseconds after the deep-link runs and is ignored). The user sees the message thread or a black screen while audio plays — exactly the "screen goes off but call continues" symptom.

There's also a secondary issue: while the call is connected, the device's screen is allowed to dim and lock, so even when the overlay does mount the screen turns off after ~30s like any normal page.

The screenshot you sent is actually from a *different* (third-party) app's call UI — a reference for what we should match.

## Fix overview

Keep the call UI in the WebView (so it works for PWA, iOS, and Android with one codebase), but make it bulletproof in three ways:

1. **Mount the in-call screen immediately on accept** — don't wait for realtime to repopulate `incomingCall`. Pass enough info through the deep link / SW message to call the answer edge function directly.
2. **Keep the screen on for the duration of the call** — request a wake-lock on web, and on Android Capacitor add `FLAG_KEEP_SCREEN_ON` while a call is active.
3. **Make the in-call overlay full-screen, persistent, and route-independent** (it already lives at the App root, but we'll harden it so it can't be dismissed by navigation, back-press, or minimize-to-PiP unless the user explicitly hangs up).

## Detailed changes

### 1. Reliable mount on accept (`src/components/chat/IncomingCallBanner.tsx`)

- Add a new "auto-accept by URL" path that, when `?auto_accept=1&call_id=X` is present and there is no `incomingCall` yet, fetches the `dm_calls` row directly via `supabase.from('dm_calls').select(...).eq('id', X)` and synthesises the `incomingCall` state, then runs `handleAnswer()`. This removes the realtime dependency.
- On `dm-call-action` postMessage with `intent: 'answer'`, do the same: if no `incomingCall` is present, fetch the row and answer directly.
- Persist `activeCall` to `sessionStorage` and on mount **do** restore it (currently we throw it away). Token TTL is short, but if the user navigates away and back within ~5 min the call should stay visible. Validate the token by attempting a LiveKit reconnect; if it fails, gracefully end.

### 2. Keep-screen-on while in a call

- New helper `src/lib/callKeepAwake.ts`:
  - Web: `navigator.wakeLock.request('screen')`, release on call end.
  - Capacitor Android: call a tiny new method on `AudioRouterPlugin` (rename to `CallSessionPlugin` or add to existing) that sets `getWindow().addFlags(FLAG_KEEP_SCREEN_ON)` on `startCall` and clears it on `endCall`.
- Wire it into `VoiceCallOverlay` mount/unmount.

### 3. Persistent full-screen overlay

- `VoiceCallOverlay` is already mounted at the app root via `IncomingCallBanner` (`src/App.tsx:524`). Harden it:
  - Render at z-index above everything (`z-[100]` style class), `position: fixed; inset: 0`.
  - Intercept Android hardware back-press (Capacitor `App.addListener('backButton')`) while a call is active — minimise to a floating pill instead of leaving the call.
  - Block the user from accidentally ending the call by route navigation: if the user navigates while `activeCall` is set, keep the overlay mounted (it already is) but switch to the existing `minimized` state so they can return.
  - Add a "Return to call" pill (the existing minimised state) with caller name + duration when minimised.

### 4. Native foreground service notification → tap to return

- The foreground service notification we already start (`src/lib/callForegroundService.ts`) needs a `contentIntent` that re-launches `MainActivity` with `?return_to_call=1`. In the WebView we listen for that param and force the overlay to maximise. This gives the WhatsApp-style "tap the green bar to return to call" behaviour when the user swipes the app away.

### 5. iOS parity

- iOS already has CallKit owning the in-call UI natively (`ios-native-ref/CallProviderDelegate.swift`). Keep that as-is; the WebView overlay only needs to render when the user taps "back to app" from CallKit. No changes required for this fix on iOS.

## Files touched

```text
edit   src/components/chat/IncomingCallBanner.tsx     # direct-answer path, restore activeCall
edit   src/components/chat/VoiceCallOverlay.tsx       # wake-lock + back-press handler + z-index
new    src/lib/callKeepAwake.ts                       # wakeLock API + bridge to native
edit   src/lib/callForegroundService.ts               # add contentIntent return-to-call URL
edit   android-native-ref/AudioRouterPlugin.kt        # add keepScreenOn / clearScreenOn methods
edit   android-native-ref/AndroidManifest.additions.xml  # WAKE_LOCK already present, no change
edit   public/push-sw.js                              # include caller_id in postMessage so direct-answer has all data
```

No DB or edge-function changes.

## What you'll see after the fix

1. Tap Accept on the lockscreen → IncomingCallActivity closes → WebView slides up the **full-screen call overlay** (avatar, name, timer, mute / speaker / video / hangup) within ~200 ms.
2. Screen stays on for the duration of the call (no auto-lock).
3. If you press Home or Back, the overlay shrinks to a floating pill (existing minimised state) and a green "Call in progress" notification appears in the shade — tapping it returns you to the full overlay.
4. The call only ends when you tap the red hangup button or the other side hangs up.
