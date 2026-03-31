import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";
import {
  aimtellIdentifyUser,
  aimtellTrackEvent,
  aimtellPromptSubscribe,
} from "@/lib/aimtell";
import AimtellPushPrompt from "./AimtellPushPrompt";

const AUTO_SUB_KEY = "aimtell_auto_subscribed";

/**
 * Invisible component that:
 * 1. Renders a custom styled push-notification prompt (replaces Aimtell's default).
 * 2. Identifies logged-in users with subscriber attributes.
 * 3. Tags page-level activity for granular segmentation.
 * 4. Auto-subscribes authenticated users who already granted notification permission.
 */
const AimtellProvider = () => {
  const { user, displayName } = useAuth();
  const location = useLocation();
  const identified = useRef<string | null>(null);

  // Identify user when logged in
  useEffect(() => {
    if (!user) return;
    if (identified.current === user.id) return;
    identified.current = user.id;
    aimtellIdentifyUser(user.id, user.email, displayName);
  }, [user, displayName]);

  // Auto-subscribe authenticated users who already granted permission
  // This catches users who said "Allow" in the browser prompt but weren't
  // registered with Aimtell due to the service worker conflict.
  useEffect(() => {
    if (!user) return;
    if (typeof Notification === "undefined") return;

    // Only auto-subscribe if permission is already granted (no prompt shown)
    if (Notification.permission !== "granted") return;

    try {
      // Don't repeatedly call if already auto-subscribed this session
      if (sessionStorage.getItem(AUTO_SUB_KEY) === user.id) return;
      sessionStorage.setItem(AUTO_SUB_KEY, user.id);
    } catch {
      // ignore storage failures
    }

    // Re-trigger Aimtell subscription to ensure the user is registered
    aimtellPromptSubscribe();
  }, [user]);

  // Tag key routes for granular segmentation
  useEffect(() => {
    const path = location.pathname;

    if (path === "/quick-trade") aimtellTrackEvent("quick-trade");
    else if (path.startsWith("/market/")) aimtellTrackEvent("prediction");
    else if (path === "/portfolio") aimtellTrackEvent("portfolio");
    else if (path === "/rankings") aimtellTrackEvent("rankings");
    else if (path === "/feed") aimtellTrackEvent("feed");
    else if (path === "/create") aimtellTrackEvent("creator");
    else if (path === "/referrals") aimtellTrackEvent("referral-user");
    else if (path === "/commissions") aimtellTrackEvent("commission-earner");
    else if (path === "/developers") aimtellTrackEvent("developer");
    else if (path.startsWith("/user/")) aimtellTrackEvent("social-browser");
    else if (path === "/faq") aimtellTrackEvent("help-seeker");
  }, [location.pathname]);

  return <AimtellPushPrompt />;
};

export default AimtellProvider;
