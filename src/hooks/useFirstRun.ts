import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";

const ONBOARDED_KEY = "opoll_onboarded_v1";

const isBot = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /bot|crawler|spider|crawling|googlebot|bingbot|yandex|duckduckbot|baiduspider|facebookexternalhit|twitterbot|linkedinbot|slackbot|discordbot/i.test(
    ua,
  );
};

export const hasCompletedOnboarding = (): boolean => {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === "1";
  } catch {
    return true; // fail-closed: don't loop into welcome if storage is broken
  }
};

export const markOnboardingComplete = (): void => {
  try {
    localStorage.setItem(ONBOARDED_KEY, "1");
  } catch {
    // ignore
  }
};

export const resetOnboarding = (): void => {
  try {
    localStorage.removeItem(ONBOARDED_KEY);
  } catch {
    // ignore
  }
};

const isNative = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/**
 * First-run gate. Redirects to /welcome on the very first launch.
 * - Native (Android/iOS): always redirect from "/" if not onboarded.
 * - Web/PWA: only redirect if user is on "/" AND not a bot AND has the
 *   PWA standalone display mode (installed) OR has never visited.
 *   `?skip_onboarding=1` always bypasses.
 */
export const useFirstRun = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Only consider redirecting from the root landing.
    if (location.pathname !== "/") return;

    const params = new URLSearchParams(location.search);
    if (params.get("skip_onboarding") === "1") {
      markOnboardingComplete();
      return;
    }

    if (hasCompletedOnboarding()) return;
    if (isBot()) return;

    const native = isNative();
    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      // iOS Safari
      (navigator as any).standalone === true;

    // Web visitors who aren't installed see the normal landing (SEO-friendly).
    if (!native && !standalone) {
      // Mark complete so they don't get prompted next time either.
      markOnboardingComplete();
      return;
    }

    navigate("/welcome", { replace: true });
  }, [location.pathname, location.search, navigate]);
};
