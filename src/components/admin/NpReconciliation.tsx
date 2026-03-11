import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Scale, Loader2, AlertTriangle, CheckCircle2, ArrowRight, XCircle, HelpCircle } from "lucide-react";
import { toast } from "sonner";

interface FixedRecord {
  tx_id: string;
  user_id: string;
  np_payment_id: string;
  np_status: string;
  requested_amount: number;
  credited_amount: number;
  status_set: string;
}

interface MatchedRecord {
  tx_id: string;
  user_id: string;
  np_payment_id: string;
  db_amount: number;
  db_status: string;
  np_price_amount: number;
  np_outcome_amount: number;
  np_actually_paid: number;
  np_pay_currency: string;
  np_status: string;
  np_created_at: string;
  excess: number;
}

interface AnomalyDbRecord {
  tx_id: string;
  user_id: string;
  amount: number;
  status: string;
  np_payment_id: string | null;
  created_at: string;
}

interface AnomalyNpRecord {
  np_payment_id: string;
  order_id: string;
  price_amount: number;
  outcome_amount: number;
  pay_currency: string;
  status: string;
  created_at: string;
}

interface Summary {
  np_total_payments: number;
  np_deposit_payments: number;
  np_boost_payments: number;
  np_other_payments: number;
  np_total_incoming_usd: number;
  db_total_credited: number;
  np_total_outcome: number;
  np_total_gross: number;
  total_excess: number;
  np_fees_retained: number;
  matched_count: number;
  affected_count: number;
  db_no_np_record: number;
  np_no_db_record: number;
}

interface ApplyResult {
  user_id: string;
  deducted: number;
  new_balance: number;
  prev_balance: number;
}

