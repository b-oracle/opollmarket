// android/app/src/main/java/com/opollmarket/app/IncomingCallActivity.kt
package com.opollmarket.app

import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * Lockscreen incoming-call screen. Opened by the full-screen intent posted
 * from CallMessagingService. Plays ringtone + vibrates until the user accepts
 * or declines (or the system cancels the notification).
 */
class IncomingCallActivity : AppCompatActivity() {

    private var ringtone: MediaPlayer? = null
    private var vibrator: Vibrator? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Show over lockscreen & wake the display.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            (getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager)
                .requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    or WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
                    or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }

        setContentView(R.layout.activity_incoming_call)

        val callId = intent.getStringExtra("call_id").orEmpty()
        val callerName = intent.getStringExtra("caller_name") ?: "Someone"
        val conversationId = intent.getStringExtra("conversation_id").orEmpty()

        findViewById<TextView>(R.id.caller_name).text = callerName
        findViewById<TextView>(R.id.caller_sub).text = "Incoming voice call"

        findViewById<Button>(R.id.btn_accept).setOnClickListener {
            stopRinging()
            cancelCallNotification()

            // Open MainActivity with deep link so the webview auto-accepts.
            val deepLink = Uri.parse("opoll://call/accept?call_id=$callId&conversation_id=$conversationId")
            val launch = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                action = Intent.ACTION_VIEW
                data = deepLink
                putExtra("auto_accept", true)
            }
            startActivity(launch)
            finish()
        }

        findViewById<Button>(R.id.btn_decline).setOnClickListener {
            stopRinging()
            cancelCallNotification()
            // Optional: fire a broadcast that calls your backend to mark rejected.
            sendBroadcast(Intent(this, CallActionReceiver::class.java).apply {
                action = CallActionReceiver.ACTION_DECLINE
                putExtra("call_id", callId)
            })
            finish()
        }

        startRinging()
    }

    private fun startRinging() {
        try {
            ringtone = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                val uri = Uri.parse("android.resource://$packageName/raw/ringtone")
                setDataSource(this@IncomingCallActivity, uri)
                isLooping = true
                prepare()
                start()
            }
        } catch (_: Throwable) { /* ringtone optional */ }

        vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        val pattern = longArrayOf(0, 1000, 500, 1000, 500, 1000)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
        } else {
            @Suppress("DEPRECATION") vibrator?.vibrate(pattern, 0)
        }
    }

    private fun stopRinging() {
        ringtone?.runCatching { stop(); release() }
        ringtone = null
        vibrator?.cancel()
    }

    private fun cancelCallNotification() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(1001) // same id as CallMessagingService.CALL_NOTIFICATION_ID
    }

    override fun onDestroy() {
        stopRinging()
        super.onDestroy()
    }
}
