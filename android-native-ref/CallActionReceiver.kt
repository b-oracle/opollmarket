// android/app/src/main/java/<your.package>/CallActionReceiver.kt
package app.lovable.opollmarket

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Broadcast receiver for the Accept/Decline actions on the incoming-call
 * notification. Accept opens MainActivity with the deep link; Decline
 * cancels the notification and (optionally) pokes your backend to mark the
 * call rejected.
 */
class CallActionReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_ACCEPT = "app.lovable.opollmarket.CALL_ACCEPT"
        const val ACTION_DECLINE = "app.lovable.opollmarket.CALL_DECLINE"
        private const val CALL_NOTIFICATION_ID = 1001
    }

    override fun onReceive(context: Context, intent: Intent) {
        val callId = intent.getStringExtra("call_id").orEmpty()
        val conversationId = intent.getStringExtra("conversation_id").orEmpty()

        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .cancel(CALL_NOTIFICATION_ID)

        when (intent.action) {
            ACTION_ACCEPT -> {
                val deepLink = Uri.parse("opoll://call/accept?call_id=$callId&conversation_id=$conversationId")
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
                // Optional: fire an HTTP request to your cancel endpoint here,
                // using WorkManager to survive background constraints.
            }
        }
    }
}
