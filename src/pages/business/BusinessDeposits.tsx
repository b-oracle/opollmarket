import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessContext } from "./BusinessLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AdminPagination from "@/components/admin/AdminPagination";
import { format } from "date-fns";
import {
  ArrowDownToLine,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
  Search,
  RefreshCw,
  DollarSign,
  TrendingUp,
  Users,
} from "lucide-react";

const PAGE_SIZE = 20;

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  pending: { label: "Pending", variant: "outline", icon: Clock },
  partial: { label: "Partial", variant: "secondary", icon: AlertTriangle },
  expired: { label: "Expired", variant: "destructive", icon: Clock },
  confirmed: { label: "Confirmed", variant: "default", icon: CheckCircle2 },
};

const BusinessDeposits = () => {
  const { userId } = useBusinessContext();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Fetch API keys owned by this business user
  const { data: apiKeyIds } = useQuery({
    queryKey: ["business-api-keys-ids", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("api_keys" as any)
        .select("id, api_key")
        .eq("owner_id", userId);
      return (data as any[]) || [];
    },
  });

  // Fetch deposits made by users created through this business's API keys
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["business-deposits", page, statusFilter, search, apiKeyIds?.map((k: any) => k.id)],
    enabled: !!apiKeyIds,
    queryFn: async () => {
      const keyIds = (apiKeyIds || []).map((k: any) => k.id);

      if (keyIds.length === 0) {
        return { deposits: [], total: 0, stats: { totalDeposited: 0, confirmedCount: 0, pendingCount: 0, uniqueUsers: 0 } };
      }

      // Get users created through this business's API keys
      // Users created via API have their api_key_id logged — we find them through profiles or transactions
      // Since api_key_id is on markets, we find users who have deposited and were associated with these API keys
      // The simplest approach: find all transactions where the user has an api_key_id market
      // Better approach: query deposits directly and join with profiles that have transactions on API-key markets

      // For the business deposits page, we show ALL deposits from users who have interacted with markets
      // created via the business's API keys
      let query = supabase
        .from("transactions")
        .select("id, user_id, amount, status, nowpayments_payment_id, payment_provider, created_at", { count: "exact" })
        .eq("type", "deposit");

      if (statusFilter !== "all") {
        const statuses = statusFilter.split(",").filter(Boolean);
        query = query.in("status", statuses);
      }

      if (search.trim()) {
        query = query.ilike("nowpayments_payment_id", `%${search.trim()}%`);
      }

      query = query
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      // Get users who have bet on markets created by this business's API keys
      const { data: apiMarkets } = await supabase
        .from("markets")
        .select("id")
        .in("api_key_id", keyIds);

      const marketIds = (apiMarkets || []).map(m => m.id);

      if (marketIds.length === 0) {
        return { deposits: [], total: 0, stats: { totalDeposited: 0, confirmedCount: 0, pendingCount: 0, uniqueUsers: 0 } };
      }

      // Get unique user IDs who have traded on these markets
      const { data: traderTxs } = await supabase
        .from("transactions")
        .select("user_id")
        .in("market_id", marketIds)
        .eq("type", "buy")
        .eq("status", "confirmed");

      const traderUserIds = [...new Set((traderTxs || []).map(t => t.user_id))];

      if (traderUserIds.length === 0) {
        return { deposits: [], total: 0, stats: { totalDeposited: 0, confirmedCount: 0, pendingCount: 0, uniqueUsers: 0 } };
      }

      // Now fetch deposits for these users
      let depositQuery = supabase
        .from("transactions")
        .select("id, user_id, amount, status, nowpayments_payment_id, payment_provider, created_at", { count: "exact" })
        .eq("type", "deposit")
        .in("user_id", traderUserIds);

      if (statusFilter !== "all") {
        const statuses = statusFilter.split(",").filter(Boolean);
        depositQuery = depositQuery.in("status", statuses);
      }

      if (search.trim()) {
        depositQuery = depositQuery.ilike("nowpayments_payment_id", `%${search.trim()}%`);
      }

      depositQuery = depositQuery
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      const { data: txs, count, error } = await depositQuery;
      if (error) throw error;

      // Get profiles for display
      const userIds = [...new Set((txs || []).map(t => t.user_id))];
      const { data: profiles } = userIds.length
        ? await supabase.rpc("admin_get_profiles_with_email", { _ids: userIds })
        : { data: [] };

      const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

      // Compute aggregate stats
      const { data: allDeposits } = await supabase
        .from("transactions")
        .select("amount, status, user_id")
        .eq("type", "deposit")
        .in("user_id", traderUserIds)
        .eq("status", "confirmed");

      const totalDeposited = (allDeposits || []).reduce((s, d) => s + Number(d.amount), 0);
      const uniqueUsers = new Set((allDeposits || []).map(d => d.user_id)).size;

      // Pending count
      const { count: pendingCount } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("type", "deposit")
        .in("user_id", traderUserIds)
        .in("status", ["pending", "partial"]);

      return {
        deposits: (txs || []).map(t => ({
          ...t,
          display_name: profileMap[t.user_id]?.display_name || "Unknown",
          email: profileMap[t.user_id]?.email || "",
        })),
        total: count || 0,
        stats: {
          totalDeposited,
          confirmedCount: (allDeposits || []).length,
          pendingCount: pendingCount || 0,
          uniqueUsers,
        },
      };
    },
  });

  const stats = data?.stats;

  const statCards = [
    { label: "Total Deposited", value: `$${(stats?.totalDeposited || 0).toFixed(2)}`, icon: DollarSign, color: "text-emerald-500" },
    { label: "Confirmed Deposits", value: stats?.confirmedCount || 0, icon: CheckCircle2, color: "text-primary" },
    { label: "Pending / Partial", value: stats?.pendingCount || 0, icon: Clock, color: "text-amber-500" },
    { label: "Unique Depositors", value: stats?.uniqueUsers || 0, icon: Users, color: "text-blue-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ArrowDownToLine className="w-5 h-5 text-primary" />
            Deposits
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Deposits from users who interact with your markets
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map(c => (
          <div key={c.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <c.icon className={`w-4 h-4 ${c.color}`} />
              <p className="text-[11px] text-muted-foreground font-medium">{c.label}</p>
            </div>
            <p className="text-lg font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by payment ID..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[
            { value: "all", label: "All" },
            { value: "pending,partial", label: "Active" },
            { value: "confirmed", label: "Confirmed" },
            { value: "expired", label: "Expired" },
          ].map(f => (
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
          <p className="text-xs mt-1">Deposits will appear here once users interact with your API markets</p>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
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
                </tr>
              </thead>
              <tbody>
                {data.deposits.map((d: any) => {
                  const sc = statusConfig[d.status] || statusConfig.pending;
                  const StatusIcon = sc.icon;
                  return (
                    <tr key={d.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm">{d.display_name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[140px]">
                          {d.email || d.user_id.slice(0, 8)}
                        </div>
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
                          {d.payment_provider === "flutterwave" ? "FLW" : d.payment_provider === "payaza" ? "Payaza" : "Crypto"}
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AdminPagination page={page} totalItems={data?.total || 0} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default BusinessDeposits;
