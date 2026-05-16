import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ShieldAlert,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Copy,
  Settings2,
  Save,
} from "lucide-react";
import RpcHealthPanel from "@/components/admin/RpcHealthPanel";

const statusColors: Record<string, string> = {
  manual_review: "bg-amber-500/15 text-amber-500 border-amber-500/20",
  credited: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
  rejected: "bg-destructive/15 text-destructive border-destructive/20",
};

const AdminBscReview = () => {
  const qc = useQueryClient();
  const { isSuperAdmin } = useAuth();
  const [filter, setFilter] = useState<"manual_review" | "rejected" | "credited">("manual_review");
  const [thresholdInput, setThresholdInput] = useState<string>("");

  const { data: threshold } = useQuery({
    queryKey: ["app-setting", "bsc_max_auto_credit_usd"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings" as any)
        .select("value, updated_at")
        .eq("key", "bsc_max_auto_credit_usd")
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  useEffect(() => {
    if (threshold?.value != null) setThresholdInput(String(threshold.value));
  }, [threshold?.value]);

  const saveThreshold = useMutation({
    mutationFn: async (newValue: number) => {
      const { error } = await supabase
        .from("app_settings" as any)
        .update({
          value: newValue as any,
          updated_at: new Date().toISOString(),
          updated_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .eq("key", "bsc_max_auto_credit_usd");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Auto-credit threshold updated. Takes effect on next poll (~30s).");
      qc.invalidateQueries({ queryKey: ["app-setting", "bsc_max_auto_credit_usd"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to save"),
  });

  const { data: events, isLoading, refetch } = useQuery({
    queryKey: ["bsc-review-events", filter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bsc_deposit_events" as any)
        .select("*")
        .eq("status", filter)
        .order("detected_at", { ascending: false })
        .limit(100);
      if (error) throw error;

      const userIds = [...new Set(((data as any[]) || []).map((e) => e.user_id))];
      const { data: profiles } = userIds.length
        ? await supabase.rpc("admin_get_profiles_with_email", { _ids: userIds })
        : { data: [] };
      const pmap = Object.fromEntries(((profiles as any[]) || []).map((p) => [p.id, p]));

      return ((data as any[]) || []).map((e) => ({
        ...e,
        display_name: pmap[e.user_id]?.display_name || "Unknown",
        email: pmap[e.user_id]?.email || "",
      }));
    },
  });

  const actionMutation = useMutation({
    mutationFn: async (vars: { eventId: string; action: "approve" | "reject"; reason?: string }) => {
      const { data, error } = await supabase.functions.invoke("admin-bsc-deposit-action", {
        body: { event_id: vars.eventId, action: vars.action, reason: vars.reason },
      });
      if (error) throw new Error(error.message || "Action failed");
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as any;
    },
    onSuccess: (data) => {
      toast.success(
        data?.action === "approved"
          ? "Deposit approved, credited, and logged"
          : "Deposit rejected and logged",
      );
      qc.invalidateQueries({ queryKey: ["bsc-review-events"] });
      qc.invalidateQueries({ queryKey: ["bsc-review-audit"] });
    },
    onError: (err: any) => toast.error(err.message || "Action failed"),
  });

  // Audit history for displayed events
  const eventIds = (events || []).map((e: any) => e.id);
  const { data: auditMap } = useQuery({
    queryKey: ["bsc-review-audit", eventIds.join(",")],
    enabled: eventIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs" as any)
        .select("id, actor_id, action, target_id, details, created_at")
        .in("action", ["bsc_deposit_approve", "bsc_deposit_reject"])
        .in("target_id", eventIds)
        .order("created_at", { ascending: false });
      if (error) return {} as Record<string, any[]>;
      const map: Record<string, any[]> = {};
      for (const row of (data as any[]) || []) {
        (map[row.target_id] = map[row.target_id] || []).push(row);
      }
      // Resolve actor display names
      const actorIds = [...new Set(((data as any[]) || []).map((r) => r.actor_id))];
      if (actorIds.length) {
        const { data: actors } = await supabase.rpc("admin_get_profiles_with_email", { _ids: actorIds });
        const amap = Object.fromEntries(((actors as any[]) || []).map((p) => [p.id, p]));
        for (const arr of Object.values(map)) {
          for (const r of arr) {
            r.actor_name = amap[r.actor_id]?.display_name || amap[r.actor_id]?.email || r.actor_id.slice(0, 8);
          }
        }
      }
      return map;
    },
  });

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-amber-500" />
            BSC Deposit Review
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manually review BSC deposits flagged for suspicious activity (over auto-credit limit, receipt mismatch, etc.)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Auto-credit threshold setting (super admin only) */}
      {isSuperAdmin && (
        <div className="border border-border bg-card rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Settings2 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Auto-credit threshold</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            BSC deposits at or below this USD amount auto-credit after 12 confirmations.
            Larger deposits land in this review queue. Changes take effect on the next poll (~30 seconds).
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <label className="text-[11px] text-muted-foreground font-medium block mb-1">
                Max auto-credit (USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  className="pl-7 font-mono"
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value)}
                  placeholder="5000"
                />
              </div>
            </div>
            <Button
              size="sm"
              disabled={
                saveThreshold.isPending ||
                !thresholdInput ||
                Number(thresholdInput) <= 0 ||
                Number(thresholdInput) === Number(threshold?.value)
              }
              onClick={() => {
                const v = Number(thresholdInput);
                if (!Number.isFinite(v) || v <= 0) {
                  toast.error("Enter a positive number");
                  return;
                }
                if (!confirm(`Set BSC auto-credit limit to $${v.toLocaleString()}?`)) return;
                saveThreshold.mutate(v);
              }}
            >
              {saveThreshold.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
              Save
            </Button>
            {threshold?.updated_at && (
              <div className="text-[11px] text-muted-foreground">
                Last updated {format(new Date(threshold.updated_at), "MMM d, HH:mm")}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-1.5 mb-4">
        {(["manual_review", "rejected", "credited"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
            className="text-xs capitalize"
          >
            {f.replace("_", " ")}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : !events?.length ? (
        <div className="text-center py-20 text-muted-foreground">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No {filter.replace("_", " ")} deposits</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((ev: any) => (
            <div key={ev.id} className="border border-border rounded-xl p-4 bg-card">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={statusColors[ev.status] || ""} variant="outline">
                      {ev.status.replace("_", " ")}
                    </Badge>
                    <span className="text-2xl font-bold">${Number(ev.amount_usd).toFixed(2)}</span>
                    <Badge variant="outline" className="text-[10px] font-mono">{ev.token}</Badge>
                  </div>
                  <div className="text-sm font-medium">{ev.display_name}</div>
                  <div className="text-xs text-muted-foreground font-mono truncate">
                    {ev.email || ev.user_id}
                  </div>
                </div>
                {ev.status === "manual_review" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      disabled={actionMutation.isPending}
                      onClick={() => {
                        if (confirm(`Re-verify receipt on-chain, approve, and credit $${Number(ev.amount_usd).toFixed(2)} to ${ev.display_name}?`)) {
                          actionMutation.mutate({ eventId: ev.id, action: "approve" });
                        }
                      }}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={actionMutation.isPending}
                      onClick={() => {
                        const reason = window.prompt("Reason for rejecting this deposit?");
                        if (!reason || !reason.trim()) return;
                        actionMutation.mutate({ eventId: ev.id, action: "reject", reason: reason.trim() });
                      }}
                    >
                      <XCircle className="w-4 h-4 mr-1" /> Reject
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                <DetailRow label="Tx hash" value={ev.tx_hash} copyable onCopy={copy} link={`https://bscscan.com/tx/${ev.tx_hash}`} />
                <DetailRow label="Log index" value={String(ev.log_index)} />
                <DetailRow label="Block" value={String(ev.block_number)} />
                <DetailRow label="Confirmations" value={String(ev.confirmations)} />
                <DetailRow label="From" value={ev.from_address} copyable onCopy={copy} link={`https://bscscan.com/address/${ev.from_address}`} />
                <DetailRow label="To (user addr)" value={ev.address} copyable onCopy={copy} link={`https://bscscan.com/address/${ev.address}`} />
                <DetailRow label="Token contract" value={ev.token_contract} copyable onCopy={copy} />
                <DetailRow label="Amount (wei)" value={ev.amount_wei} />
                <DetailRow label="Detected" value={format(new Date(ev.detected_at), "MMM d, HH:mm:ss")} />
                {ev.reviewed_at && (
                  <DetailRow label="Reviewed" value={format(new Date(ev.reviewed_at), "MMM d, HH:mm:ss")} />
                )}
                {ev.review_reason && (
                  <div className="sm:col-span-2 mt-2 p-2 rounded-md bg-muted/50 border border-border">
                    <span className="text-muted-foreground">Reason: </span>
                    <span className="font-medium">{ev.review_reason}</span>
                  </div>
                )}
              </div>

              {/* Audit history */}
              {auditMap?.[ev.id]?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                    Audit trail
                  </div>
                  <div className="space-y-2">
                    {auditMap[ev.id].map((a: any) => {
                      const v = a.details?.verification || {};
                      const isApprove = a.action === "bsc_deposit_approve";
                      return (
                        <details key={a.id} className="text-xs rounded-md border border-border bg-muted/30 p-2">
                          <summary className="cursor-pointer flex items-center gap-2 list-none">
                            <Badge
                              variant="outline"
                              className={isApprove
                                ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/20"
                                : "bg-destructive/15 text-destructive border-destructive/20"}
                            >
                              {isApprove ? "Approved" : "Rejected"}
                            </Badge>
                            <span className="font-medium">{a.actor_name}</span>
                            <span className="text-muted-foreground">
                              {format(new Date(a.created_at), "MMM d, HH:mm:ss")}
                            </span>
                            <span className="text-muted-foreground ml-auto">click to expand</span>
                          </summary>
                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 font-mono">
                            <div><span className="text-muted-foreground">Receipt status: </span>{v.receipt_status ?? "—"}</div>
                            <div>
                              <span className="text-muted-foreground">Receipt match: </span>
                              <span className={v.receipt_match ? "text-emerald-500" : "text-destructive"}>
                                {v.receipt_match ? "✓ verified" : "✗ mismatch"}
                              </span>
                            </div>
                            <div><span className="text-muted-foreground">Confirmations: </span>{v.confirmations_observed} / {v.confirmations_required}</div>
                            <div><span className="text-muted-foreground">Threshold: </span>${Number(v.threshold_usd ?? 0).toLocaleString()}</div>
                            <div><span className="text-muted-foreground">Amount (expected): </span>${Number(v.expected?.amount_usd ?? 0).toFixed(2)}</div>
                            <div className="truncate" title={v.expected?.recipient}><span className="text-muted-foreground">Recipient: </span>{v.expected?.recipient}</div>
                            {v.rpc_error && (
                              <div className="sm:col-span-2 text-destructive">RPC error: {String(v.rpc_error)}</div>
                            )}
                            {!isApprove && a.details?.reason && (
                              <div className="sm:col-span-2"><span className="text-muted-foreground">Reason: </span>{a.details.reason}</div>
                            )}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const DetailRow = ({
  label, value, copyable, onCopy, link,
}: { label: string; value: string; copyable?: boolean; onCopy?: (v: string) => void; link?: string }) => (
  <div className="flex items-center gap-2 min-w-0">
    <span className="text-muted-foreground shrink-0">{label}:</span>
    <span className="font-mono truncate flex-1" title={value}>{value}</span>
    {copyable && (
      <button onClick={() => onCopy?.(value)} className="text-muted-foreground hover:text-foreground shrink-0">
        <Copy className="w-3 h-3" />
      </button>
    )}
    {link && (
      <a href={link} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary shrink-0">
        <ExternalLink className="w-3 h-3" />
      </a>
    )}
  </div>
);

export default AdminBscReview;
