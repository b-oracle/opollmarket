import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, History, ShieldCheck, ShieldMinus, CheckCircle, XCircle,
  Trash2, Pencil, Gavel, RotateCcw, MessageSquare,
  Zap, ArrowUpFromLine, DollarSign,
} from "lucide-react";
import AdminPagination from "@/components/admin/AdminPagination";

interface AuditEntry {
  id: string;
  actor_id: string;
  action: string;
  target_id: string | null;
  target_type: string;
  details: Record<string, any> | null;
  created_at: string;
  actor_name?: string;
  target_name?: string;
}

const PAGE_SIZE = 25;

const actionConfig: Record<string, { label: string; verb: string; icon: typeof ShieldCheck; colorClass: string }> = {
  role_assigned: { label: "Role Assigned", verb: "assigned role to", icon: ShieldCheck, colorClass: "text-emerald-400 bg-emerald-400/10" },
  role_removed: { label: "Role Removed", verb: "removed role from", icon: ShieldMinus, colorClass: "text-destructive bg-destructive/10" },
  moderation_approved: { label: "Moderation Approved", verb: "approved content", icon: CheckCircle, colorClass: "text-emerald-400 bg-emerald-400/10" },
  moderation_rejected: { label: "Moderation Rejected", verb: "rejected content", icon: XCircle, colorClass: "text-destructive bg-destructive/10" },
  market_approved: { label: "Market Approved", verb: "approved market", icon: CheckCircle, colorClass: "text-emerald-400 bg-emerald-400/10" },
  market_rejected: { label: "Market Rejected", verb: "rejected market", icon: XCircle, colorClass: "text-destructive bg-destructive/10" },
  market_cancelled: { label: "Market Cancelled", verb: "cancelled market", icon: Gavel, colorClass: "text-amber-400 bg-amber-400/10" },
  market_resolved: { label: "Market Resolved", verb: "resolved market", icon: Gavel, colorClass: "text-primary bg-primary/10" },
  market_edited: { label: "Market Edited", verb: "edited market", icon: Pencil, colorClass: "text-blue-400 bg-blue-400/10" },
  market_deleted: { label: "Market Deleted", verb: "deleted market", icon: Trash2, colorClass: "text-destructive bg-destructive/10" },
  market_reactivated: { label: "Market Reactivated", verb: "reactivated market", icon: RotateCcw, colorClass: "text-emerald-400 bg-emerald-400/10" },
  comment_deleted: { label: "Comment Deleted", verb: "deleted a comment", icon: MessageSquare, colorClass: "text-destructive bg-destructive/10" },
  boost_activated: { label: "Boost Activated", verb: "activated boost", icon: Zap, colorClass: "text-amber-400 bg-amber-400/10" },
  boost_cancelled: { label: "Boost Cancelled", verb: "cancelled boost", icon: Zap, colorClass: "text-destructive bg-destructive/10" },
  withdrawal_approved: { label: "Withdrawal Approved", verb: "approved withdrawal", icon: ArrowUpFromLine, colorClass: "text-emerald-400 bg-emerald-400/10" },
  withdrawal_rejected: { label: "Withdrawal Rejected", verb: "rejected withdrawal", icon: ArrowUpFromLine, colorClass: "text-destructive bg-destructive/10" },
  balance_adjusted: { label: "Balance Adjusted", verb: "adjusted balance for", icon: DollarSign, colorClass: "text-blue-400 bg-blue-400/10" },
  settings_updated: { label: "Settings Updated", verb: "updated platform settings", icon: Pencil, colorClass: "text-blue-400 bg-blue-400/10" },
};

const fallbackConfig = { label: "Action", verb: "performed action on", icon: History, colorClass: "text-muted-foreground bg-muted" };

