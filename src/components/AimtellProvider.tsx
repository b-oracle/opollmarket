import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";
import {
  aimtellPromptSubscribe,
  aimtellIdentifyUser,
  aimtellTrackEvent,
} from "@/lib/aimtell";

/**
 * Invisible component that:
 * 1. Prompts new visitors for push-notification permission via Aimtell
 *    (after a short delay so they see the page first).
 * 2. Identifies logged-in users with subscriber attributes.
 * 3. Tags page-level activity for granular segmentation.
 */
const AimtellProvider = () => {
  const { user, displayName } = useAuth();
  const location = useLocation();
  const prompted = useRef(false);
  const identified = useRef<string | null>(null);

  // Prompt for push permission once per session (5s after first load)
  useEffect(() => {
    if (prompted.current) return;
    const t = setTimeout(() => {
      prompted.current = true;
      aimtellPromptSubscribe();
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  // Identify user when logged in
  useEffect(() => {
    if (!user) return;
    if (identified.current === user.id) return;
    identified.current = user.id;
    aimtellIdentifyUser(user.id, user.email, displayName);
  }, [user, displayName]);

  // Tag key routes for granular segmentation
  useEffect(() => {
    const path = location.pathname;

    // Core product segments
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

    // Category-based segments from market detail pages
    // (category is tagged via analytics events, not route)
  }, [location.pathname]);

  return null;
};

export default AimtellProvider;
