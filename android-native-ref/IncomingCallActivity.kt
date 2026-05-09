// android/app/src/main/java/com/opollmarket/app/IncomingCallActivity.kt
package com.opollmarket.app

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
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
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.FrameLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import kotlin.math.max
import kotlin.math.min

/**
 * Lockscreen incoming-call screen — sleek redesign with a swipe-to-answer
 * rail, pulsing avatar, and a small Decline pill.
 *
 * Opened by the full-screen intent posted from CallMessagingService. Plays
 * ringtone + vibrates until the user accepts (drag thumb past ~60% of the
 * rail) or declines (tap the Decline pill / system cancels the notification).
 *
 * Accept must launch MainActivity DIRECTLY from this foreground Activity —
 * routing through a BroadcastReceiver loses the foreground activation token
 * and Android 10+ silently drops the launch on many OEMs (the "nothing
 * happens until the user opens the app manually" bug). Decline still goes
 * via the broadcast receiver because that path uses goAsync() to keep the
 * decline HTTP POST alive after this Activity finishes.
 */
class IncomingCallActivity : AppCompatActivity() {

    private var ringtone: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var pulseAnimator: AnimatorSet? = null

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

        // Draw edge-to-edge so the gradient fills the whole screen, then
        // pad the content for status bar / nav bar / display cutout. Keeps
        // the layout safe on punch-hole displays, foldables, gesture-nav
        // and 3-button-nav devices in both portrait and landscape.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }

        setContentView(R.layout.activity_incoming_call)

