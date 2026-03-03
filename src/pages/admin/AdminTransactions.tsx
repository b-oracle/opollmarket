import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowUpRight, ArrowDownLeft, BarChart3, Download, ChevronLeft, ChevronRight } from "lucide-react";

interface TxRow {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  side: string | null;
  shares: number | null;
  price: number | null;
  status: string;
  market_id: string | null;
  created_at: string;
  market_title?: string;
  user_email?: string;
}

const TYPE_STYLES: Record<string, { label: string; class: string }> = {
  deposit: { label: "Deposit", class: "bg-green-500/10 text-green-500" },
  withdrawal: { label: "Withdrawal", class: "bg-yellow-500/10 text-yellow-500" },
  bet: { label: "Bet", class: "bg-primary/10 text-primary" },
  payout: { label: "Payout", class: "bg-blue-500/10 text-blue-500" },
};

const AdminTransactions = () => {
  const [txns, setTxns] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "deposit" | "withdrawal" | "bet" | "payout">("all");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 25;

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // Get total count
      let countQuery = supabase.from("transactions").select("*", { count: "exact", head: true });
      if (filter !== "all") countQuery = countQuery.eq("type", filter);
      const { count } = await countQuery;
      setTotalCount(count ?? 0);

      // Get page
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let query = supabase
        .from("transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (filter !== "all") query = query.eq("type", filter);

      const { data } = await query;

      if (!data) { setLoading(false); return; }

      // Enrich with market titles and user emails
      const marketIds = [...new Set(data.filter((t) => t.market_id).map((t) => t.market_id!))];
      const userIds = [...new Set(data.map((t) => t.user_id))];

      const [marketsRes, profilesRes] = await Promise.all([
        marketIds.length > 0
          ? supabase.from("markets").select("id, title").in("id", marketIds)
          : Promise.resolve({ data: [] }),
        userIds.length > 0
          ? supabase.from("profiles").select("id, email, display_name").in("id", userIds)
          : Promise.resolve({ data: [] }),
      ]);

      const marketMap = new Map<string, string>();
      marketsRes.data?.forEach((m: any) => marketMap.set(m.id, m.title));

      const userMap = new Map<string, string>();
      profilesRes.data?.forEach((p: any) => userMap.set(p.id, p.display_name || p.email || p.id.slice(0, 8)));

      setTxns(
        data.map((t) => ({
          ...t,
          market_title: t.market_id ? marketMap.get(t.market_id) || "Unknown" : undefined,
          user_email: userMap.get(t.user_id) || t.user_id.slice(0, 8),
        }))
      );
      setLoading(false);
    };
    fetchData();
  }, [filter, page]);

  const totals = {
    deposits: txns.filter((t) => t.type === "deposit").reduce((s, t) => s + Number(t.amount), 0),
    withdrawals: txns.filter((t) => t.type === "withdrawal").reduce((s, t) => s + Number(t.amount), 0),
    bets: txns.filter((t) => t.type === "bet").reduce((s, t) => s + Number(t.amount), 0),
  };

  const exportCSV = () => {
    const headers = ["Date", "Type", "User", "Amount", "Side", "Market", "Status"];
    const rows = txns.map((t) => [
      new Date(t.created_at).toISOString(),
      t.type,
      t.user_email || "",
      Number(t.amount),
      t.side || "",
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
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Transactions ({txns.length})</h2>
        <button
          onClick={exportCSV}
          disabled={txns.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <ArrowDownLeft className="w-4 h-4 text-green-500" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Deposits</span>
          </div>
          <p className="text-xl font-bold">${totals.deposits.toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpRight className="w-4 h-4 text-yellow-500" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Withdrawals</span>
          </div>
          <p className="text-xl font-bold">${totals.withdrawals.toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-primary" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Bets</span>
          </div>
          <p className="text-xl font-bold">${totals.bets.toLocaleString()}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        {(["all", "deposit", "withdrawal", "bet", "payout"] as const).map((f) => (
          <button
            key={f}
            onClick={() => { setPage(0); setFilter(f); }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
              filter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "all" ? "All" : (TYPE_STYLES[f]?.label || f)}
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
                      {t.side ? (
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
    </div>
  );
};

export default AdminTransactions;
