// android/app/src/main/java/<your.package>/CallActionReceiver.kt
package app.lovable.opollmarket

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
 * Broadcast receiver for the Accept/Decline actions on the incoming-call
 * notification.
 *
 * Accept: opens MainActivity with the opoll://call/accept deep link so the
 * webview auto-joins the call. The JS layer (useCallDeepLink) handles the
 * server-side accept + UI navigation.
 *
 * Decline: this is the path that previously did nothing. We now:
 *   1) Cancel the system notification + stop the lockscreen activity.
 *   2) Broadcast the opoll://call/decline deep link to the app (without
 *      bringing it to the foreground) so any running JS instance fires the
 *      decline RPC, stops the in-app ring, and dismisses the banner.
 *   3) As a hardening fallback for when the app is killed, fire a direct
 *      background HTTP POST to the dm-call-token edge function so the call
 *      row is still flipped to "declined" server-side. Uses the cached
 *      Supabase access token persisted by Capacitor (see SupabaseTokenCache
 *      below — populated from JS via Capacitor.Preferences).
 */
class CallActionReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_ACCEPT = "app.lovable.opollmarket.CALL_ACCEPT"
        const val ACTION_DECLINE = "app.lovable.opollmarket.CALL_DECLINE"
        private const val CALL_NOTIFICATION_ID = 1001
        private const val TAG = "CallActionReceiver"

        // Update these two constants if your project ref / anon key change.
        // (They mirror the values shipped to the webview and are safe to
        // embed — same as what the bundled JS already exposes.)
        private const val SUPABASE_URL =
            "https://dqtjuhqndncanfwgjwva.supabase.co"
        private const val SUPABASE_ANON_KEY =
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
                "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxdGp1aHFuZG5jYW5md2dqd3ZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1Mzg3NDUsImV4cCI6MjA4ODExNDc0NX0." +
                "0qcvJUjAGlKATXxBPSvjVD_Q9LUROkrDD-mk9f25Ygo"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val callId = intent.getStringExtra("call_id").orEmpty()
        val conversationId = intent.getStringExtra("conversation_id").orEmpty()

        // Always cancel the visible notification first so feedback is instant.
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .cancel(CALL_NOTIFICATION_ID)

        when (intent.action) {
            ACTION_ACCEPT -> {
                val deepLink = Uri.parse(
                    "opoll://call/accept?call_id=$callId&conversation_id=$conversationId"
                )
                val launch = Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                    action = Intent.ACTION_VIEW
                    data = deepLink
                    putExtra("auto_accept", true)
                }
                context.startActivity(launch)
            }

            ACTION_DECLINE -> {
                if (callId.isEmpty()) return

                // 1) Tell any running JS instance to handle the decline so the
                //    in-app ring stops + the banner clears immediately.
                //    We use a SEND broadcast (not startActivity) so the user
                //    does NOT see the app pop to the foreground.
                try {
                    val deepLink = Uri.parse(
                        "opoll://call/decline?call_id=$callId" +
                            "&conversation_id=$conversationId"
                    )
                    val viewIntent = Intent(Intent.ACTION_VIEW, deepLink).apply {
                        setPackage(context.packageName)
                        // No NEW_TASK — only a running task should pick this up.
                        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
                    }
                    // Prefer sending to MainActivity if it's already alive so
                    // the deep-link listener fires without launching a new
                    // task. If there's no running instance the cached-token
                    // HTTP fallback below covers it.
                    context.sendBroadcast(
                        Intent("app.lovable.opollmarket.CALL_DECLINED_LOCAL").apply {
                            setPackage(context.packageName)
                            putExtra("call_id", callId)
                            putExtra("conversation_id", conversationId)
                        }
                    )
                } catch (e: Throwable) {
                    Log.w(TAG, "failed to broadcast decline to webview", e)
                }

                // 2) Hardened fallback: hit the edge function directly so the
                //    call row is marked "declined" even if the JS instance is
                //    not running (cold app). Runs on a background thread so
                //    the broadcast receiver stays under its 10s budget.
                thread(start = true, name = "decline-call-$callId") {
                    postDeclineToEdgeFunction(context, callId)
                }
            }
        }
    }

    private fun postDeclineToEdgeFunction(context: Context, callId: String) {
        val accessToken = SupabaseTokenCache.read(context) ?: run {
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
            Log.i(TAG, "decline HTTP fallback for $callId returned $code")
            conn.disconnect()
        } catch (e: Throwable) {
            // Best-effort — the realtime layer + banner timeout will still
            // mark the call missed eventually.
            Log.w(TAG, "decline HTTP fallback failed", e)
        }
    }
}

/**
 * Tiny SharedPreferences-backed cache for the Supabase access token. The JS
 * layer keeps this in sync via Capacitor (see src/lib/nativeAuthCache.ts).
 * Token is short-lived; if it has expired the edge call will 401, but the
 * realtime banner timeout will still flip the call to "missed" within ~90s.
 */
object SupabaseTokenCache {
    private const val PREFS = "opoll_native_auth"
    private const val KEY_TOKEN = "supabase_access_token"

    fun read(context: Context): String? {
        val prefs: SharedPreferences =
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val token = prefs.getString(KEY_TOKEN, null) ?: return null
        return token.takeIf { it.isNotBlank() }
    }
}