const AdminAuditLog = () => {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  useEffect(() => {
    const fetchLogs = async () => {
      const { data, error } = await supabase
        .from("audit_logs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error || !data) {
        setLoading(false);
        return;
      }

      const userIds = new Set<string>();
      (data as any[]).forEach((l: any) => {
        if (l.actor_id) userIds.add(l.actor_id);
        if (l.target_id && l.target_type === "user") userIds.add(l.target_id);
      });

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", Array.from(userIds));

      const nameMap = new Map<string, string>();
      profiles?.forEach((p) => {
        nameMap.set(p.id, p.display_name || p.email || p.id.slice(0, 8));
      });

      setLogs(
        (data as any[]).map((l: any) => ({
          ...l,
          actor_name: nameMap.get(l.actor_id) || l.actor_id?.slice(0, 8),
          target_name: l.target_id
            ? l.target_type === "user"
              ? nameMap.get(l.target_id) || l.target_id?.slice(0, 8)
              : (l.details as any)?.title || l.target_id?.slice(0, 8)
            : null,
        }))
      );
      setLoading(false);
    };
    fetchLogs();
  }, []);

  const actionTypes = useMemo(() => {
    const types = new Set(logs.map(l => l.action));
    return Array.from(types).sort();
  }, [logs]);

  const filteredLogs = useMemo(() =>
    typeFilter === "all" ? logs : logs.filter(l => l.action === typeFilter),
  [logs, typeFilter]);

  const paginatedLogs = useMemo(
    () => filteredLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredLogs, page]
  );

  const formatDetails = (log: AuditEntry) => {
    const config = actionConfig[log.action] || fallbackConfig;
    const d = log.details || {};

    if (log.action === "role_assigned" || log.action === "role_removed") {
      const role = d.role || "unknown";
      const roleLabel = role === "super_admin" ? "Super Admin" : role === "admin" ? "Admin" : "Moderator";
      const roleCls = role === "super_admin" ? "bg-primary/15 text-primary" : role === "admin" ? "bg-blue-500/10 text-blue-500" : "bg-amber-500/10 text-amber-500";
      return (
        <>
          <span className="text-muted-foreground">
            {log.action === "role_assigned" ? "assigned" : "removed"}
          </span>{" "}
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${roleCls}`}>{roleLabel}</span>{" "}
          <span className="text-muted-foreground">{log.action === "role_assigned" ? "to" : "from"}</span>{" "}
          <span className="font-semibold">{log.target_name}</span>
        </>
      );
    }

    if (log.action === "balance_adjusted") {
      const amt = d.amount || 0;
      return (
        <>
          <span className="text-muted-foreground">{amt > 0 ? "credited" : "debited"}</span>{" "}
          <span className="font-semibold">${Math.abs(amt).toLocaleString()}</span>{" "}
          <span className="text-muted-foreground">to</span>{" "}
          <span className="font-semibold">{d.user_name || log.target_name}</span>
        </>
      );
    }

    if (log.action === "settings_updated") {
      const changes: string[] = [];
      if (d.admin_fee_percent !== undefined) changes.push(`Admin Fee: ${d.admin_fee_percent}%`);
      if (d.creator_fee_percent !== undefined) changes.push(`Creator Fee: ${d.creator_fee_percent}%`);
      if (d.exit_fee_percent !== undefined) changes.push(`Exit Fee: ${d.exit_fee_percent}%`);
      if (d.min_withdrawal_amount !== undefined) changes.push(`Min Withdrawal: $${d.min_withdrawal_amount}`);
      if (d.withdrawal_cooldown_minutes !== undefined) changes.push(`Cooldown: ${d.withdrawal_cooldown_minutes}m`);
      if (d.withdrawal_multiplier !== undefined) changes.push(`Multiplier: ${d.withdrawal_multiplier}×`);
      if (d.referral_reward_amount !== undefined) changes.push(`Referral: $${d.referral_reward_amount}`);
      if (d.quick_trade_fee_percent !== undefined) changes.push(`QT Fee: ${d.quick_trade_fee_percent}%`);
      if (d.qt_min_bet !== undefined) changes.push(`QT Min: $${d.qt_min_bet}`);
      if (d.qt_max_bet !== undefined) changes.push(`QT Max: $${d.qt_max_bet}`);
      if (d.qt_streak_2x !== undefined) changes.push(`Streak 2×: ${d.qt_streak_2x}`);
      if (d.qt_streak_3x !== undefined) changes.push(`Streak 3×: ${d.qt_streak_3x}`);
      if (d.qt_streak_4x !== undefined) changes.push(`Streak 4×: ${d.qt_streak_4x}`);
      if (d.qt_streak_5x !== undefined) changes.push(`Streak 5×: ${d.qt_streak_5x}`);
      if (d.min_token_balance !== undefined) changes.push(`Min Token: ${Number(d.min_token_balance).toLocaleString()}`);
      if (d.min_nft_balance !== undefined) changes.push(`Min NFT: ${d.min_nft_balance}`);
      return (
        <>
          <span className="text-muted-foreground">updated platform settings</span>
          {changes.length > 0 && (
            <span className="text-muted-foreground text-xs ml-1">— {changes.join(", ")}</span>
          )}
        </>
      );
    }

    return (
      <>
        <span className="text-muted-foreground">{config.verb}</span>{" "}
        {log.target_name && <span className="font-semibold">{log.target_name}</span>}
        {d.note && <span className="text-muted-foreground text-xs ml-1">— "{d.note}"</span>}
      </>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <History className="w-5 h-5 text-primary" />
          <h2 className="text-xl sm:text-2xl font-bold">Audit Log</h2>
          <span className="text-xs text-muted-foreground">{filteredLogs.length} entries</span>
        </div>
        <select
          value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          className="bg-muted/50 border border-border rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="all">All Actions</option>
          {actionTypes.map(type => (
            <option key={type} value={type}>
              {(actionConfig[type] || fallbackConfig).label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {paginatedLogs.map((log) => {
          const config = actionConfig[log.action] || fallbackConfig;
          const Icon = config.icon;

          return (
            <div
              key={log.id}
              className="bg-card border border-border rounded-xl p-4 flex items-start gap-3"
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${config.colorClass}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  <span className="font-semibold">{log.actor_name}</span>{" "}
                  {formatDetails(log)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {new Date(log.created_at).toLocaleDateString()}{" "}
                  {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}

        {filteredLogs.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No audit entries yet</p>
            <p className="text-xs mt-1">Admin actions will be logged here.</p>
          </div>
        )}
      </div>

      <AdminPagination page={page} totalItems={filteredLogs.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default AdminAuditLog;
