import { useCallback } from "react";

type EventName =
  | "page_view"
  | "bet_placed"
  | "bet_confirmed"
  | "deposit_started"
  | "withdrawal_requested"
  | "market_created"
  | "market_shared"
  | "signup_started"
  | "login_completed"
  | "terms_accepted"
  | "comment_posted"
  | "market_liked"
  | "market_bookmarked";

interface EventProperties {
  [key: string]: string | number | boolean | undefined;
}

const useAnalytics = () => {
  const track = useCallback((event: EventName, properties?: EventProperties) => {
    try {
      console.log(`[Analytics] ${event}`, properties || {});
      // Future: send to analytics endpoint
      // e.g. supabase.from('analytics_events').insert({ event, properties, timestamp: new Date().toISOString() })
    } catch (err) {
      // Silent fail — analytics should never break the app
    }
  }, []);

  return { track };
};

export default useAnalytics;
