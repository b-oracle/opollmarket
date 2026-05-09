// Thin JS wrapper around the native AudioRouter Capacitor plugin
// (android-native-ref/AudioRouterPlugin.kt). On non-Android / non-native
// platforms every method is a safe no-op, so callers can use it
// unconditionally.
//
// On Android, this is the ONLY way to actually route the LiveKit call audio
// between the earpiece and the loudspeaker — HTMLAudioElement.volume and
// setSinkId() do not work inside Capacitor's WebView.
import { Capacitor, registerPlugin } from "@capacitor/core";

interface AudioRouterPlugin {
  startCall(): Promise<void>;
  setSpeakerphone(opts: { on: boolean }): Promise<{ on: boolean }>;
  isSpeakerphoneOn(): Promise<{ on: boolean }>;
  endCall(): Promise<void>;
}

const Native = registerPlugin<AudioRouterPlugin>("AudioRouter");

const isAndroidNative = (): boolean => {
  try {
    return (
      Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android"
    );
  } catch {
    return false;
  }
};

export const AudioRouter = {
  /** Switch AudioManager into VoIP mode and default to earpiece. */
  async startCall(): Promise<void> {
    if (!isAndroidNative()) return;
    try {
      await Native.startCall();
    } catch (err) {
      console.warn("[audio-router] startCall failed:", err);
    }
  },

  /** Toggle speakerphone on/off. Returns the actual state on success. */
  async setSpeakerphone(on: boolean): Promise<boolean> {
    if (!isAndroidNative()) return on;
    try {
      const res = await Native.setSpeakerphone({ on });
      return !!res?.on;
    } catch (err) {
      console.warn("[audio-router] setSpeakerphone failed:", err);
      return on;
    }
  },

  async isSpeakerphoneOn(): Promise<boolean> {
    if (!isAndroidNative()) return false;
    try {
      const res = await Native.isSpeakerphoneOn();
      return !!res?.on;
    } catch {
      return false;
    }
  },

  /** Restore audio routing back to whatever the system was doing. */
  async endCall(): Promise<void> {
    if (!isAndroidNative()) return;
    try {
      await Native.endCall();
    } catch (err) {
      console.warn("[audio-router] endCall failed:", err);
    }
  },
};

export const isAndroidNativeAudio = isAndroidNative;
