import despia from "despia-native";

/**
 * Check if the app is running inside a Despia native wrapper.
 */
export const isDespiaNative = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes("despia");
};

// ── Haptic Feedback ──────────────────────────────────────────────

export const hapticLight = () => {
  if (!isDespiaNative()) return;
  despia("lighthaptic://");
};

export const hapticSuccess = () => {
  if (!isDespiaNative()) return;
  despia("successhaptic://");
};

export const hapticWarning = () => {
  if (!isDespiaNative()) return;
  despia("warninghaptic://");
};

export const hapticError = () => {
  if (!isDespiaNative()) return;
  despia("errorhaptic://");
};

export const hapticHeavy = () => {
  if (!isDespiaNative()) return;
  despia("heavyhaptic://");
};

// ── Biometric Authentication ─────────────────────────────────────

export const requestBiometricAuth = (): void => {
  if (!isDespiaNative()) return;
  despia("bioauth://");
};

// ── App Info ─────────────────────────────────────────────────────

export const getAppVersion = async (): Promise<{
  versionNumber: string;
  bundleNumber: string;
} | null> => {
  if (!isDespiaNative()) return null;
  try {
    const info = await despia("getappversion://", [
      "versionNumber",
      "bundleNumber",
    ]);
    return info as { versionNumber: string; bundleNumber: string };
  } catch {
    return null;
  }
};

// ── Push Notification Player ID ──────────────────────────────────

export const getOneSignalPlayerId = async (): Promise<string | null> => {
  if (!isDespiaNative()) return null;
  try {
    const data = await despia("getonesignalplayerid://", [
      "onesignalplayerid",
    ]);
    return (data as { onesignalplayerid: string })?.onesignalplayerid ?? null;
  } catch {
    return null;
  }
};

// ── Share ─────────────────────────────────────────────────────────

export const nativeShare = (message: string, url: string) => {
  if (!isDespiaNative()) return;
  despia(`shareapp://message?=${encodeURIComponent(message)}&url=${encodeURIComponent(url)}`);
};

// ── Screenshot ───────────────────────────────────────────────────

export const takeScreenshot = () => {
  if (!isDespiaNative()) return;
  despia("takescreenshot://");
};

// ── Status Bar ───────────────────────────────────────────────────

export const setStatusBarColor = (r: number, g: number, b: number) => {
  if (!isDespiaNative()) return;
  despia(`statusbarcolor://{${r}, ${g}, ${b}}`);
};

export { despia };
