import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { aimtellTrackEvent } from "@/lib/aimtell";

type EventName =
  | "page_view"
  | "bet_placed"
  | "prediction_placed"
  | "bet_confirmed"
  | "prediction_confirmed"
  | "deposit_started"
  | "deposit_completed"
  | "withdrawal_requested"
  | "market_created"
  | "market_shared"
  | "signup_started"
  | "login_completed"
  | "terms_accepted"
  | "comment_posted"
  | "market_liked"
  | "market_bookmarked"
  | "limit_order_placed"
  | "limit_order_started"
  | "limit_order_cancelled"
  | "push_enabled_first_bet"
  | "push_enabled_first_prediction"
  | "copy_trade_started"
  | "referral_shared"
  | "profile_viewed"
  | "quick_trade_won"
  | "quick_trade_lost"
  | "category_crypto"
  | "category_sports"
  | "category_politics"
  | "category_entertainment"
  | "category_finance";

interface EventProperties {
  [key: string]: string | number | boolean | undefined;
}

/** Map analytics events to Aimtell segment tags */
const AIMTELL_EVENT_MAP: Partial<Record<EventName, string>> = {
  bet_placed: "quick-trade",
  bet_confirmed: "quick-trade",
  prediction_placed: "prediction",
  prediction_confirmed: "prediction",
  deposit_started: "depositor",
  deposit_completed: "depositor-confirmed",
  market_created: "creator",
  login_completed: "logged-in",
  copy_trade_started: "copy-trader",
  referral_shared: "referrer",
  quick_trade_won: "qt-winner",
  quick_trade_lost: "qt-active",
  category_crypto: "cat-crypto",
  category_sports: "cat-sports",
  category_politics: "cat-politics",
  category_entertainment: "cat-entertainment",
  category_finance: "cat-finance",
  comment_posted: "commenter",
  market_liked: "engager",
  market_bookmarked: "bookmarker",
  market_shared: "sharer",
  withdrawal_requested: "withdrawer",
};

const useAnalytics = () => {
  const track = useCallback(async (event: EventName, properties?: EventProperties) => {
    try {
      // Forward to Aimtell for push segmentation
      const aimtellTag = AIMTELL_EVENT_MAP[event];
      if (aimtellTag) aimtellTrackEvent(aimtellTag);

      const { data: { user } } = await supabase.auth.getUser();

      await supabase.from("analytics_events").insert({
        event_name: event,
        properties: properties || {},
        user_id: user?.id || null,
      });
    } catch {
      // Silent fail — analytics should never break the app
    }
  }, []);

  return { track };
};

export default useAnalytics;
