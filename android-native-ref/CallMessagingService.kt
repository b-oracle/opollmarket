// android/app/src/main/java/<your.package>/CallMessagingService.kt
package app.lovable.opollmarket

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
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // TODO: POST this token to /user_fcm_tokens via your app's auth session.
        // Left to your existing Capacitor plugin bridge.
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val data = message.data
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

        val acceptIntent = Intent(this, CallActionReceiver::class.java).apply {
            action = CallActionReceiver.ACTION_ACCEPT
            putExtra("call_id", callId)
            putExtra("conversation_id", conversationId)
        }
        val declineIntent = Intent(this, CallActionReceiver::class.java).apply {
            action = CallActionReceiver.ACTION_DECLINE
            putExtra("call_id", callId)
        }
        val acceptPending = PendingIntent.getBroadcast(
            this, (callId + "a").hashCode(), acceptIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val declinePending = PendingIntent.getBroadcast(
            this, (callId + "d").hashCode(), declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CALL_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(callerName)
            .setContentText("Incoming call")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(fullScreenPending, true)
            .setContentIntent(fullScreenPending)
            .addAction(R.mipmap.ic_launcher, "Decline", declinePending)
            .addAction(R.mipmap.ic_launcher, "Accept", acceptPending)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(CALL_NOTIFICATION_ID, notification)
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
