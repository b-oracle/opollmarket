export type MicrophonePermissionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "unsupported" | "denied" | "not_found" | "busy" | "unknown";
      title: string;
      description: string;
      errorName?: string;
      errorMessage?: string;
    };

const stopStream = (stream: MediaStream) => {
  try {
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    // ignore cleanup errors
  }
};

export const ensureMicrophonePermission = async (): Promise<MicrophonePermissionResult> => {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return {
      ok: false,
      reason: "unsupported",
      title: "Microphone unavailable",
      description: "This app build cannot access the microphone on this device.",
    };
  }

  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
      if (status.state === "denied") {
        return {
          ok: false,
          reason: "denied",
          title: "Microphone permission denied",
          description: "Enable microphone access in the app settings, then try the call again.",
          errorName: "PermissionDenied",
        };
      }
    }
  } catch {
    // Android WebView may not support Permissions API for microphone.
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stopStream(stream);
    return { ok: true };
  } catch (err: any) {
    const name = err?.name || "UnknownError";
    const message = err?.message || "";
    if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
      return {
        ok: false,
        reason: "denied",
        title: "Microphone permission denied",
        description: "Enable microphone access in the app settings, then try the call again.",
        errorName: name,
        errorMessage: message,
      };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
      return {
        ok: false,
        reason: "not_found",
        title: "No microphone found",
        description: "Connect or enable a microphone, then try again.",
        errorName: name,
        errorMessage: message,
      };
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return {
        ok: false,
        reason: "busy",
        title: "Microphone is busy",
        description: "Close other apps using the microphone, then try again.",
        errorName: name,
        errorMessage: message,
      };
    }
    return {
      ok: false,
      reason: "unknown",
      title: "Microphone check failed",
      description: message || "The microphone could not be opened on this device.",
      errorName: name,
      errorMessage: message,
    };
  }
};