        // Apply system-bar + cutout insets as padding on the root content.
        // Both portrait and landscape layouts share the id `call_root`.
        val root = findViewById<View>(R.id.call_root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars()
                    or WindowInsetsCompat.Type.displayCutout()
            )
            v.updatePadding(
                left = bars.left,
                top = bars.top,
                right = bars.right,
                bottom = bars.bottom,
            )
            insets
        }

        val callId = intent.getStringExtra("call_id").orEmpty()
        val callerName = intent.getStringExtra("caller_name") ?: "Someone"
        val conversationId = intent.getStringExtra("conversation_id").orEmpty()

        findViewById<TextView>(R.id.caller_name).text = callerName
        findViewById<TextView>(R.id.caller_sub).text = "Incoming voice call"
        findViewById<TextView>(R.id.avatar_initial).text =
            callerName.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "•"

        setupSwipeToAnswer(callId, conversationId)

        findViewById<TextView>(R.id.btn_decline).setOnClickListener {
            stopRinging()
            cancelCallNotification()
            // Delegate to the receiver. The receiver uses goAsync() to keep
            // the decline HTTP POST alive after this Activity finishes.
            sendBroadcast(Intent(this, CallActionReceiver::class.java).apply {
                action = CallActionReceiver.ACTION_DECLINE
                putExtra("call_id", callId)
                putExtra("conversation_id", conversationId)
            })
            finish()
        }

        startPulseAnimation()
        startRinging()
    }

    /**
     * Drag the thumb across the rail. Past 60% of travel, treat as accept.
     * Below threshold on release, animate the thumb back home.
     */
    private fun setupSwipeToAnswer(callId: String, conversationId: String) {
        val rail = findViewById<FrameLayout>(R.id.swipe_rail)
        val thumb = findViewById<FrameLayout>(R.id.swipe_thumb)
        val hint = findViewById<TextView>(R.id.swipe_hint)

        var startX = 0f
        var dragging = false
        var maxTravel = 0f
        var accepted = false
        var crossedThreshold = false

        thumb.setOnTouchListener { v, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    dragging = true
                    crossedThreshold = false
                    startX = event.rawX - v.translationX
                    maxTravel = (rail.width - thumb.width - dpToPx(12)).toFloat()
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    if (!dragging) return@setOnTouchListener false
                    val dx = (event.rawX - startX).coerceIn(0f, maxTravel)
                    v.translationX = dx
                    // Fade hint as the thumb advances
                    hint.alpha = max(0f, 1f - (dx / maxTravel) * 1.6f)
                    val progress = if (maxTravel <= 0f) 0f else dx / maxTravel
                    // Crisp tick the moment the user crosses the accept threshold,
                    // and a softer one when they fall back below it.
                    if (progress >= 0.6f && !crossedThreshold) {
                        crossedThreshold = true
                        hapticThresholdCrossed()
                    } else if (progress < 0.6f && crossedThreshold) {
                        crossedThreshold = false
                        hapticTick()
                    }
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (!dragging) return@setOnTouchListener false
                    dragging = false
                    val progress = if (maxTravel <= 0f) 0f else v.translationX / maxTravel
                    if (progress >= 0.6f && !accepted) {
                        accepted = true
                        // Snap to the end then accept.
                        v.animate()
                            .translationX(maxTravel)
                            .setDuration(120)
                            .withEndAction { acceptCall(callId, conversationId) }
                            .start()
                    } else {
                        // Spring back home — pair the visual snap-back with a
                        // light haptic so it feels physical.
                        hapticSnapBack()
                        v.animate()
                            .translationX(0f)
                            .setDuration(220)
                            .setInterpolator(AccelerateDecelerateInterpolator())
                            .start()
                        hint.animate().alpha(1f).setDuration(220).start()
                    }
                    true
                }
                else -> false
            }
        }
    }

    private fun acceptCall(callId: String, conversationId: String) {
        stopRinging()
        cancelCallNotification()
        val deepLink = Uri.parse(
            "opoll://call/accept?call_id=$callId&conversation_id=$conversationId"
        )
        val launch = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = deepLink
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("call_id", callId)
            putExtra("conversation_id", conversationId)
            putExtra("auto_accept", true)
        }
        startActivity(launch)
        finish()
    }

    /** Two soft rings expanding + fading on a loop. */
    private fun startPulseAnimation() {
        val outer = findViewById<View>(R.id.pulse_ring_outer)
        val inner = findViewById<View>(R.id.pulse_ring_inner)

        fun ringAnim(v: View, delay: Long): AnimatorSet {
            val sx = ObjectAnimator.ofFloat(v, View.SCALE_X, 0.85f, 1.25f)
            val sy = ObjectAnimator.ofFloat(v, View.SCALE_Y, 0.85f, 1.25f)
            val a = ObjectAnimator.ofFloat(v, View.ALPHA, 0.55f, 0f)
            return AnimatorSet().apply {
                playTogether(sx, sy, a)
                duration = 1800
                startDelay = delay
                interpolator = AccelerateDecelerateInterpolator()
            }
        }

        val set = AnimatorSet()
        val outerAnim = ringAnim(outer, 0)
        val innerAnim = ringAnim(inner, 600)
        set.playTogether(outerAnim, innerAnim)
        // Loop manually because AnimatorSet has no infinite repeat.
        set.addListener(object : android.animation.AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: android.animation.Animator) {
                if (!isFinishing && !isDestroyed) set.start()
            }
        })
        set.start()
        pulseAnimator = set
    }

    private fun stopPulseAnimation() {
        pulseAnimator?.cancel()
        pulseAnimator = null
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

    private fun dpToPx(dp: Int): Int =
        (dp * resources.displayMetrics.density).toInt()

    /**
     * Haptics use HapticFeedbackConstants on the root view rather than the
     * Vibrator service, so they don't clobber the looping ringtone vibration
     * waveform that's already running on the same Vibrator.
     */
    private fun hapticThresholdCrossed() {
        val root = findViewById<View>(R.id.call_root) ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            root.performHapticFeedback(android.view.HapticFeedbackConstants.CONFIRM)
        } else {
            root.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS)
        }
    }

    private fun hapticSnapBack() {
        val root = findViewById<View>(R.id.call_root) ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            root.performHapticFeedback(android.view.HapticFeedbackConstants.REJECT)
        } else {
            root.performHapticFeedback(android.view.HapticFeedbackConstants.VIRTUAL_KEY)
        }
    }

    private fun hapticTick() {
        val root = findViewById<View>(R.id.call_root) ?: return
        root.performHapticFeedback(android.view.HapticFeedbackConstants.CLOCK_TICK)
    }

    override fun onDestroy() {
        stopRinging()
        stopPulseAnimation()
        super.onDestroy()
    }
}
