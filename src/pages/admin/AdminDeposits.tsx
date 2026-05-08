import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminContext } from "./AdminLayout";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import AdminPagination from "@/components/admin/AdminPagination";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  CheckCircle2,
  Loader2,
  Search,
  ArrowDownToLine,
  RefreshCw,
  AlertTriangle,
  Clock,
  Plus,
  X,
  Sparkles,
  Repeat,
  EyeOff,
} from "lucide-react";

const PAGE_SIZE = 20;

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  pending: { label: "Pending", variant: "outline", icon: Clock },
  partial: { label: "Partial", variant: "secondary", icon: AlertTriangle },
  wrong_asset: { label: "Wrong Asset", variant: "destructive", icon: AlertTriangle },
  expired: { label: "Expired", variant: "destructive", icon: Clock },
  confirmed: { label: "Confirmed", variant: "default", icon: CheckCircle2 },
};

const AdminDeposits = () => {
  const { canEdit } = useAdminContext();
  const { isSuperAdmin, isAdmin, isSupport } = useAuth();
  // Anyone with admin/support access can confirm/credit deposits to handle user issues
  const canHandleDeposits = isSuperAdmin || isAdmin || isSupport;
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const pendingReplayRef = useRef<{ txId: string; expectedRef: string } | null>(null);

  // Mask a payment ID so it can't be copy-pasted; admin must verify externally.
  function maskPaymentId(id: string | null): string {
    if (!id) return "—";
    if (id.length <= 12) return "•".repeat(id.length);
    const visibleStart = id.slice(0, 4);
    const visibleEnd = id.slice(-4);
    return `${visibleStart}…${visibleEnd}`;
  }

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-deposits", page, statusFilter, search],
    queryFn: async () => {
      const statuses = statusFilter.split(",").filter(Boolean);
      const trimmed = search.trim();

      // If searching by email, resolve user IDs first
      let emailUserIds: string[] | null = null;
      if (trimmed && !isValidUUID(trimmed)) {
        const { data: matchedProfiles } = await supabase
          .from("profiles")
          .select("id")
          .or(`email.ilike.%${trimmed}%,display_name.ilike.%${trimmed}%`);
        emailUserIds = (matchedProfiles || []).map((p) => p.id);
      }

      let query = supabase
        .from("transactions")
        .select("id, user_id, amount, gross_amount_usd, net_amount_usd, status, nowpayments_payment_id, payment_provider, created_at", { count: "exact" })
        .eq("type", "deposit");

      if (statusFilter !== "all") {
        const statuses = statusFilter.split(",").filter(Boolean);
        query = query.in("status", statuses);
      }

      query = query
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (trimmed) {
        if (isValidUUID(trimmed)) {
          query = query.or(`user_id.eq.${trimmed},nowpayments_payment_id.ilike.%${trimmed}%`);
        } else if (emailUserIds && emailUserIds.length > 0) {
          query = query.in("user_id", emailUserIds);
        } else if (emailUserIds && emailUserIds.length === 0) {
          // No matching users — try payment ID match only
          query = query.ilike("nowpayments_payment_id", `%${trimmed}%`);
        }
      }

      const { data: txs, count, error } = await query;
      if (error) throw error;

      const userIds = [...new Set((txs || []).map((t) => t.user_id))];
      const { data: profiles } = userIds.length
        ? await supabase.from("profiles").select("id, display_name, email").in("id", userIds)
        : { data: [] };

      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));

      return {
        deposits: (txs || []).map((t) => ({
          ...t,
          display_name: profileMap[t.user_id]?.display_name || "Unknown",
          email: profileMap[t.user_id]?.email || "",
        })),
        total: count || 0,
      };
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async ({ txId, userId, amount }: { txId: string; userId: string; amount: number }) => {
      // Use the edge function to credit balance + update tx
      const { data, error } = await supabase.functions.invoke("confirm-deposit-admin", {
        body: { transaction_id: txId, user_id: userId, amount },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Failed");
      return data;
    },
    onSuccess: () => {
      toast.success("Deposit confirmed and balance credited");
      queryClient.invalidateQueries({ queryKey: ["admin-deposits"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to confirm deposit");
    },
  });

  // Super-admin webhook replay — idempotent: if already confirmed, returns no-op.
  // If Payaza API is unreachable (IP not whitelisted) the function returns
  // { code: "PAYAZA_AUTH" }. We then prompt the admin for the Payaza reference
  // they verified manually and retry with manual_override: true.
  const replayMutation = useMutation({
    mutationFn: async ({
      txId, manualOverride, manualReference, manualNote,
    }: {
      txId: string;
      manualOverride?: boolean;
      manualReference?: string;
      manualNote?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("replay-deposit-webhook", {
        body: {
          transaction_id: txId,
          ...(manualOverride ? {
            manual_override: true,
            manual_reference: manualReference,
            manual_note: manualNote,
          } : {}),
        },
      });
      if (error) throw new Error(error.message || "Failed");
      return { ...data, _txId: txId } as any;
    },
    onSuccess: (data: any) => {
      if (data?.code === "PAYAZA_AUTH") {
        const expectedRef = pendingReplayRef.current?.expectedRef || "";
        if (!expectedRef) {
          toast.error("Session expired. Please click Replay again.");
          return;
        }
        const ref = window.prompt(
          "Payaza API is unreachable (IP not whitelisted).\n\n" +
          "Enter the EXACT Payaza payment reference for this deposit.\n" +
          "You must verify this independently in the Payaza dashboard — it is not shown here.\n\n" +
          "⚠️ Wrong reference = rejection. Each reference can only be used once."
        );
        if (!ref || !ref.trim()) {
          toast.error("Manual credit cancelled — no reference provided");
          return;
        }
        if (ref.trim() !== expectedRef) {
          toast.error("The reference you entered does not match this transaction's payment ID.");
          return;
        }
        const note = window.prompt("Optional note (why this needed manual credit):") || "";
        replayMutation.mutate({
          txId: data._txId,
          manualOverride: true,
          manualReference: ref.trim(),
          manualNote: note.trim() || undefined,
        });
        return;
      }
      if (data?.code === "DUPLICATE_REFERENCE") {
        toast.error(data.error || "This Payaza reference has already been used.");
        return;
      }
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      if (data?.already_confirmed) {
        toast.info("Already credited — no action taken");
      } else if (data?.manual_override) {
        toast.success(`Manually credited $${Number(data.credited_main ?? 0).toFixed(2)} (ref: ${data.reference})`);
      } else {
        toast.success(`Replayed: credited $${Number(data.credited_main ?? data.credited ?? 0).toFixed(2)}`);
      }
      pendingReplayRef.current = null;
      queryClient.invalidateQueries({ queryKey: ["admin-deposits"] });
    },
    onError: (err: any) => {
      pendingReplayRef.current = null;
      toast.error(err.message || "Failed to replay webhook");
    },
  });

  // ── Admin Direct Credit ──
  const [showCreditForm, setShowCreditForm] = useState(false);
  const [creditUserId, setCreditUserId] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditDescription, setCreditDescription] = useState("");

  const creditMutation = useMutation({
    mutationFn: async ({ user_id, amount, description }: { user_id: string; amount: number; description: string }) => {
      const { data, error } = await supabase.functions.invoke("admin-credit-deposit", {
        body: { user_id, amount, description },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Failed");
      return data;
    },
    onSuccess: () => {
      toast.success(`$${Number(creditAmount).toFixed(2)} credited successfully`);
      queryClient.invalidateQueries({ queryKey: ["admin-deposits"] });
      setShowCreditForm(false);
      setCreditUserId("");
      setCreditAmount("");
      setCreditDescription("");
    },
    onError: (err: any) => toast.error(err.message || "Failed to credit deposit"),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowDownToLine className="w-6 h-6 text-primary" />
            Deposits
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage pending and partial deposits
          </p>
        </div>
        <div className="flex gap-2">
          {canHandleDeposits && (
            <Button variant="default" size="sm" onClick={() => setShowCreditForm(!showCreditForm)}>
              {showCreditForm ? <X className="w-4 h-4 mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              {showCreditForm ? "Cancel" : "Credit Deposit"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-1 transition-transform ${isLoading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Direct Credit Form */}
      {showCreditForm && (
        <div className="border border-primary/20 bg-primary/5 rounded-xl p-4 mb-6 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            Credit Deposit Directly
          </h3>
          <p className="text-xs text-muted-foreground">
            Credit a user's balance without going through a payment provider. An audit trail and transaction record will be created.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              placeholder="User ID (UUID)"
              value={creditUserId}
              onChange={(e) => setCreditUserId(e.target.value)}
              className="font-mono text-xs"
            />
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max="100000"
              placeholder="Amount ($)"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
            />
            <Input
              placeholder="Description (optional)"
              value={creditDescription}
              onChange={(e) => setCreditDescription(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            disabled={
              creditMutation.isPending ||
              !creditUserId.trim() ||
              !creditAmount ||
              Number(creditAmount) <= 0 ||
              !isValidUUID(creditUserId.trim())
            }
            onClick={() => {
              if (confirm(`Credit $${Number(creditAmount).toFixed(2)} to user ${creditUserId.trim()}?`)) {
                creditMutation.mutate({
                  user_id: creditUserId.trim(),
                  amount: Number(creditAmount),
                  description: creditDescription.trim(),
                });
              }
            }}
          >
            {creditMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
            Confirm Credit
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by email, name, payment ID, or user ID..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[
            { value: "all", label: "All" },
            { value: "pending,partial,wrong_asset", label: "Active" },
            { value: "pending", label: "Pending" },
            { value: "partial", label: "Partial" },
            { value: "wrong_asset", label: "Wrong Asset" },
            { value: "expired", label: "Expired" },
            { value: "confirmed", label: "Confirmed" },
          ].map((f) => (
            <Button
              key={f.value}
              variant={statusFilter === f.value ? "default" : "outline"}
              size="sm"
              onClick={() => { setStatusFilter(f.value); setPage(1); }}
              className="text-xs"
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : !data?.deposits.length ? (
        <div className="text-center py-20 text-muted-foreground">
          <ArrowDownToLine className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No deposits found</p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Amount</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Received (Gross / Net)</th>
                   <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                   <th className="text-left px-4 py-3 font-medium text-muted-foreground">Provider</th>
                   <th className="text-left px-4 py-3 font-medium text-muted-foreground">Payment ID</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                  {canHandleDeposits && <th className="text-right px-4 py-3 font-medium text-muted-foreground">Action</th>}
                </tr>
              </thead>
              <tbody>
                {data.deposits.map((d) => {
                  const sc = statusConfig[d.status] || statusConfig.pending;
                  const StatusIcon = sc.icon;
                  const gross = (d as any).gross_amount_usd != null ? Number((d as any).gross_amount_usd) : null;
                  const net = (d as any).net_amount_usd != null ? Number((d as any).net_amount_usd) : null;
                  // Max admin can credit = gross received (NOT capped by original requested amount).
                  const maxCredit = gross && gross > 0 ? gross : Number(d.amount);
                  // Preferred one-click credit value: net (after fees) > gross > original amount
                  const netCredit = net && net > 0 ? net : maxCredit;
                  const requested = Number(d.amount);
                  const isOverpayment = gross != null && gross > requested * 1.01;
                  const canConfirm = d.status === "partial" || d.status === "wrong_asset";
                  return (
                    <tr key={d.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm">{d.display_name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[140px]">{d.email || d.user_id.slice(0, 8)}</div>
                      </td>
                      <td className="px-4 py-3 font-bold">${Number(d.amount).toFixed(2)}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {gross != null ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono">G: ${gross.toFixed(2)}</span>
                            <span className="font-mono text-muted-foreground">N: ${(net ?? gross).toFixed(2)}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={sc.variant} className="gap-1">
                          <StatusIcon className="w-3 h-3" />
                          {sc.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {(d as any).payment_provider === "flutterwave" ? "FLW" : (d as any).payment_provider === "payaza" ? "Payaza" : "Crypto"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-muted-foreground inline-flex items-center gap-1" title="Hidden to prevent copy-paste. Verify in Payaza dashboard.">
                          <EyeOff className="w-3 h-3" />
                          {maskPaymentId(d.nowpayments_payment_id)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(d.created_at), "MMM d, HH:mm")}
                      </td>
                      {canHandleDeposits && (
                        <td className="px-4 py-3 text-right">
                          {canConfirm && (
                            <div className="flex items-center justify-end gap-1.5">
                              {editingId === d.id ? (
                                <>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    max={maxCredit}
                                    value={editAmount}
                                    onChange={(e) => setEditAmount(e.target.value)}
                                    className="w-24 h-8 text-xs"
                                    placeholder="Amount"
                                  />
                                  <Button
                                    size="sm"
                                    className="text-xs h-8"
                                    disabled={confirmMutation.isPending || !editAmount || Number(editAmount) <= 0 || Number(editAmount) > maxCredit}
                                    onClick={() => {
                                      if (confirm(`Credit $${Number(editAmount).toFixed(2)} for ${d.display_name}? (Max received: $${maxCredit.toFixed(2)})`)) {
                                        confirmMutation.mutate({ txId: d.id, userId: d.user_id, amount: Number(editAmount) });
                                        setEditingId(null);
                                      }
                                    }}
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="text-xs h-8 px-2" onClick={() => setEditingId(null)}>✕</Button>
                                </>
                              ) : (
                                <>
                                  {isOverpayment && (
                                    <Button
                                      size="sm"
                                      className="text-xs gap-1"
                                      variant="default"
                                      disabled={confirmMutation.isPending}
                                      onClick={() => {
                                        if (
                                          confirm(
                                            `Resolve as Overpayment?\n\nRequested: $${requested.toFixed(2)}\nReceived (gross): $${(gross ?? 0).toFixed(2)}\nNet credit: $${netCredit.toFixed(2)}\n\nThis will confirm the deposit and credit $${netCredit.toFixed(2)} to ${d.display_name}.`,
                                          )
                                        ) {
                                          confirmMutation.mutate({ txId: d.id, userId: d.user_id, amount: netCredit });
                                        }
                                      }}
                                    >
                                      <Sparkles className="w-3.5 h-3.5" />
                                      Resolve as Overpayment (${netCredit.toFixed(2)})
                                    </Button>
                                  )}
                                  {!isOverpayment && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs gap-1 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
                                      disabled={confirmMutation.isPending}
                                      onClick={() => {
                                        if (confirm(`Confirm net received $${netCredit.toFixed(2)} deposit for ${d.display_name}?`)) {
                                          confirmMutation.mutate({ txId: d.id, userId: d.user_id, amount: netCredit });
                                        }
                                      }}
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      Net (${netCredit.toFixed(2)})
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="text-xs gap-1"
                                    disabled={confirmMutation.isPending}
                                    onClick={() => { setEditingId(d.id); setEditAmount(String(netCredit)); }}
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    Custom
                                  </Button>
                                </>
                              )}
                            </div>
                          )}
                          {d.status === "pending" && !canHandleDeposits && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              No action needed
                            </Badge>
                          )}
                          {isSuperAdmin && d.status !== "confirmed" && (
                            <div className="flex justify-end mt-1.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-[11px] gap-1 h-7 text-muted-foreground hover:text-foreground"
                                disabled={replayMutation.isPending}
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Replay webhook for ${d.display_name}?\n\nAmount: $${Number(d.amount).toFixed(2)}\nStatus: ${d.status}\nPayment ID: ${d.nowpayments_payment_id || "—"}\n\nIf already credited, this is a no-op (no double credit).`,
                                    )
                                  ) {
                                    replayMutation.mutate({ txId: d.id });
                                  }
                                }}
                                title="Super-admin: replay webhook (idempotent)"
                              >
                                <Repeat className="w-3.5 h-3.5" />
                                Replay
                              </Button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-4">
        <AdminPagination page={page} totalItems={data?.total || 0} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>

    </div>
  );
};

function isValidUUID(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export default AdminDeposits;
