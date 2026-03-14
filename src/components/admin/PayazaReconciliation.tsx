import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Scale, Loader2, AlertTriangle, CheckCircle2, HelpCircle, XCircle, ArrowRight, Users } from "lucide-react";
import { toast } from "sonner";

interface Summary {
  total_fiat_transactions: number;
  total_deposits: number;
  confirmed_deposits: number;
  pending_deposits: number;
  expired_deposits: number;
  failed_deposits: number;
  partial_deposits: number;
  total_confirmed_deposits_usd: number;
  total_pending_deposits_usd: number;
  total_partial_deposits_usd: number;
  total_withdrawals: number;
  confirmed_withdrawals: number;
  pending_withdrawals: number;
  total_confirmed_withdrawals_usd: number;
  total_pending_withdrawals_usd: number;
  total_wd_requests: number;
  completed_wd_requests: number;
  pending_wd_requests: number;
  rejected_wd_requests: number;
  wd_request_mismatches: number;
  stale_pending_count: number;
  no_ref_confirmed_count: number;
  net_fiat_flow: number;
  unique_fiat_users: number;
}

interface UserFlow {
  user_id: string;
  fiat_deposits_confirmed: number;
  fiat_deposits_count: number;
  fiat_withdrawals_confirmed: number;
  fiat_withdrawals_count: number;
  net_fiat_flow: number;
  current_balance: number;
}

interface WdMismatch {
  request_id: string;
  user_id: string;
  amount: number;
  request_status: string;
  wallet_address: string;
  created_at: string;
  issue: string;
}

interface StalePending {
  tx_id: string;
  user_id: string;
  amount: number;
  reference: string | null;
  created_at: string;
}

interface NoRefConfirmed {
  tx_id: string;
  user_id: string;
  amount: number;
  created_at: string;
}

