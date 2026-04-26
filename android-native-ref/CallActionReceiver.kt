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
 * Decline: hits the dm-call-token edge function directly from the receiver
 * so the call row flips to "declined" even when the app is killed. This
 * triggers the realtime listener on IncomingCallBanner.tsx to dismiss the
 * banner + stop any in-app ringing audio across all of the user's devices.
 *
 * The Supabase access token is cached into a tiny SharedPreferences entry by
 * the JS side (src/lib/nativeAuthCache.ts) on every auth state change, so
 * this background path can authenticate without the webview being alive.
 */
class CallActionReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_ACCEPT = "app.lovable.opollmarket.CALL_ACCEPT"
        const val ACTION_DECLINE = "app.lovable.opollmarket.CALL_DECLINE"
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
        cachedAppContext = context.applicationContext
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
                // Fire the edge call on a worker thread — receivers have a
                // ~10s budget; HTTP must not run on the main thread.
                thread(start = true, name = "decline-call-$callId") {
                    postDeclineToEdgeFunction(callId)
                }
            }
        }
    }

    private fun postDeclineToEdgeFunction(callId: String) {
        val accessToken = SupabaseTokenCache.read(applicationContextOrNull())
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

    // BroadcastReceiver doesn't expose applicationContext directly; cache it
    // on the instance during onReceive. Kept here so postDeclineToEdgeFunction
    // is testable in isolation.
    private var cachedAppContext: Context? = null
    private fun applicationContextOrNull(): Context? = cachedAppContext
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
