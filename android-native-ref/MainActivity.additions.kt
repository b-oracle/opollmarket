// MainActivity.additions.kt — paste these snippets into
//   android/app/src/main/java/com/opollmarket/app/MainActivity.kt
//
// Implements the "set up incoming calls" onboarding flow used by
// src/components/CallPermissionsOnboarding.tsx + src/lib/callPermissions.ts.
//
// The web layer calls into the CallPermissions Capacitor plugin to:
//   1. Check every toggle required for swipe-to-answer on Android 14+
//   2. Trigger the runtime POST_NOTIFICATIONS prompt
//   3. Deep-link the user into the correct per-app Settings screen for
//      Full-Screen Intent permission, Battery optimization exemption, and
//      the Incoming Calls notification channel.
//
// We also keep the existing FsiPermission plugin as a backward-compatible
// alias for the old FsiPermissionBanner CTA.

/* ------------------------------------------------------------------ */
/* 1) Imports to add at the top of MainActivity.kt                    */
/* ------------------------------------------------------------------ */
/*
import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
*/

/* ------------------------------------------------------------------ */
/* 2) Inside MainActivity, register the plugins + keep helpers below. */
/* ------------------------------------------------------------------ */
/*
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(AudioRouterPlugin::class.java)
        registerPlugin(FsiPermissionPlugin::class.java)       // legacy banner
        registerPlugin(CallPermissionsPlugin::class.java)     // onboarding
        super.onCreate(savedInstanceState)
        emitFsiPermissionStatus()
    }

    override fun onResume() {
        super.onResume()
        emitFsiPermissionStatus()
    }

    fun emitFsiPermissionStatus() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            runCatching { nm.canUseFullScreenIntent() }.getOrDefault(true)
        } else true
        bridge?.triggerWindowJSEvent("fsi-permission-status", "{ \"granted\": $granted }")
    }

    fun openFullScreenIntentSettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return
        try {
            startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
                data = Uri.parse("package:$packageName")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        } catch (e: Exception) {
            startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        }
    }

    fun openBatteryOptimizationSettings() {
        try {
            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$packageName")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        } catch (e: Exception) {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        }
    }

    fun openIncomingCallChannelSettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        startActivity(Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
            putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
            putExtra(Settings.EXTRA_CHANNEL_ID, "incoming_calls")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }
*/

/* ------------------------------------------------------------------ */
/* 3) FsiPermissionPlugin.kt — legacy single-purpose plugin           */
/* ------------------------------------------------------------------ */
/*
package com.opollmarket.app

import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "FsiPermission")
class FsiPermissionPlugin : Plugin() {
    @PluginMethod
    fun openSettings(call: PluginCall) {
        (activity as? MainActivity)?.openFullScreenIntentSettings()
        call.resolve()
    }
}
*/

/* ------------------------------------------------------------------ */
/* 4) CallPermissionsPlugin.kt — onboarding plugin                    */
/* ------------------------------------------------------------------ */
/*
package com.opollmarket.app

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.PermissionCallback
import com.getcapacitor.PermissionState
import com.getcapacitor.annotation.Permission

@CapacitorPlugin(
    name = "CallPermissions",
    permissions = [
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")
    ]
)
class CallPermissionsPlugin : Plugin() {

    @PluginMethod
    fun check(call: PluginCall) {
        val ctx = context
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
        val sdk = Build.VERSION.SDK_INT

        val notifGranted = if (sdk >= 33)
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
        else nm.areNotificationsEnabled()

        val fsiGranted = if (sdk >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
            runCatching { nm.canUseFullScreenIntent() }.getOrDefault(true)
        else true

        val battery = runCatching { pm.isIgnoringBatteryOptimizations(ctx.packageName) }.getOrDefault(true)

        val channelOk = if (sdk >= Build.VERSION_CODES.O) {
            val ch = nm.getNotificationChannel("incoming_calls")
            ch != null && ch.importance >= NotificationManager.IMPORTANCE_HIGH
        } else true

        val res = JSObject()
        res.put("notifications", if (notifGranted) "granted" else "denied")
        res.put("fullScreenIntent", if (fsiGranted) "granted" else "denied")
        res.put("batteryOptimization", if (battery) "granted" else "denied")
        res.put("channelImportance", if (channelOk) "granted" else "denied")
        res.put("sdkInt", sdk)
        res.put("isAndroid", true)
        call.resolve(res)
    }

    @PluginMethod
    fun requestNotifications(call: PluginCall) {
        if (Build.VERSION.SDK_INT < 33) {
            val res = JSObject(); res.put("status", "granted"); call.resolve(res); return
        }
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            val res = JSObject(); res.put("status", "granted"); call.resolve(res); return
        }
        requestPermissionForAlias("notifications", call, "notifResult")
    }

    @PermissionCallback
    private fun notifResult(call: PluginCall) {
        val state = getPermissionState("notifications")
        val res = JSObject()
        res.put("status", if (state == PermissionState.GRANTED) "granted" else "denied")
        call.resolve(res)
    }

    @PluginMethod
    fun openFullScreenIntentSettings(call: PluginCall) {
        (activity as? MainActivity)?.openFullScreenIntentSettings()
        call.resolve()
    }

    @PluginMethod
    fun openBatteryOptimizationSettings(call: PluginCall) {
        (activity as? MainActivity)?.openBatteryOptimizationSettings()
        call.resolve()
    }

    @PluginMethod
    fun openChannelSettings(call: PluginCall) {
        (activity as? MainActivity)?.openIncomingCallChannelSettings()
        call.resolve()
    }
}
*/

/* ------------------------------------------------------------------ */
/* 5) AndroidManifest additions (already present, listed for clarity) */
/* ------------------------------------------------------------------ */
/*
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
*/