const PayazaReconciliation = () => {
  const [loading, setLoading] = useState(false);
  const [fixingStale, setFixingStale] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [userFlows, setUserFlows] = useState<UserFlow[]>([]);
  const [wdMismatches, setWdMismatches] = useState<WdMismatch[]>([]);
  const [stalePending, setStalePending] = useState<StalePending[]>([]);
  const [noRefConfirmed, setNoRefConfirmed] = useState<NoRefConfirmed[]>([]);
  const [tab, setTab] = useState<"overview" | "users" | "anomalies">("overview");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [fixResult, setFixResult] = useState<{ expired_count: number } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session?.user);
    });
  }, []);

  const fmt = (v: number) => `$${v.toFixed(2)}`;

  const runAudit = async () => {
    setLoading(true);
    setFixResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("payaza-reconcile", {
        body: { action: "audit" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSummary(data.summary);
      setUserFlows(data.user_flows || []);
      setWdMismatches(data.anomalies?.wd_request_mismatches || []);
      setStalePending(data.anomalies?.stale_pending || []);
      setNoRefConfirmed(data.anomalies?.no_ref_confirmed || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to run Boundlesspay audit");
    } finally {
      setLoading(false);
    }
  };

  const fixStaleDeposits = async () => {
    if (!confirm("This will mark all stale pending Payaza deposits (>2 hours old) as expired. Continue?")) return;
    setFixingStale(true);
    try {
      const { data, error } = await supabase.functions.invoke("payaza-reconcile", {
        body: { action: "fix_unconfirmed" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setFixResult(data);
      toast.success(data.expired_count > 0
        ? `Expired ${data.expired_count} stale deposits`
        : "No stale deposits found"
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to fix stale deposits");
    } finally {
      setFixingStale(false);
    }
  };

  const totalAnomalies = wdMismatches.length + stalePending.length + noRefConfirmed.length;

  return (
    <div className="bg-card border border-border rounded-xl p-5 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold">Boundlesspay Full Reconciliation</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fixStaleDeposits}
            disabled={fixingStale || isAuthenticated === false}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-semibold hover:bg-accent/90 transition-all active:scale-95 disabled:opacity-50"
          >
            {fixingStale ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            {fixingStale ? "Cleaning..." : "Fix Stale"}
          </button>
          <button
            onClick={runAudit}
            disabled={loading || isAuthenticated === false}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scale className="w-3.5 h-3.5" />}
            {loading ? "Auditing..." : "Run Full Audit"}
          </button>
        </div>
      </div>

      {isAuthenticated === false && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <p className="text-xs text-destructive font-medium">Please log in as an admin to use the reconciliation tool.</p>
        </div>
      )}

      {isAuthenticated !== false && !summary && !loading && (
        <p className="text-xs text-muted-foreground">
          Audits all fiat (NGN/Payaza) deposits & withdrawals, cross-references withdrawal requests, and flags anomalies.
        </p>
      )}

      {summary && (
        <>
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 mb-4">
            <button
              onClick={() => setTab("overview")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === "overview" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Overview
            </button>
            <button
              onClick={() => setTab("users")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === "users" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              User Flows ({userFlows.length})
            </button>
            <button
              onClick={() => setTab("anomalies")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === "anomalies" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Anomalies ({totalAnomalies})
              {totalAnomalies > 0 && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />}
            </button>
          </div>

          {/* Overview tab */}
          {tab === "overview" && (
            <>
              {/* Deposit stats */}
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Fiat Deposits</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                <div className="rounded-lg bg-muted/30 border border-border p-2.5">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">Total Deposits</span>
                  <p className="text-base font-bold">{summary.total_deposits}</p>
                  <p className="text-[9px] text-muted-foreground">{summary.confirmed_deposits} confirmed</p>
                </div>
                <div className="rounded-lg bg-green-500/5 border border-green-500/10 p-2.5">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">Confirmed Value</span>
                  <p className="text-base font-bold text-green-500">{fmt(summary.total_confirmed_deposits_usd)}</p>
                  <p className="text-[9px] text-muted-foreground">{summary.confirmed_deposits} deposits</p>
                </div>
                <div className="rounded-lg bg-muted/30 border border-border p-2.5">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">Pending / Partial</span>
                  <p className="text-base font-bold">{summary.pending_deposits + summary.partial_deposits}</p>
                  <p className="text-[9px] text-muted-foreground">{fmt(summary.total_pending_deposits_usd + summary.total_partial_deposits_usd)} value</p>
                </div>
                <div className={`rounded-lg p-2.5 ${summary.expired_deposits + summary.failed_deposits > 0 ? "bg-destructive/5 border border-destructive/10" : "bg-muted/30 border border-border"}`}>
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">Expired / Failed</span>
                  <p className={`text-base font-bold ${summary.expired_deposits + summary.failed_deposits > 0 ? "text-destructive" : ""}`}>{summary.expired_deposits + summary.failed_deposits}</p>
                  <p className="text-[9px] text-muted-foreground">{summary.expired_deposits} expired · {summary.failed_deposits} failed</p>
                </div>
              </div>

              {/* Withdrawal stats */}
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Fiat Withdrawals</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                <div className="rounded-lg bg-muted/30 border border-border p-2.5">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">Total Withdrawals</span>
                  <p className="text-base font-bold">{summary.total_withdrawals}</p>
                  <p className="text-[9px] text-muted-foreground">{summary.confirmed_withdrawals} confirmed</p>
                </div>
                <div className="rounded-lg bg-destructive/5 border border-destructive/10 p-2.5">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">Confirmed Value</span>
                  <p className="text-base font-bold text-destructive">{fmt(summary.total_confirmed_withdrawals_usd)}</p>
                  <p className="text-[9px] text-muted-foreground">{summary.confirmed_withdrawals} completed</p>
                </div>
                <div className="rounded-lg bg-muted/30 border border-border p-2.5">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">WD Requests</span>
                  <p className="text-base font-bold">{summary.total_wd_requests}</p>
                  <p className="text-[9px] text-muted-foreground">{summary.completed_wd_requests} done · {summary.pending_wd_requests} pending</p>
                </div>
                <div className={`rounded-lg p-2.5 ${summary.wd_request_mismatches > 0 ? "bg-yellow-500/5 border border-yellow-500/10" : "bg-muted/30 border border-border"}`}>
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">Request Mismatches</span>
                  <p className={`text-base font-bold ${summary.wd_request_mismatches > 0 ? "text-yellow-500" : ""}`}>{summary.wd_request_mismatches}</p>
                  <p className="text-[9px] text-muted-foreground">requests without matching txs</p>
                </div>
              </div>

              {/* Net summary */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className={`rounded-lg p-2.5 ${summary.net_fiat_flow >= 0 ? "bg-green-500/5 border border-green-500/10" : "bg-destructive/5 border border-destructive/10"}`}>
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">Net Fiat Flow</span>
                  <p className={`text-base font-bold ${summary.net_fiat_flow >= 0 ? "text-green-500" : "text-destructive"}`}>{fmt(summary.net_fiat_flow)}</p>
                  <p className="text-[9px] text-muted-foreground">deposits − withdrawals</p>
                </div>
                <div className="rounded-lg bg-primary/5 border border-primary/10 p-2.5">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">Unique Fiat Users</span>
                  <p className="text-base font-bold text-primary">{summary.unique_fiat_users}</p>
                  <p className="text-[9px] text-muted-foreground">deposited or withdrew</p>
                </div>
                <div className={`rounded-lg p-2.5 ${summary.stale_pending_count > 0 ? "bg-yellow-500/5 border border-yellow-500/10" : "bg-muted/30 border border-border"}`}>
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">Stale Pending</span>
                  <p className={`text-base font-bold ${summary.stale_pending_count > 0 ? "text-yellow-500" : ""}`}>{summary.stale_pending_count}</p>
                  <p className="text-[9px] text-muted-foreground">deposits &gt;2hrs old</p>
                </div>
              </div>

              {totalAnomalies === 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-green-500/5 border border-green-500/20 p-3 mt-4">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <p className="text-xs text-green-500 font-medium">All fiat records are clean — no anomalies detected.</p>
                </div>
              )}
            </>
          )}

          {/* User Flows tab */}
          {tab === "users" && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="p-2">User</th>
                      <th className="p-2 text-right">Deposits</th>
                      <th className="p-2 text-right">Withdrawals</th>
                      <th className="p-2 text-right">Net Flow</th>
                      <th className="p-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userFlows.map((u) => (
                      <tr key={u.user_id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="p-2 font-mono">{u.user_id.slice(0, 12)}…</td>
                        <td className="p-2 text-right text-green-500 font-semibold">
                          {fmt(u.fiat_deposits_confirmed)}
                          <span className="text-muted-foreground font-normal ml-1">({u.fiat_deposits_count})</span>
                        </td>
                        <td className="p-2 text-right text-destructive font-semibold">
                          {fmt(u.fiat_withdrawals_confirmed)}
                          <span className="text-muted-foreground font-normal ml-1">({u.fiat_withdrawals_count})</span>
                        </td>
                        <td className={`p-2 text-right font-bold ${u.net_fiat_flow >= 0 ? "text-green-500" : "text-destructive"}`}>
                          {u.net_fiat_flow >= 0 ? "+" : ""}{fmt(u.net_fiat_flow)}
                        </td>
                        <td className={`p-2 text-right font-semibold ${u.current_balance < 0 ? "text-destructive" : "text-foreground"}`}>
                          {fmt(u.current_balance)}
                        </td>
                      </tr>
                    ))}
                    {userFlows.length === 0 && (
                      <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No fiat users found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Anomalies tab */}
          {tab === "anomalies" && (
            <div className="space-y-4">
              {/* Withdrawal request mismatches */}
              {wdMismatches.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <XCircle className="w-3.5 h-3.5 text-destructive" />
                    <span className="text-xs font-semibold">Withdrawal Request Mismatches</span>
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-48 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                          <tr className="border-b border-border text-left text-muted-foreground">
                            <th className="p-2">Request ID</th>
                            <th className="p-2">User</th>
                            <th className="p-2 text-right">Amount</th>
                            <th className="p-2">Status</th>
                            <th className="p-2">Issue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {wdMismatches.map((m) => (
                            <tr key={m.request_id} className="border-b border-border/50 bg-destructive/5">
                              <td className="p-2 font-mono">{m.request_id.slice(0, 8)}…</td>
                              <td className="p-2 font-mono">{m.user_id.slice(0, 8)}…</td>
                              <td className="p-2 text-right font-bold">{fmt(m.amount)}</td>
                              <td className="p-2">{m.request_status}</td>
                              <td className="p-2 text-muted-foreground text-[10px]">{m.issue}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Stale pending deposits */}
              {stalePending.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <HelpCircle className="w-3.5 h-3.5 text-yellow-500" />
                    <span className="text-xs font-semibold">Stale Pending Deposits (&gt;2 hours)</span>
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-48 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                          <tr className="border-b border-border text-left text-muted-foreground">
                            <th className="p-2">TX ID</th>
                            <th className="p-2">User</th>
                            <th className="p-2 text-right">Amount</th>
                            <th className="p-2">Reference</th>
                            <th className="p-2">Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stalePending.map((s) => (
                            <tr key={s.tx_id} className="border-b border-border/50 bg-yellow-500/5">
                              <td className="p-2 font-mono">{s.tx_id.slice(0, 8)}…</td>
                              <td className="p-2 font-mono">{s.user_id.slice(0, 8)}…</td>
                              <td className="p-2 text-right font-bold">{fmt(s.amount)}</td>
                              <td className="p-2 font-mono text-muted-foreground text-[10px]">{s.reference || "—"}</td>
                              <td className="p-2 text-muted-foreground whitespace-nowrap">
                                {new Date(s.created_at).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Confirmed without reference */}
              {noRefConfirmed.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
                    <span className="text-xs font-semibold">Confirmed Deposits Without Reference</span>
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-48 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                          <tr className="border-b border-border text-left text-muted-foreground">
                            <th className="p-2">TX ID</th>
                            <th className="p-2">User</th>
                            <th className="p-2 text-right">Amount</th>
                            <th className="p-2">Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {noRefConfirmed.map((n) => (
                            <tr key={n.tx_id} className="border-b border-border/50 bg-yellow-500/5">
                              <td className="p-2 font-mono">{n.tx_id.slice(0, 8)}…</td>
                              <td className="p-2 font-mono">{n.user_id.slice(0, 8)}…</td>
                              <td className="p-2 text-right font-bold">{fmt(n.amount)}</td>
                              <td className="p-2 text-muted-foreground whitespace-nowrap">
                                {new Date(n.created_at).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {totalAnomalies === 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-green-500/5 border border-green-500/20 p-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <p className="text-xs text-green-500 font-medium">No anomalies — all fiat records are clean.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Fix result */}
      {fixResult && (
        <div className={`mt-4 rounded-lg p-3 ${fixResult.expired_count > 0 ? "bg-green-500/5 border border-green-500/20" : "bg-muted/30 border border-border"}`}>
          <div className="flex items-center gap-2">
            {fixResult.expired_count > 0 ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
            )}
            <p className="text-xs font-semibold">
              {fixResult.expired_count > 0
                ? `Expired ${fixResult.expired_count} stale pending deposits`
                : "No stale pending deposits found"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayazaReconciliation;