const NpReconciliation = () => {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [matched, setMatched] = useState<MatchedRecord[]>([]);
  const [anomaliesDb, setAnomaliesDb] = useState<AnomalyDbRecord[]>([]);
  const [anomaliesNp, setAnomaliesNp] = useState<AnomalyNpRecord[]>([]);
  const [applied, setApplied] = useState<ApplyResult[] | null>(null);
  const [tab, setTab] = useState<"matched" | "anomalies">("matched");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session?.user);
    });
  }, []);

  const fmt = (v: number) => `$${v.toFixed(2)}`;

  const runAudit = async () => {
    setLoading(true);
    setApplied(null);
    try {
      const { data, error } = await supabase.functions.invoke("np-reconcile", {
        body: { action: "audit" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSummary(data.summary);
      setMatched(data.matched || []);
      setAnomaliesDb(data.anomalies?.db_confirmed_no_np || []);
      setAnomaliesNp(data.anomalies?.np_finished_no_db || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to run audit");
    } finally {
      setLoading(false);
    }
  };

  const applyCorrections = async () => {
    if (!confirm("This will deduct excess from affected user balances and update transaction records. Negative balances allowed. Continue?")) return;
    setApplying(true);
    try {
      const { data, error } = await supabase.functions.invoke("np-reconcile", {
        body: { action: "apply" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setApplied(data.adjustments);
      toast.success(`Corrections applied: ${fmt(data.total_deducted)} deducted from ${data.adjustments.length} users`);
    } catch (err: any) {
      toast.error(err.message || "Failed to apply corrections");
    } finally {
      setApplying(false);
    }
  };

  const totalAnomalies = anomaliesDb.length + anomaliesNp.length;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold">NOWPayments Full Reconciliation</h3>
        </div>
        <button
          onClick={runAudit}
          disabled={loading || isAuthenticated === false}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scale className="w-3.5 h-3.5" />}
          {loading ? "Fetching NP history..." : "Run Full Audit"}
        </button>
      </div>

      {isAuthenticated === false && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <p className="text-xs text-destructive font-medium">Please log in as an admin to use the reconciliation tool.</p>
        </div>
      )}

      {isAuthenticated !== false && !summary && !loading && (
        <p className="text-xs text-muted-foreground">
          Fetches complete transaction history from the payment processor and cross-references every record with the database.
        </p>
      )}

      {summary && (
        <>
          {/* Summary grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <div className="rounded-lg bg-muted/30 border border-border p-2.5">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">NP Total Payments</span>
              <p className="text-base font-bold">{summary.np_total_payments}</p>
              <p className="text-[9px] text-muted-foreground">{summary.np_deposit_payments} deposits · {summary.np_boost_payments} boosts</p>
            </div>
            <div className="rounded-lg bg-muted/30 border border-border p-2.5">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">NP Gross (Requested)</span>
              <p className="text-base font-bold">{fmt(summary.np_total_gross)}</p>
              <p className="text-[9px] text-muted-foreground">users requested total</p>
            </div>
            <div className="rounded-lg bg-green-500/5 border border-green-500/10 p-2.5">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">NP Outcome (Net)</span>
              <p className="text-base font-bold text-green-500">{fmt(summary.np_total_outcome)}</p>
              <p className="text-[9px] text-muted-foreground">after NP fees</p>
            </div>
            <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/10 p-2.5">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">NP Fees Retained</span>
              <p className="text-base font-bold text-yellow-500">{fmt(summary.np_fees_retained)}</p>
              <p className="text-[9px] text-muted-foreground">gross − outcome</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <div className="rounded-lg bg-primary/5 border border-primary/10 p-2.5">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">DB Credited</span>
              <p className="text-base font-bold text-primary">{fmt(summary.db_total_credited)}</p>
              <p className="text-[9px] text-muted-foreground">{summary.matched_count} matched deposits</p>
            </div>
            <div className="rounded-lg bg-destructive/5 border border-destructive/10 p-2.5">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">Excess Credited</span>
              <p className="text-base font-bold text-destructive">{fmt(summary.total_excess)}</p>
              <p className="text-[9px] text-muted-foreground">{summary.affected_count} over-credited</p>
            </div>
            <div className={`rounded-lg p-2.5 ${totalAnomalies > 0 ? "bg-yellow-500/5 border border-yellow-500/10" : "bg-muted/30 border border-border"}`}>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">DB → No NP Match</span>
              <p className={`text-base font-bold ${summary.db_no_np_record > 0 ? "text-yellow-500" : ""}`}>{summary.db_no_np_record}</p>
              <p className="text-[9px] text-muted-foreground">ghost deposits</p>
            </div>
            <div className={`rounded-lg p-2.5 ${summary.np_no_db_record > 0 ? "bg-yellow-500/5 border border-yellow-500/10" : "bg-muted/30 border border-border"}`}>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">NP → No DB Match</span>
              <p className={`text-base font-bold ${summary.np_no_db_record > 0 ? "text-yellow-500" : ""}`}>{summary.np_no_db_record}</p>
              <p className="text-[9px] text-muted-foreground">uncredited payments</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 mb-3">
            <button
              onClick={() => setTab("matched")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === "matched" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Matched ({matched.length})
            </button>
            <button
              onClick={() => setTab("anomalies")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === "anomalies" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Anomalies ({totalAnomalies})
              {totalAnomalies > 0 && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />}
            </button>
          </div>

          {/* Matched table */}
          {tab === "matched" && (
            <div className="border border-border rounded-lg overflow-hidden mb-4">
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="p-2">Payment ID</th>
                      <th className="p-2">Crypto</th>
                      <th className="p-2 text-right">Requested</th>
                      <th className="p-2 text-right">NP Outcome</th>
                      <th className="p-2 text-right">DB Credited</th>
                      <th className="p-2 text-right">Excess</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matched.map((m) => (
                      <tr key={m.tx_id} className={`border-b border-border/50 ${m.excess > 0.005 ? "bg-destructive/5" : ""}`}>
                        <td className="p-2 font-mono">{m.np_payment_id}</td>
                        <td className="p-2 uppercase font-medium">{m.np_pay_currency}</td>
                        <td className="p-2 text-right text-muted-foreground">{fmt(m.np_price_amount)}</td>
                        <td className="p-2 text-right text-green-500 font-semibold">{fmt(m.np_outcome_amount)}</td>
                        <td className="p-2 text-right font-semibold">{fmt(m.db_amount)}</td>
                        <td className={`p-2 text-right font-bold ${m.excess > 0.005 ? "text-destructive" : "text-muted-foreground"}`}>
                          {m.excess > 0.005 ? `+${fmt(m.excess)}` : "—"}
                        </td>
                        <td className="p-2">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            m.np_status === "finished" || m.np_status === "confirmed"
                              ? "bg-green-500/10 text-green-500"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {m.np_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {matched.length === 0 && (
                      <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No matched records</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Anomalies tab */}
          {tab === "anomalies" && (
            <div className="space-y-3 mb-4">
              {anomaliesDb.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <HelpCircle className="w-3.5 h-3.5 text-yellow-500" />
                    <span className="text-xs font-semibold">DB Deposits Without NP Match</span>
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-48 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                          <tr className="border-b border-border text-left text-muted-foreground">
                            <th className="p-2">TX ID</th>
                            <th className="p-2">User</th>
                            <th className="p-2 text-right">Amount</th>
                            <th className="p-2">Status</th>
                            <th className="p-2">NP ID</th>
                            <th className="p-2">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {anomaliesDb.map((a) => (
                            <tr key={a.tx_id} className="border-b border-border/50 bg-yellow-500/5">
                              <td className="p-2 font-mono">{a.tx_id.slice(0, 8)}…</td>
                              <td className="p-2 font-mono">{a.user_id.slice(0, 8)}…</td>
                              <td className="p-2 text-right font-bold">{fmt(a.amount)}</td>
                              <td className="p-2">{a.status}</td>
                              <td className="p-2 text-muted-foreground">{a.np_payment_id || "—"}</td>
                              <td className="p-2 text-muted-foreground whitespace-nowrap">
                                {new Date(a.created_at).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {anomaliesNp.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <XCircle className="w-3.5 h-3.5 text-destructive" />
                    <span className="text-xs font-semibold">NP Finished Payments Not in DB</span>
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-48 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                          <tr className="border-b border-border text-left text-muted-foreground">
                            <th className="p-2">NP Payment ID</th>
                            <th className="p-2">Order ID</th>
                            <th className="p-2 text-right">Requested</th>
                            <th className="p-2 text-right">Outcome</th>
                            <th className="p-2">Currency</th>
                            <th className="p-2">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {anomaliesNp.map((a) => (
                            <tr key={a.np_payment_id} className="border-b border-border/50 bg-destructive/5">
                              <td className="p-2 font-mono">{a.np_payment_id}</td>
                              <td className="p-2 font-mono text-muted-foreground">{a.order_id}</td>
                              <td className="p-2 text-right">{fmt(a.price_amount)}</td>
                              <td className="p-2 text-right font-bold text-green-500">{fmt(a.outcome_amount)}</td>
                              <td className="p-2 uppercase">{a.pay_currency}</td>
                              <td className="p-2 text-muted-foreground whitespace-nowrap">
                                {new Date(a.created_at).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
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
                  <p className="text-xs text-green-500 font-medium">No anomalies — all NP payments have matching DB records and vice versa.</p>
                </div>
              )}
            </div>
          )}

          {/* Apply button */}
          {summary.total_excess > 0.01 && !applied && (
            <div className="flex items-center justify-between rounded-lg bg-destructive/5 border border-destructive/20 p-3">
              <div>
                <p className="text-xs font-semibold text-destructive">
                  {summary.affected_count} deposits over-credited by {fmt(summary.total_excess)} total
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Deducts excess from user balances, updates transaction amounts to NP outcome values, and logs everything. Negative balances allowed.
                </p>
              </div>
              <button
                onClick={applyCorrections}
                disabled={applying}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-xs font-bold hover:bg-destructive/90 transition-all active:scale-95 disabled:opacity-50 shrink-0"
              >
                {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                {applying ? "Applying..." : "Apply Corrections"}
              </button>
            </div>
          )}

          {summary.total_excess <= 0.01 && !applied && (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/5 border border-green-500/20 p-3">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <p className="text-xs text-green-500 font-medium">All deposits match — no corrections needed.</p>
            </div>
          )}
        </>
      )}

      {/* Applied results */}
      {applied && applied.length > 0 && (
        <div className="mt-4 rounded-lg bg-green-500/5 border border-green-500/20 p-3">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <p className="text-xs font-semibold text-green-500">Corrections applied — {applied.length} users adjusted</p>
          </div>
          <div className="space-y-1.5">
            {applied.map((a) => (
              <div key={a.user_id} className="flex items-center justify-between text-xs bg-card rounded-lg px-3 py-2 border border-border">
                <span className="font-mono text-muted-foreground">{a.user_id.slice(0, 12)}…</span>
                <span className="text-destructive font-bold">−{fmt(a.deducted)}</span>
                <div className="text-right">
                  <span className="text-muted-foreground">{fmt(a.prev_balance)}</span>
                  <span className="mx-1 text-muted-foreground">→</span>
                  <span className={`font-semibold ${a.new_balance < 0 ? "text-destructive" : "text-foreground"}`}>
                    {fmt(a.new_balance)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default NpReconciliation;
