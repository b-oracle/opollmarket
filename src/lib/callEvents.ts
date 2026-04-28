// Lightweight helper for logging DM call lifecycle events.
// Fire-and-forget — never throws, never blocks UI flows.
// Server-side validation (RLS + RPC) ensures only participants can log.
import { supabase } from "@/integrations/supabase/client";

export type CallEventType =
  | "received"
  | "accepted"
  | "declined"
  | "joined"
  | "ended"
  | "failed"
  | "missed"
  | "rejoin"
  | "timeout"
  | "cancelled"
  | "muted"
  | "viewed_chat";

export const logCallEvent = (
  callId: string | null | undefined,
  eventType: CallEventType,
  metadata: Record<string, unknown> = {},
) => {
  if (!callId) return;
  try {
    supabase
      .rpc("log_dm_call_event" as never, {
        _call_id: callId,
        _event_type: eventType,
        _metadata: metadata as never,
      } as never)
      .then(({ error }) => {
        if (error) console.warn("[callEvents] log failed:", eventType, error.message);
      });
  } catch (err) {
    console.warn("[callEvents] log threw:", err);
  }
};
