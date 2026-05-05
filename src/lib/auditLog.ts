import { supabase } from "@/integrations/supabase/client";

type AuditAction =
  | "role_assigned"
  | "role_removed"
  | "moderation_approved"
  | "moderation_rejected"
  | "market_approved"
  | "market_rejected"
  | "market_cancelled"
  | "market_voided_and_refunded"
  | "market_resolved"
  | "market_edited"
  | "market_deleted"
  | "market_reactivated"
  | "market_reopened"
  | "market_ended_manually"
  | "comment_deleted"
  | "boost_activated"
  | "boost_cancelled"
  | "withdrawal_approved"
  | "withdrawal_rejected"
  | "balance_adjusted"
  | "settings_updated"
  | "user_blocked"
  | "user_unblocked";

interface AuditLogParams {
  action: AuditAction;
  targetId?: string | null;
  targetType?: string;
  details?: Record<string, any>;
}

/**
 * Fire-and-forget audit log writer.
 * Resolves actor_id from the current session automatically.
 */
export const logAuditEvent = async ({ action, targetId, targetType = "user", details = {} }: AuditLogParams) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("audit_logs" as any).insert({
      actor_id: user.id,
      action,
      target_id: targetId ?? null,
      target_type: targetType,
      details,
    });
  } catch {
    // Fire-and-forget — never block the main action
  }
};
