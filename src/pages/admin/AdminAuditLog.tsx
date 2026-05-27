import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import AdminPagination from "@/components/admin/AdminPagination";
import {
  Loader2, History, ShieldCheck, ShieldMinus, CheckCircle, XCircle,
  Trash2, Pencil, Gavel, RotateCcw, MessageSquare,
  Zap, ArrowUpFromLine, DollarSign, Search, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
  manual_deposit_confirm: { label: "Manual Deposit", verb: "manually confirmed deposit for", icon: DollarSign, colorClass: "text-emerald-400 bg-emerald-400/10" },
  duplicate_payout_correction: { label: "Payout Correction", verb: "corrected duplicate payout for", icon: DollarSign, colorClass: "text-amber-400 bg-amber-400/10" },
};

const fallbackConfig = { label: "Action", verb: "performed action on", icon: History, colorClass: "text-muted-foreground bg-muted" };

const AdminAuditLog = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-audit-log", page, typeFilter, search],
    queryFn: async () => {
      const trimmed = search.trim().toLowerCase();

      // Resolve actor IDs from search term
      let searchActorIds: string[] | null = null;
      if (trimmed) {
        const { data: matchedProfiles } = await supabase.rpc(
          "admin_search_profiles",
          { _q: trimmed }
        );
        searchActorIds = ((matchedProfiles as any[]) || []).map((p: any) => p.id);
      }

      let query = supabase
        .from("audit_logs" as any)
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (typeFilter !== "all") {
        query = query.eq("action", typeFilter);
      }

      if (trimmed && searchActorIds && searchActorIds.length > 0) {
        query = query.in("actor_id", searchActorIds);
      } else if (trimmed && searchActorIds && searchActorIds.length === 0) {
        // No matching users, try action name search
        const matchingActions = Object.keys(actionConfig).filter(k =>
          actionConfig[k].label.toLowerCase().includes(trimmed) || k.includes(trimmed)
        );
        if (matchingActions.length > 0) {
          query = query.in("action", matchingActions);
        } else {
          return { logs: [], total: 0, actionTypes: [] };
        }
      }

      query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      const { data: rawLogs, count, error } = await query;
      if (error || !rawLogs) return { logs: [], total: 0, actionTypes: [] };

      // Fetch all action types for filter dropdown
      const { data: allLogs } = await supabase
        .from("audit_logs" as any)
        .select("action")
        .limit(1000);
      const actionTypes = [...new Set((allLogs || []).map((l: any) => l.action))].sort();

      // Resolve names
      const userIds = new Set<string>();
      (rawLogs as any[]).forEach((l: any) => {
        if (l.actor_id) userIds.add(l.actor_id);
        if (l.target_id && l.target_type === "user") userIds.add(l.target_id);
      });

      const { data: profiles } = userIds.size > 0
        ? await supabase.rpc("admin_get_profiles_with_email", { _ids: Array.from(userIds) })
        : { data: [] };

      const nameMap = new Map<string, string>();
      profiles?.forEach((p) => {
        nameMap.set(p.id, p.display_name || p.email || p.id.slice(0, 8));
      });

      const logs: AuditEntry[] = (rawLogs as any[]).map((l: any) => ({
        ...l,
        actor_name: nameMap.get(l.actor_id) || l.actor_id?.slice(0, 8),
        target_name: l.target_id
          ? l.target_type === "user"
            ? nameMap.get(l.target_id) || l.target_id?.slice(0, 8)
            : (l.details as any)?.title || l.target_id?.slice(0, 8)
          : null,
      }));

      return { logs, total: count || 0, actionTypes };
    },
  });

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
      if (d.liquidity_return_fee_percent !== undefined) changes.push(`Liquidity Return Fee: ${d.liquidity_return_fee_percent}%`);
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
      if (d.min_token_balance !== undefined) changes.push(`Min Token (Blue): ${Number(d.min_token_balance).toLocaleString()}`);
      if (d.min_gold_token_balance !== undefined) changes.push(`Min Token (Gold): ${Number(d.min_gold_token_balance).toLocaleString()}`);
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <History className="w-5 h-5 text-primary" />
          <h2 className="text-xl sm:text-2xl font-bold">Audit Log</h2>
          <span className="text-xs text-muted-foreground">{data?.total || 0} entries</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-1 transition-transform ${isLoading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by admin name, email, or action..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          className="bg-muted/50 border border-border rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="all">All Actions</option>
          {(data?.actionTypes || []).map((type: string) => (
            <option key={type} value={type}>
              {(actionConfig[type] || fallbackConfig).label}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : !data?.logs.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No audit entries found</p>
          <p className="text-xs mt-1">Try adjusting your search or filter.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.logs.map((log) => {
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
        </div>
      )}

      <div className="mt-4">
        <AdminPagination page={page} totalItems={data?.total || 0} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>
    </div>
  );
};

export default AdminAuditLog;
