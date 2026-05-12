// MainActivity.additions.kt — paste these snippets into
//   android/app/src/main/java/com/opollmarket/app/MainActivity.kt
//
// PURPOSE
// -------
// Since Android 14 (API 34) the manifest permission USE_FULL_SCREEN_INTENT
// is no longer auto-granted to general apps — only Google-classified
// "calling" / "alarm" apps. For everyone else, the user must manually toggle
//   Settings → Apps → <app> → Notifications → Allow full-screen notifications
// ON, otherwise CallStyle.forIncomingCall is silently demoted and the
// lockscreen IncomingCallActivity NEVER launches. Symptom on the device:
// the call channel buzzes once, plays a sliver of ringtone, and disappears.
//
// This file shows the minimal additions needed in MainActivity to:
//   1) detect the missing permission on app start, and
//   2) deep-link the user into the per-app Settings page that grants it.
//
// We send a JS event ("fsi-permission-required") so the webview can show a
// non-blocking banner asking the user to enable the toggle. The webview side
// listens via window.addEventListener('fsi-permission-required', …) — see
// src/lib/fsiPermission.ts.

/* ------------------------------------------------------------------ */
/* 1) Add these imports at the top of MainActivity.kt                  */
/* ------------------------------------------------------------------ */
// import android.app.NotificationManager
// import android.content.Context
// import android.content.Intent
// import android.net.Uri
// import android.os.Build
// import android.provider.Settings

/* ------------------------------------------------------------------ */
/* 2) Inside MainActivity, add this helper + call it from onCreate    */
/*    AFTER super.onCreate(savedInstanceState).                       */
/* ------------------------------------------------------------------ */
/*

    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(AudioRouterPlugin::class.java)
        super.onCreate(savedInstanceState)
        checkFullScreenIntentPermission()
    }

    override fun onResume() {
        super.onResume()
        // Re-check when the user returns from the Settings page so the
        // banner disappears immediately if they granted it.
        checkFullScreenIntentPermission()
    }

    private fun checkFullScreenIntentPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val granted = runCatching { nm.canUseFullScreenIntent() }.getOrDefault(true)
        android.util.Log.i("MainActivity", "FSI permission granted=$granted")
        // Notify the webview so it can show / hide the banner.
        bridge?.triggerWindowJSEvent(
            "fsi-permission-status",
            "{ \"granted\": $granted }"
        )
    }

    // Called from JS via Capacitor when the user taps the banner CTA.
    // Exposed through a tiny Capacitor plugin or via a custom URL scheme;
    // simplest path is to register a one-line plugin that calls this.
    fun openFullScreenIntentSettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return
        try {
            startActivity(
                Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
                    data = Uri.parse("package:$packageName")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
        } catch (e: Exception) {
            android.util.Log.w("MainActivity", "Could not open FSI settings", e)
            // Fallback to general app-notification settings.
            startActivity(
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                    putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
        }
    }

*/

/* ------------------------------------------------------------------ */
/* 3) (Optional) Tiny Capacitor plugin so JS can request the prompt   */
/*    on demand. Drop this in a new file FsiPermissionPlugin.kt and    */
/*    register it in MainActivity.onCreate via                         */
/*       registerPlugin(FsiPermissionPlugin::class.java)               */
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
