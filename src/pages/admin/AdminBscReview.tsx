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

  const approveMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { data, error } = await supabase.rpc("admin_approve_bsc_deposit" as any, { _event_id: eventId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Deposit approved and credited");
      qc.invalidateQueries({ queryKey: ["bsc-review-events"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to approve"),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ eventId, reason }: { eventId: string; reason: string }) => {
      const { error } = await supabase.rpc("admin_reject_bsc_deposit" as any, {
        _event_id: eventId,
        _reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deposit rejected");
      qc.invalidateQueries({ queryKey: ["bsc-review-events"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to reject"),
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
                      disabled={approveMutation.isPending}
                      onClick={() => {
                        if (confirm(`Approve and credit $${Number(ev.amount_usd).toFixed(2)} to ${ev.display_name}?`)) {
                          approveMutation.mutate(ev.id);
                        }
                      }}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={rejectMutation.isPending}
                      onClick={() => {
                        const reason = window.prompt("Reason for rejecting this deposit?");
                        if (!reason || !reason.trim()) return;
                        rejectMutation.mutate({ eventId: ev.id, reason: reason.trim() });
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
