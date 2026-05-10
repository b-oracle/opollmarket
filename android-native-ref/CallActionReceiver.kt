// android/app/src/main/java/com/opollmarket/app/CallActionReceiver.kt
package com.opollmarket.app

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Broadcast receiver for the **Decline** action on the incoming-call
 * notification AND the lockscreen IncomingCallActivity Decline button.
 *
 * ⚠️ ACCEPT IS HANDLED ELSEWHERE — never route Accept through this receiver.
 * Android 10+ Background-Activity-Launch rules silently drop activity starts
 * from broadcast receivers on Samsung / Xiaomi / many OEMs, which makes the
 * Accept button look broken. The notification's Accept action and the
 * lockscreen Activity's Accept button BOTH use `PendingIntent.getActivity` /
 * direct `startActivity` to MainActivity so the foreground activation token
 * is preserved. See:
 *   - CallMessagingService.kt → acceptPending = PendingIntent.getActivity(...)
 *   - IncomingCallActivity.kt → onAccept() → startActivity(MainActivity ...)
 *
 * Decline is safe in a receiver because it does NOT need to bring the app to
 * the foreground. We use goAsync() to keep this process alive long enough to
 * POST the decline to the edge function, then the OS reclaims it.
 *   • opoll://call/decline → POST dm-call-token { action: "decline" }
 */
class CallActionReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_DECLINE = "com.opollmarket.app.CALL_DECLINE"
        private const val CALL_NOTIFICATION_ID = 1001
        private const val TAG = "CallActionReceiver"

        // Mirror the values shipped to the webview — safe to embed (these
        // are the same publishable anon key already in the JS bundle).
        private const val SUPABASE_URL =
            "https://dqtjuhqndncanfwgjwva.supabase.co"
        private const val SUPABASE_ANON_KEY =
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
                "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxdGp1aHFuZG5jYW5md2dqd3ZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1Mzg3NDUsImV4cCI6MjA4ODExNDc0NX0." +
                "0qcvJUjAGlKATXxBPSvjVD_Q9LUROkrDD-mk9f25Ygo"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val appCtx = context.applicationContext
        val callId = intent.getStringExtra("call_id").orEmpty()
        val conversationId = intent.getStringExtra("conversation_id").orEmpty()
        Log.i(TAG, "onReceive action=${intent.action} callId=$callId conv=$conversationId")

        // Always cancel the visible notification first so feedback is instant.
        runCatching {
            (appCtx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .cancel(CALL_NOTIFICATION_ID)
        }.onFailure { Log.w(TAG, "cancel notification failed", it) }

        if (intent.action != ACTION_DECLINE) {
            Log.w(TAG, "ignoring unsupported action: ${intent.action}")
            return
        }

        // 1) Bring the app to the foreground with the decline deep link so the
        //    webview can show feedback and the realtime path can still run.
        launchAppWithDeepLink(appCtx, "decline", callId, conversationId)

        // 2) Best-effort background HTTP decline. We wrap it in goAsync() so
        //    this process is kept alive until the POST completes — the
        //    Activity that broadcast this will have already called finish()
        //    and would otherwise be killed.
        if (callId.isNotEmpty()) {
            val pending = goAsync()
            thread(start = true, name = "decline-call-$callId") {
                try {
                    postDeclineToEdgeFunction(appCtx, callId)
                } finally {
                    try { pending.finish() } catch (_: Throwable) { }
                }
            }
        }
    }

    private fun launchAppWithDeepLink(
        ctx: Context,
        action: String,
        callId: String,
        conversationId: String,
    ) {
        try {
            val deepLink = Uri.parse(
                "opoll://call/$action?call_id=$callId&conversation_id=$conversationId"
            )
            val launch = Intent(ctx, MainActivity::class.java).apply {
                // FLAG_ACTIVITY_NEW_TASK is required when starting an activity
                // from a non-Activity context (broadcast receiver).
                // CLEAR_TOP + SINGLE_TOP routes to the existing instance and
                // delivers the new intent via onNewIntent — which is what
                // the Capacitor App plugin listens to for appUrlOpen events.
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
                this.action = Intent.ACTION_VIEW
                data = deepLink
                putExtra("auto_accept", action == "accept")
                putExtra("call_id", callId)
                putExtra("conversation_id", conversationId)
            }
            ctx.startActivity(launch)
            Log.i(TAG, "launched MainActivity with $deepLink")
        } catch (t: Throwable) {
            Log.e(TAG, "failed to launch MainActivity for $action", t)
            // Fallback: launch the app's default intent (no deep link).
            try {
                val fallback = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                }
                if (fallback != null) ctx.startActivity(fallback)
            } catch (t2: Throwable) {
                Log.e(TAG, "fallback launch also failed", t2)
            }
        }
    }

    private fun postDeclineToEdgeFunction(ctx: Context, callId: String) {
        val accessToken = SupabaseTokenCache.read(ctx)
        if (accessToken.isNullOrBlank()) {
            Log.w(TAG, "no cached access token — skipping HTTP decline fallback")
            return
        }
        try {
            val url = URL("$SUPABASE_URL/functions/v1/dm-call-token")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 5_000
                readTimeout = 8_000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Authorization", "Bearer $accessToken")
                setRequestProperty("apikey", SUPABASE_ANON_KEY)
            }
            val payload = JSONObject()
                .put("action", "decline")
                .put("call_id", callId)
                .toString()
            conn.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            Log.i(TAG, "decline HTTP for $callId returned $code")
            conn.disconnect()
        } catch (e: Throwable) {
            // Best-effort — the realtime layer + 90s banner timeout will
            // still mark the call missed if this falls through.
            Log.w(TAG, "decline HTTP failed", e)
        }
    }
}

/**
 * Reads the Supabase access token from Capacitor Preferences storage.
 * The JS layer (src/lib/nativeAuthCache.ts) writes it on every auth state
 * change via @capacitor/preferences, which on Android is backed by the
 * "CapacitorStorage" SharedPreferences file with keys prefixed "_cap_".
 */
object SupabaseTokenCache {
    private const val PREFS = "CapacitorStorage"
    private const val KEY_TOKEN = "_cap_supabase_access_token"

    fun read(context: Context?): String? {
        val ctx = context ?: return null
        val prefs: SharedPreferences =
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val token = prefs.getString(KEY_TOKEN, null) ?: return null
        return token.takeIf { it.isNotBlank() }
    }
}
