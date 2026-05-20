import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Scale,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Search,
  RefreshCw,
  Wallet,
  Play,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

type Status = "detected" | "manual_review" | "credited" | "failed" | string;

interface BscEvent {
  id: string;
  user_id: string;
  address: string;
  token: string;
  tx_hash: string;
  log_index: number;
  block_number: number;
  amount_usd: number;
  confirmations: number;
  status: Status;
  credited_tx_id: string | null;
  detected_at: string;
  credited_at: string | null;
  review_reason: string | null;
}

interface Summary {
  total: number;
  detected_count: number;
  detected_usd: number;
  manual_review_count: number;
  manual_review_usd: number;
  credited_count: number;
  credited_usd: number;
  failed_count: number;
}

const STATUS_OPTIONS: { value: Status | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "detected", label: "Pending" },
  { value: "manual_review", label: "Manual review" },
  { value: "credited", label: "Credited" },
  { value: "failed", label: "Failed" },
];

const PAGE_SIZE = 50;

const BscReconciliation = () => {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<BscEvent[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [tokenFilter, setTokenFilter] = useState<"all" | "USDT" | "USDC">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState<"events" | "recon">("events");
  const [reconRows, setReconRows] = useState<
    {
      event: BscEvent;
      tx_amount: number | null;
      tx_status: string | null;
      issue: "orphan" | "amount_mismatch" | "tx_not_confirmed";
    }[]
  >([]);
  const [reconLoading, setReconLoading] = useState(false);

  const fmt = (v: number) => `$${(v ?? 0).toFixed(2)}`;

  const loadSummary = async () => {
    // Pull last 30 days for the summary band (matches NpReconciliation style)
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("bsc_deposit_events")
      .select("status, amount_usd")
      .gte("detected_at", since);

    if (error) {
      toast.error(error.message);
      return;
    }
    const s: Summary = {
      total: data?.length ?? 0,
      detected_count: 0,
      detected_usd: 0,
      manual_review_count: 0,
      manual_review_usd: 0,
      credited_count: 0,
      credited_usd: 0,
      failed_count: 0,
    };
    for (const r of data ?? []) {
      const amt = Number(r.amount_usd) || 0;
      if (r.status === "detected") {
        s.detected_count++;
        s.detected_usd += amt;
      } else if (r.status === "manual_review") {
        s.manual_review_count++;
        s.manual_review_usd += amt;
      } else if (r.status === "credited") {
        s.credited_count++;
        s.credited_usd += amt;
      } else if (r.status === "failed") {
        s.failed_count++;
      }
    }
    setSummary(s);
  };

  const loadEvents = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("bsc_deposit_events")
        .select(
          "id,user_id,address,token,tx_hash,log_index,block_number,amount_usd,confirmations,status,credited_tx_id,detected_at,credited_at,review_reason",
        )
        .order("detected_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (tokenFilter !== "all") q = q.eq("token", tokenFilter);
      const s = search.trim();
      if (s) {
        // search across tx_hash / user_id / address
        q = q.or(`tx_hash.ilike.%${s}%,address.ilike.%${s}%,user_id.eq.${isUuid(s) ? s : "00000000-0000-0000-0000-000000000000"}`);
      }

      const { data, error } = await q;
      if (error) throw error;
      setEvents((data as BscEvent[]) ?? []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load BSC events");
    } finally {
      setLoading(false);
    }
  };

  const loadReconciliation = async () => {
    setReconLoading(true);
    try {
      // Get all credited events
      const { data: credited, error } = await supabase
        .from("bsc_deposit_events")
        .select("id,user_id,address,token,tx_hash,log_index,block_number,amount_usd,confirmations,status,credited_tx_id,detected_at,credited_at,review_reason")
        .eq("status", "credited")
        .order("credited_at", { ascending: false })
        .limit(1000);
      if (error) throw error;

      const ids = (credited ?? []).map((c) => c.credited_tx_id).filter(Boolean) as string[];
      const txMap = new Map<string, { amount: number; status: string }>();
      if (ids.length) {
        const { data: txs } = await supabase
          .from("transactions")
          .select("id, amount, status")
          .in("id", ids);
        for (const t of txs ?? []) txMap.set(t.id, { amount: Number(t.amount), status: t.status });
      }

      const issues: typeof reconRows = [];
      for (const ev of (credited as BscEvent[]) ?? []) {
        if (!ev.credited_tx_id) {
          issues.push({ event: ev, tx_amount: null, tx_status: null, issue: "orphan" });
          continue;
        }
        const tx = txMap.get(ev.credited_tx_id);
        if (!tx) {
          issues.push({ event: ev, tx_amount: null, tx_status: null, issue: "orphan" });
          continue;
        }
        if (tx.status !== "confirmed" && tx.status !== "completed") {
          issues.push({ event: ev, tx_amount: tx.amount, tx_status: tx.status, issue: "tx_not_confirmed" });
          continue;
        }
        if (Math.abs(tx.amount - Number(ev.amount_usd)) > 0.01) {
          issues.push({ event: ev, tx_amount: tx.amount, tx_status: tx.status, issue: "amount_mismatch" });
        }
      }
      setReconRows(issues);
    } catch (err: any) {
      toast.error(err.message || "Failed to reconcile BSC events");
    } finally {
      setReconLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  useEffect(() => {
    if (tab === "events") loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, statusFilter, tokenFilter, page]);

  useEffect(() => {
    if (tab === "recon" && reconRows.length === 0 && !reconLoading) loadReconciliation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      setPage(0);
      loadEvents();
    }
  };

  const statusBadge = (s: Status) => {
    const cls =
      s === "credited"
        ? "bg-green-500/10 text-green-500"
        : s === "manual_review"
        ? "bg-yellow-500/10 text-yellow-500"
        : s === "detected"
        ? "bg-blue-500/10 text-blue-500"
        : s === "failed"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground";
    return (
      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${cls}`}>{s}</span>
    );
  };

  const totalIssues = reconRows.length;

  return (
    <div className="bg-card border border-border rounded-xl p-5 mt-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold">BSC On-Chain Reconciliation</h3>
          <span className="text-[10px] text-muted-foreground">USDT/USDC stablecoin deposits</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/bsc-review"
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            Review queue <ExternalLink className="w-3 h-3" />
          </Link>
          <button
            onClick={() => {
              loadSummary();
              if (tab === "events") loadEvents();
              else loadReconciliation();
            }}
            disabled={loading || reconLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50"
          >
            {loading || reconLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Refresh
          </button>
        </div>
      </div>

      {/* Summary band (last 30 days) */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
          <SummaryCard label="Total events" value={String(summary.total)} sub="last 30d" />
          <SummaryCard
            label="Pending"
            value={String(summary.detected_count)}
            sub={fmt(summary.detected_usd)}
            tone="blue"
          />
          <SummaryCard
            label="Manual review"
            value={String(summary.manual_review_count)}
            sub={fmt(summary.manual_review_usd)}
            tone={summary.manual_review_count > 0 ? "yellow" : undefined}
          />
          <SummaryCard
            label="Credited"
            value={String(summary.credited_count)}
            sub={fmt(summary.credited_usd)}
            tone="green"
          />
          <SummaryCard
            label="Failed"
            value={String(summary.failed_count)}
            sub="reverify failed"
            tone={summary.failed_count > 0 ? "red" : undefined}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 mb-3 w-fit">
        <button
          onClick={() => setTab("events")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            tab === "events" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Events
        </button>
        <button
          onClick={() => setTab("recon")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            tab === "recon" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Reconciliation {totalIssues > 0 && <span className="ml-1 text-yellow-500">({totalIssues})</span>}
        </button>
      </div>

      {tab === "events" && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setPage(0);
              }}
              className="px-2 py-1 rounded-md text-xs bg-muted border border-border"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={tokenFilter}
              onChange={(e) => {
                setTokenFilter(e.target.value as any);
                setPage(0);
              }}
              className="px-2 py-1 rounded-md text-xs bg-muted border border-border"
            >
              <option value="all">All tokens</option>
              <option value="USDT">USDT</option>
              <option value="USDC">USDC</option>
            </select>
            <div className="flex items-center gap-1 flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="tx hash, address, or user id"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={onSearchKey}
                className="flex-1 px-2 py-1 rounded-md text-xs bg-muted border border-border"
              />
              <button
                onClick={() => {
                  setPage(0);
                  loadEvents();
                }}
                className="px-2 py-1 rounded-md text-xs bg-secondary hover:bg-secondary/80"
              >
                Search
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="p-2">Detected</th>
                    <th className="p-2">User</th>
                    <th className="p-2">Token</th>
                    <th className="p-2 text-right">Amount</th>
                    <th className="p-2 text-right">Confs</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin inline" />
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    events.map((e) => (
                      <tr key={e.id} className="border-b border-border/50">
                        <td className="p-2 text-muted-foreground whitespace-nowrap">
                          {new Date(e.detected_at).toLocaleString("en", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="p-2 font-mono">{e.user_id.slice(0, 8)}…</td>
                        <td className="p-2 font-medium">{e.token}</td>
                        <td className="p-2 text-right font-bold">{fmt(Number(e.amount_usd))}</td>
                        <td className="p-2 text-right text-muted-foreground">{e.confirmations}</td>
                        <td className="p-2">{statusBadge(e.status)}</td>
                        <td className="p-2">
                          <a
                            href={`https://bscscan.com/tx/${e.tx_hash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-1 font-mono"
                          >
                            {e.tx_hash.slice(0, 8)}… <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  {!loading && events.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-muted-foreground">
                        No events match these filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
            <span>
              Page {page + 1} · showing {events.length}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                className="px-3 py-1 rounded-md bg-muted hover:bg-muted/70 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={events.length < PAGE_SIZE || loading}
                className="px-3 py-1 rounded-md bg-muted hover:bg-muted/70 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {tab === "recon" && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="p-2">Issue</th>
                  <th className="p-2">Credited</th>
                  <th className="p-2">User</th>
                  <th className="p-2 text-right">Event $</th>
                  <th className="p-2 text-right">Tx $</th>
                  <th className="p-2">Tx status</th>
                  <th className="p-2">Tx hash</th>
                </tr>
              </thead>
              <tbody>
                {reconLoading && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin inline" />
                    </td>
                  </tr>
                )}
                {!reconLoading &&
                  reconRows.map((r) => (
                    <tr key={r.event.id} className="border-b border-border/50 bg-yellow-500/5">
                      <td className="p-2">
                        <span className="inline-flex items-center gap-1 text-yellow-500 font-semibold">
                          <AlertTriangle className="w-3 h-3" />
                          {r.issue === "orphan"
                            ? "No tx row"
                            : r.issue === "amount_mismatch"
                            ? "Amount mismatch"
                            : "Tx not confirmed"}
                        </span>
                      </td>
                      <td className="p-2 text-muted-foreground whitespace-nowrap">
                        {r.event.credited_at
                          ? new Date(r.event.credited_at).toLocaleString("en", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="p-2 font-mono">{r.event.user_id.slice(0, 8)}…</td>
                      <td className="p-2 text-right font-bold">{fmt(Number(r.event.amount_usd))}</td>
                      <td className="p-2 text-right">{r.tx_amount != null ? fmt(r.tx_amount) : "—"}</td>
                      <td className="p-2">{r.tx_status ?? "—"}</td>
                      <td className="p-2">
                        <a
                          href={`https://bscscan.com/tx/${r.event.tx_hash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1 font-mono"
                        >
                          {r.event.tx_hash.slice(0, 8)}… <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                {!reconLoading && reconRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-green-500">
                      All credited events reconcile cleanly with transaction records ✓
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

function SummaryCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "blue" | "green" | "yellow" | "red";
}) {
  const cls =
    tone === "green"
      ? "bg-green-500/5 border-green-500/10"
      : tone === "yellow"
      ? "bg-yellow-500/5 border-yellow-500/10"
      : tone === "red"
      ? "bg-destructive/5 border-destructive/10"
      : tone === "blue"
      ? "bg-blue-500/5 border-blue-500/10"
      : "bg-muted/30 border-border";
  const valCls =
    tone === "green"
      ? "text-green-500"
      : tone === "yellow"
      ? "text-yellow-500"
      : tone === "red"
      ? "text-destructive"
      : tone === "blue"
      ? "text-blue-500"
      : "";
  return (
    <div className={`rounded-lg border p-2.5 ${cls}`}>
      <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">
        {label}
      </span>
      <p className={`text-base font-bold ${valCls}`}>{value}</p>
      {sub && <p className="text-[9px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export default BscReconciliation;
