const PREVIEW_HOST_MARKERS = ["id-preview--", "lovableproject.com"];

export const isPreviewHost = (hostname?: string) => {
  if (!hostname && typeof window === "undefined") return false;
  const value = hostname ?? window.location.hostname;
  return PREVIEW_HOST_MARKERS.some((marker) => value.includes(marker));
};

export const isInIframe = () => {
  if (typeof window === "undefined") return false;

  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

export const isPwaBlockedContext = () => {
  if (typeof window === "undefined") return false;
  return isPreviewHost() || isInIframe();
};

export const cleanupBlockedPwaContext = async () => {
  if (typeof window === "undefined" || !isPwaBlockedContext()) return false;

  let hadServiceWorkerState = false;

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      hadServiceWorkerState =
        hadServiceWorkerState ||
        registrations.length > 0 ||
        Boolean(navigator.serviceWorker.controller);

      await Promise.all(
        registrations.map((registration) => registration.unregister().catch(() => false))
      );
    }

    if ("caches" in window) {
      const cacheKeys = await caches.keys();
      hadServiceWorkerState = hadServiceWorkerState || cacheKeys.length > 0;

      await Promise.all(cacheKeys.map((key) => caches.delete(key).catch(() => false)));
    }
  } catch {
    // Ignore preview cleanup errors.
  }

  return hadServiceWorkerState;
};
