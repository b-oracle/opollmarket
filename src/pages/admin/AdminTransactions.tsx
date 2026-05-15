import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowUpRight, ArrowDownLeft, BarChart3, Download, ChevronLeft, ChevronRight, Search, X } from "lucide-react";

interface TxRow {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  side: string | null;
  option_id: string | null;
  shares: number | null;
  price: number | null;
  status: string;
  market_id: string | null;
  created_at: string;
  market_title?: string;
  user_email?: string;
  option_label?: string;
}

const TYPE_STYLES: Record<string, { label: string; class: string }> = {
  deposit: { label: "Deposit", class: "bg-green-500/10 text-green-500" },
  withdrawal: { label: "Withdrawal", class: "bg-yellow-500/10 text-yellow-500" },
  buy: { label: "Prediction", class: "bg-primary/10 text-primary" },
  bet: { label: "Prediction", class: "bg-primary/10 text-primary" },
  payout: { label: "Payout", class: "bg-blue-500/10 text-blue-500" },
  commission: { label: "Commission", class: "bg-purple-500/10 text-purple-500" },
};

const AdminTransactions = () => {
  const [txns, setTxns] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "deposit" | "withdrawal" | "buy" | "payout">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "confirmed" | "pending" | "failed">("all");
  const [totals, setTotals] = useState({ deposits: 0, withdrawals: 0, bets: 0 });
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const PAGE_SIZE = 25;

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // If searching, find matching user/market IDs first
      let matchingUserIds: string[] | null = null;
      let matchingMarketIds: string[] | null = null;

      if (debouncedSearch) {
        const searchTerm = `%${debouncedSearch}%`;
        const [profilesSearch, marketsSearch] = await Promise.all([
          supabase.rpc("admin_search_profiles", { _term: debouncedSearch, _limit: 1000, _offset: 0 }),
          supabase.from("markets").select("id").ilike("title", searchTerm),
        ]);
        const searchRow: any = profilesSearch.data?.[0];
        const profileRows: any[] = Array.isArray(searchRow?.rows) ? searchRow.rows : [];
        matchingUserIds = profileRows.map((p: any) => p.id);
        matchingMarketIds = marketsSearch.data?.map((m) => m.id) || [];

        if (matchingUserIds.length === 0 && matchingMarketIds.length === 0) {
          setTxns([]);
          setTotalCount(0);
          setTotals({ deposits: 0, withdrawals: 0, bets: 0 });
          setLoading(false);
          return;
        }
      }

      const applySearchFilter = (q: any) => {
        if (!matchingUserIds && !matchingMarketIds) return q;
        const parts: string[] = [];
        if (matchingUserIds && matchingUserIds.length > 0) parts.push(`user_id.in.(${matchingUserIds.join(",")})`);
        if (matchingMarketIds && matchingMarketIds.length > 0) parts.push(`market_id.in.(${matchingMarketIds.join(",")})`);
        return q.or(parts.join(","));
      };

      // Get total count
      let countQuery = supabase.from("transactions").select("*", { count: "exact", head: true });
      if (filter !== "all") countQuery = countQuery.eq("type", filter);
      if (statusFilter !== "all") {
        if (statusFilter === "failed") countQuery = countQuery.in("status", ["failed", "expired"]);
        else countQuery = countQuery.eq("status", statusFilter);
      }
      countQuery = applySearchFilter(countQuery);
      const { count } = await countQuery;
      setTotalCount(count ?? 0);

      // Compute totals across ALL matching rows (not just current page)
      const applyStatusFilterQ = (q: any) => {
        if (statusFilter === "all") return q;
        if (statusFilter === "failed") return q.in("status", ["failed", "expired"]);
        return q.eq("status", statusFilter);
      };

      const buildTotalQuery = (type: string) => {
        let q = supabase.from("transactions").select("amount").eq("type", type);
        if (statusFilter === "all") {
          // Always exclude pending/expired from totals — only count confirmed/partial
          q = q.in("status", ["confirmed", "partial"]);
        } else {
          q = applyStatusFilterQ(q);
        }
        q = applySearchFilter(q);
        return q;
      };

      const [depRes, wdRes, betRes] = await Promise.all([
        buildTotalQuery("deposit"),
        buildTotalQuery("withdrawal"),
        buildTotalQuery("buy"),
      ]);

      setTotals({
        deposits: (depRes.data || []).reduce((s, r) => s + Number(r.amount), 0),
        withdrawals: (wdRes.data || []).reduce((s, r) => s + Number(r.amount), 0),
        bets: (betRes.data || []).reduce((s, r) => s + Number(r.amount), 0),
      });

      // Get page
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let query = supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (filter !== "all") query = query.eq("type", filter);
      if (statusFilter !== "all") {
        if (statusFilter === "failed") query = query.in("status", ["failed", "expired"]);
        else query = query.eq("status", statusFilter);
      }
      query = applySearchFilter(query);

      const { data } = await query;

      if (!data) { setLoading(false); return; }

      // Enrich with market titles and user emails
      const marketIds = [...new Set(data.filter((t) => t.market_id).map((t) => t.market_id!))];
      const userIds = [...new Set(data.map((t) => t.user_id))];
      const optionIds = [...new Set(data.filter((t) => t.option_id).map((t) => t.option_id!))];

      const [marketsRes, profilesRes, optionsRes] = await Promise.all([
        marketIds.length > 0
          ? supabase.from("markets").select("id, title").in("id", marketIds)
          : Promise.resolve({ data: [] }),
        userIds.length > 0
          ? supabase.rpc("admin_get_profiles_with_email", { _ids: userIds })
          : Promise.resolve({ data: [] }),
        optionIds.length > 0
          ? supabase.from("market_options").select("id, label").in("id", optionIds)
          : Promise.resolve({ data: [] }),
      ]);

      const marketMap = new Map<string, string>();
      marketsRes.data?.forEach((m: any) => marketMap.set(m.id, m.title));

      const userMap = new Map<string, string>();
      profilesRes.data?.forEach((p: any) => userMap.set(p.id, p.display_name || p.email || p.id.slice(0, 8)));

      const optionMap = new Map<string, string>();
      optionsRes.data?.forEach((o: any) => optionMap.set(o.id, o.label));

      setTxns(
        data.map((t) => ({
          ...t,
          market_title: t.market_id ? marketMap.get(t.market_id) || "Unknown" : undefined,
          user_email: userMap.get(t.user_id) || t.user_id.slice(0, 8),
          option_label: t.option_id ? optionMap.get(t.option_id) : undefined,
        }))
      );
      setLoading(false);
    };
    fetchData();
  }, [filter, statusFilter, page, debouncedSearch]);

  

  const exportCSV = () => {
    const headers = ["Date", "Type", "User", "Amount", "Side", "Market", "Status"];
    const rows = txns.map((t) => [
      new Date(t.created_at).toISOString(),
      t.type,
      t.user_email || "",
      Number(t.amount),
      t.option_label || t.side || "",
      t.market_title || "",
      t.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-xl sm:text-2xl font-bold">Transactions ({txns.length})</h2>
        <button
          onClick={exportCSV}
          disabled={txns.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 self-start sm:self-auto"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <ArrowDownLeft className="w-4 h-4 text-green-500" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Deposits</span>
          </div>
          <p className="text-xl font-bold">${totals.deposits < 1000 ? totals.deposits.toFixed(2) : (totals.deposits / 1000).toFixed(1) + "K"}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpRight className="w-4 h-4 text-yellow-500" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Withdrawals</span>
          </div>
          <p className="text-xl font-bold">${totals.withdrawals < 1000 ? totals.withdrawals.toFixed(2) : (totals.withdrawals / 1000).toFixed(1) + "K"}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-primary" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Bets</span>
          </div>
          <p className="text-xl font-bold">${totals.bets < 1000 ? totals.bets.toFixed(2) : (totals.bets / 1000).toFixed(1) + "K"}</p>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 min-w-0 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by user or market..."
            className="w-full pl-9 pr-8 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 overflow-x-auto scrollbar-hide">
          {(["all", "deposit", "withdrawal", "buy", "payout"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setPage(0); setFilter(f); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize whitespace-nowrap ${
                filter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "All" : (TYPE_STYLES[f]?.label || f)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-1">
          {(["all", "confirmed", "pending", "failed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setPage(0); setStatusFilter(s); }}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all capitalize whitespace-nowrap ${
                statusFilter === s
                  ? s === "confirmed" ? "bg-green-500/20 text-green-500 ring-1 ring-green-500/30"
                  : s === "pending" ? "bg-yellow-500/20 text-yellow-500 ring-1 ring-yellow-500/30"
                  : s === "failed" ? "bg-destructive/20 text-destructive ring-1 ring-destructive/30"
                  : "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "confirmed" ? "✓ Confirmed" : s === "pending" ? "⏳ Pending" : s === "failed" ? "✗ Failed" : "All Status"}
            </button>
          ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="p-3">Type</th>
                <th className="p-3">User</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Side</th>
                <th className="p-3">Market</th>
                <th className="p-3">Status</th>
                <th className="p-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => {
                const style = TYPE_STYLES[t.type] || { label: t.type, class: "bg-muted text-muted-foreground" };
                return (
                  <tr key={t.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${style.class}`}>
                        {style.label}
                      </span>
                    </td>
                    <td className="p-3 text-xs font-medium truncate max-w-[120px]">{t.user_email}</td>
                    <td className="p-3 font-semibold">${Number(t.amount).toLocaleString()}</td>
                    <td className="p-3">
                      {t.option_label ? (
                        <span className="text-xs font-semibold text-foreground">
                          {t.option_label}
                        </span>
                      ) : t.side ? (
                        <span className={`text-xs font-bold ${t.side === "yes" ? "text-green-500" : "text-red-500"}`}>
                          {t.side.toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground truncate max-w-[180px]">
                      {t.market_title || "—"}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        t.status === "confirmed" ? "bg-green-500/10 text-green-500" :
                        t.status === "pending" ? "bg-yellow-500/10 text-yellow-500" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(t.created_at).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                );
              })}
              {txns.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No transactions found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-2 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(Math.ceil(totalCount / PAGE_SIZE), 7) }, (_, i) => {
              const totalPages = Math.ceil(totalCount / PAGE_SIZE);
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i;
              } else if (page < 3) {
                pageNum = i;
              } else if (page > totalPages - 4) {
                pageNum = totalPages - 7 + i;
              } else {
                pageNum = page - 3 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                    page === pageNum
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-muted-foreground"
                  }`}
                >
                  {pageNum + 1}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(Math.ceil(totalCount / PAGE_SIZE) - 1, p + 1))}
              disabled={page >= Math.ceil(totalCount / PAGE_SIZE) - 1}
              className="p-2 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTransactions;
