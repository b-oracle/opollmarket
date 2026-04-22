
## Push Token Plumbing — Already Wired End-to-End

You don't need to add anything to the backend. The full path you described is already built. Here is the complete flow with file pointers so you can verify each link.

---

### 1. Where the token is submitted (client → DB)

File: `src/hooks/useNativePush.ts`

On native Android/iOS:
- Asks for notification permission
- Calls `PushNotifications.register()` (Capacitor plugin)
- Listens for the `"registration"` event — the FCM/APNs token arrives here
- Upserts directly into `user_fcm_tokens` via the Supabase JS client:

```ts
await supabase.from("user_fcm_tokens").upsert({
  user_id: user.id,
  token: tok.value,
  platform: Capacitor.getPlatform(),  // "android" or "ios"
}, { onConflict: "user_id,token" });
```

This hook is mounted globally — once the user signs in on the native build, the token is stored automatically. No edge function or REST endpoint is needed because the table has RLS letting the authenticated user write their own row.

---

### 2. Where the token lives (database)

Table: `public.user_fcm_tokens` — already exists.

```
id          uuid pk
user_id     uuid fk → auth.users
token       text
platform    text  ('android' | 'ios')
created_at  timestamptz
updated_at  timestamptz
UNIQUE (user_id, token)
RLS: user can manage their own rows
```

You can confirm a device registered correctly by querying:
```sql
select user_id, platform, created_at from user_fcm_tokens where user_id = '<your-uuid>';
```

---

### 3. Where the call triggers the push (backend)

File: `supabase/functions/dm-call-token/index.ts` (lines 212–245)

When `action === "start"` is called by the caller's client:
1. Creates the LiveKit room
2. Inserts a `dm_calls` row with status `ringing`
3. Inserts a notification row
4. **Fires two pushes in parallel:**
   - `send-push` → web push (PWA / browser)
   - `send-fcm-push` → native FCM (Android/iOS app)

Payload sent to `send-fcm-push`:
```json
{
  "user_id": calleeId,
  "title": "Incoming Call 📞",
  "body": "<caller name> is calling you",
  "url": "/messages/<conversation_id>",
  "is_call": true,
  "call_id": "<uuid>",
  "data": { "caller_id", "caller_name", "caller_avatar", "conversation_id" }
}
```

---

### 4. Where the FCM v1 request is built (backend)

File: `supabase/functions/send-fcm-push/index.ts`

It already does exactly what you described:
1. Loads `FCM_SERVICE_ACCOUNT_JSON` + `FCM_PROJECT_ID` from secrets
2. Mints an OAuth2 access token via JWT (RS256, Google's auth server)
3. Looks up tokens in `user_fcm_tokens` for the target `user_id`
4. For each token, POSTs to `https://fcm.googleapis.com/v1/projects/<id>/messages:send`
5. **For calls (`is_call: true`)** — sends a **data-only** message with `priority: HIGH`, no `notification` block, so Android's `CallMessagingService` runs in the background and triggers the full-screen `IncomingCallActivity` (lockscreen ring)
6. **For normal pushes** — sends `notification + data` so the system tray displays it
7. Cleans up dead tokens on `UNREGISTERED` / `INVALID_ARGUMENT`

---

### Summary table

| Concern | Status | Location |
|---|---|---|
| Token submission endpoint | ✅ Direct Supabase upsert (no endpoint needed) | `src/hooks/useNativePush.ts` |
| Token storage | ✅ `user_fcm_tokens` table with RLS | DB |
| Call → push trigger | ✅ Fires inside `start` action | `supabase/functions/dm-call-token/index.ts` lines 212–245 |
| FCM v1 send (OAuth2 + payload) | ✅ Data-only for calls, notification+data otherwise | `supabase/functions/send-fcm-push/index.ts` |
| Diagnostics tool | ✅ Test OAuth2 + dry-run send for any token | Admin Settings → FCM Push Diagnostics |

---

### What you actually still need to do

1. Eject Android (`npx cap add android`) on your local machine.
2. Drop in `google-services.json` from Firebase.
3. Copy `android-native-ref/*.kt` + manifest into the Android project.
4. Build and run on a device.

The moment a signed-in user opens the native app, `useNativePush` will fire and a row will appear in `user_fcm_tokens` for them. From that point on, every incoming call already routes through `dm-call-token → send-fcm-push → FCM v1` and rings the device.

If a token doesn't appear after sign-in, the Admin Settings → FCM Push Diagnostics card will tell you exactly why (missing service account, OAuth2 failure, or per-token FCM error).
