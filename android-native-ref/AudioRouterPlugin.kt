// Copy to: android/app/src/main/java/<your-package>/AudioRouterPlugin.kt
//
// Tiny Capacitor plugin that routes the in-call audio between the earpiece
// and the loudspeaker via AudioManager. This is REQUIRED on Android because
// WebView WebRTC ignores HTMLMediaElement.setSinkId() and HTMLMediaElement.volume
// is not a routing primitive — without this plugin the call always plays
// through the loudspeaker (current bug).
//
// Register in MainActivity.onCreate():
//
//   override fun onCreate(savedInstanceState: Bundle?) {
//     registerPlugin(AudioRouterPlugin::class.java)
//     super.onCreate(savedInstanceState)
//   }
//
// JS usage (already wired in src/lib/audioRouter.ts):
//
//   import { AudioRouter } from '@/lib/audioRouter';
//   await AudioRouter.startCall();        // call this when the room connects
//   await AudioRouter.setSpeakerphone({ on: true | false });
//   await AudioRouter.endCall();          // call this when the room disconnects
//
package com.opollmarket.app

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "AudioRouter")
class AudioRouterPlugin : Plugin() {

    private val am: AudioManager
        get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    private var savedMode: Int = AudioManager.MODE_NORMAL
    private var savedSpeaker: Boolean = false
    private var inCall: Boolean = false

    @PluginMethod
    fun startCall(call: PluginCall) {
        try {
            savedMode = am.mode
            savedSpeaker = am.isSpeakerphoneOn
            // MODE_IN_COMMUNICATION routes WebRTC/VoIP audio to STREAM_VOICE_CALL,
            // which by default plays through the earpiece — exactly what we want
            // for a 1:1 voice call.
            am.mode = AudioManager.MODE_IN_COMMUNICATION
            setSpeakerInternal(false)
            inCall = true
            call.resolve()
        } catch (e: Exception) {
            call.reject("startCall failed: ${e.message}")
        }
    }

    @PluginMethod
    fun setSpeakerphone(call: PluginCall) {
        val on = call.getBoolean("on") ?: false
        try {
            // Make sure we're in communication mode — if startCall() wasn't called
            // (e.g. the call was already running before this build), force the
            // mode here so the toggle actually has an effect.
            if (am.mode != AudioManager.MODE_IN_COMMUNICATION) {
                am.mode = AudioManager.MODE_IN_COMMUNICATION
                inCall = true
            }
            setSpeakerInternal(on)
            val ret = JSObject()
            ret.put("on", on)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("setSpeakerphone failed: ${e.message}")
        }
    }

    @PluginMethod
    fun isSpeakerphoneOn(call: PluginCall) {
        val ret = JSObject()
        ret.put("on", am.isSpeakerphoneOn)
        call.resolve(ret)
    }

    @PluginMethod
    fun endCall(call: PluginCall) {
        try {
            if (inCall) {
                // Restore whatever the system was doing before we hijacked it.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    am.clearCommunicationDevice()
                } else {
                    @Suppress("DEPRECATION")
                    am.isSpeakerphoneOn = savedSpeaker
                }
                am.mode = savedMode
                inCall = false
            }
            call.resolve()
        } catch (e: Exception) {
            call.reject("endCall failed: ${e.message}")
        }
    }

    /**
     * Toggle FLAG_KEEP_SCREEN_ON on the host Activity so the device doesn't
     * dim/lock during a call. Called from src/lib/callKeepAwake.ts via the
     * "AudioRouter" plugin handle on call connect / disconnect.
     */
    @PluginMethod
    fun keepScreenOn(call: PluginCall) {
        val on = call.getBoolean("on") ?: false
        try {
            activity?.runOnUiThread {
                if (on) {
                    activity.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                } else {
                    activity.window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                }
            }
            val ret = JSObject()
            ret.put("on", on)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("keepScreenOn failed: ${e.message}")
        }
    }

    private fun setSpeakerInternal(on: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12+ — use the modern setCommunicationDevice API.
            val target = if (on) AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                         else AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
            val device = am.availableCommunicationDevices.firstOrNull { it.type == target }
            if (device != null) {
                am.setCommunicationDevice(device)
                return
            }
            // Fall through to legacy path if the requested device isn't available.
        }
        @Suppress("DEPRECATION")
        am.isSpeakerphoneOn = on
    }
}
