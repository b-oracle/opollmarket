import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  const track = useCallback(async (event: EventName, properties?: EventProperties) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      await supabase.from("analytics_events" as any).insert({
        event_name: event,
        properties: properties || {},
        user_id: user?.id || null,
      } as any);
    } catch {
      // Silent fail — analytics should never break the app
    }
  }, []);

  return { track };
};

export default useAnalytics;
