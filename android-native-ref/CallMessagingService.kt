// android/app/src/main/java/com/opollmarket/app/CallMessagingService.kt
package com.opollmarket.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Handles data-only FCM messages. Incoming-call payloads trigger a full-screen
 * intent that opens IncomingCallActivity over the lockscreen — WhatsApp-style.
 *
 * Expected payload (data-only):
 *   type=incoming_call
 *   call_id, caller_id, caller_name, caller_avatar, conversation_id, title, body
 */
class CallMessagingService : FirebaseMessagingService() {

    companion object {
        const val CALL_CHANNEL_ID = "incoming_calls"
        const val DEFAULT_CHANNEL_ID = "default"
        private const val CALL_NOTIFICATION_ID = 1001
        private const val TAG = "CallMessagingService"
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // TODO: POST this token to /user_fcm_tokens via your app's auth session.
        // Left to your existing Capacitor plugin bridge.
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val data = message.data
        android.util.Log.i(TAG, "onMessageReceived data=$data")
        if (data["type"] == "incoming_call") {
            showIncomingCall(data)
        } else {
            showStandardNotification(data, message)
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    private fun showIncomingCall(data: Map<String, String>) {
        ensureCallChannel()

        val callId = data["call_id"].orEmpty()
        val callerName = data["caller_name"] ?: data["title"] ?: "Someone"
        val callerAvatar = data["caller_avatar"].orEmpty()
        val conversationId = data["conversation_id"].orEmpty()

        // Full-screen intent points at IncomingCallActivity (lockscreen UI).
        // On Android 14+ devices that didn't grant USE_FULL_SCREEN_INTENT,
        // the system gracefully falls back to a heads-up notification with
        // the Accept/Decline action buttons below — those still work.
        val fullScreenIntent = Intent(this, IncomingCallActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("call_id", callId)
            putExtra("caller_name", callerName)
            putExtra("caller_avatar", callerAvatar)
            putExtra("conversation_id", conversationId)
        }
        val fullScreenPending = PendingIntent.getActivity(
            this, callId.hashCode(), fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Tapping the body of the heads-up notification (NOT a button) should
        // also open the in-app accept flow — same target as the Accept button.
        // IMPORTANT: We launch MainActivity DIRECTLY via PendingIntent.getActivity
        // (not via a BroadcastReceiver) so the system's foreground-activation
        // token attached to the notification tap exempts the launch from
        // Android 10+ Background-Activity-Launch (BAL) restrictions. A broadcast
        // hop loses that token and the activity launch is silently dropped on
        // many OEMs (Samsung/Xiaomi/etc.) — which is why "nothing happens" until
        // the user opens the app manually. WhatsApp uses the same direct path.
        val acceptDeepLink = Uri.parse(
            "opoll://call/accept?call_id=$callId&conversation_id=$conversationId"
        )
        val acceptActivityIntent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = acceptDeepLink
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("call_id", callId)
            putExtra("conversation_id", conversationId)
            putExtra("auto_accept", true)
        }
        val acceptPending = PendingIntent.getActivity(
            this, (callId + "a").hashCode(), acceptActivityIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        // Body tap reuses the same direct-to-activity intent.
        val tapAcceptPending = acceptPending

        // Decline still goes through the broadcast receiver because it uses
        // goAsync() to keep the decline-HTTP POST alive after the notification
        // is cancelled, and it does NOT need to bring the app to the foreground.
        val declineIntent = Intent(this, CallActionReceiver::class.java).apply {
            action = CallActionReceiver.ACTION_DECLINE
            putExtra("call_id", callId)
            putExtra("conversation_id", conversationId)
        }
        val declinePending = PendingIntent.getBroadcast(
            this, (callId + "d").hashCode(), declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Build a Person for CallStyle. Avatar URL would need to be loaded
        // async; we use a name-only Person which is sufficient for the OS to
        // grant call-priority full-screen-intent treatment on Android 12+.
        val caller = Person.Builder()
            .setName(callerName)
            .setImportant(true)
            .build()

        // CallStyle.forIncomingCall is REQUIRED on Android 14 (API 34) and
        // strongly recommended on 12+: without it, Samsung One UI / Pixel both
        // silently demote the notification and the FullScreenIntent never
        // launches over the lockscreen — the channel just vibrates once and
        // disappears, which is exactly the symptom we were seeing.
        // Reference: https://developer.android.com/develop/ui/views/notifications/call-style
        val builder = NotificationCompat.Builder(this, CALL_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .setAutoCancel(true)
            .setFullScreenIntent(fullScreenPending, true)
            .setContentIntent(tapAcceptPending)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setStyle(
                NotificationCompat.CallStyle.forIncomingCall(
                    caller,
                    /* declineIntent = */ declinePending,
                    /* answerIntent  = */ acceptPending,
                ).setIsVideo(false)
            )

        val notification = builder.build()
        // CallStyle requires FLAG_INSISTENT to keep ringing — but the channel
        // already loops the ringtone, so we leave the default flags.

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(CALL_NOTIFICATION_ID, notification)
        android.util.Log.i(TAG, "posted incoming-call notification (CallStyle) id=$CALL_NOTIFICATION_ID call=$callId")
    }

    private fun showStandardNotification(data: Map<String, String>, message: RemoteMessage) {
        ensureDefaultChannel()
        val title = message.notification?.title ?: data["title"] ?: "Notification"
        val body = message.notification?.body ?: data["body"].orEmpty()

        val tapIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            putExtra("url", data["url"] ?: "/")
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val tapPending = PendingIntent.getActivity(
            this, 0, tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, DEFAULT_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(tapPending)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(body.hashCode(), notification)
    }

    // ────────────────────────────────────────────────────────────────────────
    private fun ensureCallChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CALL_CHANNEL_ID) != null) return

        val ringtoneUri: Uri = Uri.parse(
            "android.resource://$packageName/raw/ringtone"
        ).takeIf { runCatching { contentResolver.openInputStream(it)?.close() }.isSuccess }
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

        val channel = NotificationChannel(
            CALL_CHANNEL_ID,
            "Incoming Calls",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Full-screen incoming call notifications"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 1000, 500, 1000, 500, 1000)
            setBypassDnd(true)
            lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
            setSound(
                ringtoneUri,
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
        }
        nm.createNotificationChannel(channel)
    }

    private fun ensureDefaultChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(DEFAULT_CHANNEL_ID) != null) return
        nm.createNotificationChannel(
            NotificationChannel(DEFAULT_CHANNEL_ID, "General", NotificationManager.IMPORTANCE_DEFAULT)
        )
    }
}
