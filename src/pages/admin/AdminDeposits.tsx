import { useState } from "react";
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
} from "lucide-react";

const PAGE_SIZE = 20;

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  pending: { label: "Pending", variant: "outline", icon: Clock },
  partial: { label: "Partial", variant: "secondary", icon: AlertTriangle },
  expired: { label: "Expired", variant: "destructive", icon: Clock },
  confirmed: { label: "Confirmed", variant: "default", icon: CheckCircle2 },
};

const AdminDeposits = () => {
  const { canEdit } = useAdminContext();
  const { isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");

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
        .select("id, user_id, amount, status, nowpayments_payment_id, payment_provider, created_at", { count: "exact" })
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
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-1 transition-transform ${isLoading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

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
        <div className="flex gap-1.5">
          {[
            { value: "all", label: "All" },
            { value: "pending,partial", label: "Active" },
            { value: "pending", label: "Pending" },
            { value: "partial", label: "Partial" },
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
                   <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                   <th className="text-left px-4 py-3 font-medium text-muted-foreground">Provider</th>
                   <th className="text-left px-4 py-3 font-medium text-muted-foreground">Payment ID</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                  {canEdit && <th className="text-right px-4 py-3 font-medium text-muted-foreground">Action</th>}
                </tr>
              </thead>
              <tbody>
                {data.deposits.map((d) => {
                  const sc = statusConfig[d.status] || statusConfig.pending;
                  const StatusIcon = sc.icon;
                  return (
                    <tr key={d.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm">{d.display_name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[140px]">{d.email || d.user_id.slice(0, 8)}</div>
                      </td>
                      <td className="px-4 py-3 font-bold">${Number(d.amount).toFixed(2)}</td>
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
                        <span className="font-mono text-xs text-muted-foreground">
                          {d.nowpayments_payment_id || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(d.created_at), "MMM d, HH:mm")}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          {(d.status === "pending" || d.status === "partial" || d.status === "expired") && (
                            <div className="flex items-center justify-end gap-1.5">
                              {editingId === d.id ? (
                                <>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    max={Number(d.amount)}
                                    value={editAmount}
                                    onChange={(e) => setEditAmount(e.target.value)}
                                    className="w-24 h-8 text-xs"
                                    placeholder="Amount"
                                  />
                                  <Button
                                    size="sm"
                                    className="text-xs h-8"
                                    disabled={confirmMutation.isPending || !editAmount || Number(editAmount) <= 0 || Number(editAmount) > Number(d.amount)}
                                    onClick={() => {
                                      if (confirm(`Credit $${Number(editAmount).toFixed(2)} (partial) for ${d.display_name}?`)) {
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
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs gap-1 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
                                    disabled={confirmMutation.isPending}
                                    onClick={() => {
                                      if (confirm(`Confirm FULL $${Number(d.amount).toFixed(2)} deposit for ${d.display_name}?`)) {
                                        confirmMutation.mutate({ txId: d.id, userId: d.user_id, amount: Number(d.amount) });
                                      }
                                    }}
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Full
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="text-xs gap-1"
                                    disabled={confirmMutation.isPending}
                                    onClick={() => { setEditingId(d.id); setEditAmount(String(d.amount)); }}
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    Partial
                                  </Button>
                                </>
                              )}
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
