/**
 * Thin wrapper around Capacitor native UI plugins.
 * All methods are safe no-ops on web.
 */
import { Capacitor } from "@capacitor/core";

const isNative = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

export async function hideNativeSplash(): Promise<void> {
  if (!isNative()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide({ fadeOutDuration: 300 });
  } catch {
    // Plugin not installed in this build — ignore.
  }
}

export async function setNativeStatusBarDark(): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === "android") {
      await StatusBar.setBackgroundColor({ color: "#000000" });
      await StatusBar.setOverlaysWebView({ overlay: false });
    }
  } catch {
    // Plugin not installed — ignore.
  }
}

export async function lightHaptic(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Ignore.
  }
}

/**
 * Boot-time native UI setup. Call once near app start.
 * Hides the launch splash after a short delay so the React tree has mounted.
 */
export async function bootNativeUI(): Promise<void> {
  if (!isNative()) return;
  // Configure status bar immediately
  void setNativeStatusBarDark();
  // Give React + first paint a moment, then hide native splash
  setTimeout(() => {
    void hideNativeSplash();
  }, 600);
}

export const isNativePlatform = isNative;
