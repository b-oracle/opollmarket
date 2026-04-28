---
name: App Package ID
description: Canonical native app package/bundle id — always com.opollmarket.app, never the legacy app.lovable.<uuid> form.
type: constraint
---
The native app package/bundle identifier is **`com.opollmarket.app`** for every platform (Capacitor `appId`, Android `applicationId`, iOS bundle id, Despia config, Firebase/FCM project mappings, OneSignal, deep-link host configs, README, docs).

**Never** use or re-introduce the legacy `app.lovable.fbc135e2c42c4d3fbb3ee7385ced809f` form. If you see it anywhere (capacitor.config.ts, android-native-ref/, READMEs, edge function notification payloads, build configs), replace it with `com.opollmarket.app`.

**Why:** Switching package id requires republishing the native app under the new identity; mixing the two breaks push notifications, deep links, and store updates.
