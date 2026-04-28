// Android foreground service helper for active voice/video calls.
//
// Why this exists: Android 14+ aggressively suspends the WebView and
// revokes microphone access from background apps. Without a foreground
// service of type `microphone`, the LiveKit WSS dies a few seconds after
// pickup — exactly the symptom the team has been chasing.
//
// On iOS / web this is a no-op. On Android Capacitor builds we start the
// service the moment the room connects and stop it when the call ends.

let started = false;

const isAndroidNative = async (): Promise<boolean> => {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor?.getPlatform?.() === "android" && Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
};

export const startCallForegroundService = async (
  remoteName: string,
): Promise<void> => {
  if (started) return;
  if (!(await isAndroidNative())) return;
  try {
    const mod: any = await import("@capawesome-team/capacitor-android-foreground-service");
    const Svc = mod?.ForegroundService;
    if (!Svc) return;
    // Best-effort permission for POST_NOTIFICATIONS (Android 13+).
    try {
      const status = await Svc.checkPermissions?.();
      if (status?.display === "prompt" || status?.display === "denied") {
        await Svc.requestPermissions?.();
      }
    } catch { /* ignore */ }
    await Svc.startForegroundService({
      id: 1010,
      title: "Call in progress",
      body: remoteName ? `On a call with ${remoteName}` : "Voice call active",
      smallIcon: "ic_stat_icon_config_sample",
      // foregroundServiceType is auto-set by the plugin to "mediaPlayback";
      // for Android 14 mic we additionally need RECORD_AUDIO + manifest
      // entry `android:foregroundServiceType="microphone"` declared in
      // AndroidManifest.xml (see android-native-ref/AndroidManifest.additions.xml).
      buttons: [],
    });
    started = true;
    console.log("[call-fg] foreground service started");
  } catch (err) {
    console.warn("[call-fg] start failed:", err);
  }
};

export const stopCallForegroundService = async (): Promise<void> => {
  if (!started) return;
  if (!(await isAndroidNative())) {
    started = false;
    return;
  }
  try {
    const mod: any = await import("@capawesome-team/capacitor-android-foreground-service");
    const Svc = mod?.ForegroundService;
    if (!Svc) return;
    await Svc.stopForegroundService();
    console.log("[call-fg] foreground service stopped");
  } catch (err) {
    console.warn("[call-fg] stop failed:", err);
  } finally {
    started = false;
  }
};
