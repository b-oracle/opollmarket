import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Scale, Loader2, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface AuditResult {
  tx_id: string;
  user_id: string;
  payment_id: string;
  db_credited: number;
  np_outcome_amount: number | null;
  np_actually_paid: number | null;
  np_pay_amount: number | null;
  np_pay_currency: string | null;
  np_price_amount: number | null;
  np_status: string | null;
  excess: number;
  error?: string;
}

interface AuditSummary {
  total_deposits: number;
  total_credited: number;
  total_np_outcome: number;
  total_excess: number;
  affected_deposits: number;
}

interface ApplyResult {
  user_id: string;
  deducted: number;
  new_balance: number;
}

const NpReconciliation = () => {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [results, setResults] = useState<AuditResult[] | null>(null);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [applied, setApplied] = useState<ApplyResult[] | null>(null);

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
      setResults(data.results);
      setSummary(data.summary);
    } catch (err: any) {
      toast.error(err.message || "Failed to run audit");
    } finally {
      setLoading(false);
    }
  };

  const applyCorrections = async () => {
    if (!confirm("This will deduct excess amounts from affected user balances. Negative balances are allowed. Continue?")) return;
    setApplying(true);
    try {
      const { data, error } = await supabase.functions.invoke("np-reconcile", {
        body: { action: "apply" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setApplied(data.adjustments);
      toast.success(`Applied corrections: ${fmt(data.total_deducted)} deducted from ${data.adjustments.length} users`);
    } catch (err: any) {
      toast.error(err.message || "Failed to apply corrections");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold">NOWPayments Fee Reconciliation</h3>
        </div>
        <button
          onClick={runAudit}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scale className="w-3.5 h-3.5" />}
          {loading ? "Querying NP API..." : "Run Audit"}
        </button>
      </div>

      {!results && !loading && (
        <p className="text-xs text-muted-foreground">
          Click "Run Audit" to query the NOWPayments API for each deposit and compare with database records.
        </p>
      )}

      {summary && results && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg bg-muted/30 border border-border p-3">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">DB Credited</span>
              <p className="text-lg font-bold">{fmt(summary.total_credited)}</p>
            </div>
            <div className="rounded-lg bg-green-500/5 border border-green-500/10 p-3">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">NP Outcome Total</span>
              <p className="text-lg font-bold text-green-500">{fmt(summary.total_np_outcome)}</p>
            </div>
            <div className="rounded-lg bg-destructive/5 border border-destructive/10 p-3">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">Total Excess</span>
              <p className="text-lg font-bold text-destructive">{fmt(summary.total_excess)}</p>
            </div>
            <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/10 p-3">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">Affected Deposits</span>
              <p className="text-lg font-bold text-yellow-500">{summary.affected_deposits} / {summary.total_deposits}</p>
            </div>
          </div>

          {/* Detail table */}
          <div className="border border-border rounded-lg overflow-hidden mb-4">
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="p-2">Payment ID</th>
                    <th className="p-2">Currency</th>
                    <th className="p-2 text-right">DB Credited</th>
                    <th className="p-2 text-right">NP Outcome</th>
                    <th className="p-2 text-right">Excess</th>
                    <th className="p-2">NP Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr
                      key={r.tx_id}
                      className={`border-b border-border/50 ${r.excess > 0.005 ? "bg-destructive/5" : ""}`}
                    >
                      <td className="p-2 font-mono">{r.payment_id}</td>
                      <td className="p-2 uppercase">{r.np_pay_currency || "—"}</td>
                      <td className="p-2 text-right font-semibold">{fmt(r.db_credited)}</td>
                      <td className="p-2 text-right text-green-500 font-semibold">
                        {r.np_outcome_amount !== null ? fmt(r.np_outcome_amount) : "⚠️ N/A"}
                      </td>
                      <td className={`p-2 text-right font-bold ${r.excess > 0.005 ? "text-destructive" : "text-muted-foreground"}`}>
                        {r.excess > 0.005 ? `+${fmt(r.excess)}` : "—"}
                      </td>
                      <td className="p-2">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          r.np_status === "finished" ? "bg-green-500/10 text-green-500" :
                          r.np_status === "confirmed" ? "bg-green-500/10 text-green-500" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {r.np_status || "error"}
                        </span>
                        {r.error && (
                          <span className="ml-1 text-destructive" title={r.error}>
                            <AlertTriangle className="w-3 h-3 inline" />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Apply button */}
          {summary.total_excess > 0.01 && !applied && (
            <div className="flex items-center justify-between rounded-lg bg-destructive/5 border border-destructive/20 p-3">
              <div>
                <p className="text-xs font-semibold text-destructive">
                  {summary.affected_deposits} deposits were over-credited by {fmt(summary.total_excess)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  This will deduct the excess from each user's balance and update transaction records. Negative balances allowed.
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

          {summary.total_excess <= 0.01 && (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/5 border border-green-500/20 p-3">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <p className="text-xs text-green-500 font-medium">All deposits match NOWPayments records — no corrections needed.</p>
            </div>
          )}
        </>
      )}

      {/* Applied results */}
      {applied && (
        <div className="mt-4 rounded-lg bg-green-500/5 border border-green-500/20 p-3">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <p className="text-xs font-semibold text-green-500">Corrections applied successfully</p>
          </div>
          <div className="space-y-1.5">
            {applied.map((a) => (
              <div key={a.user_id} className="flex items-center justify-between text-xs">
                <span className="font-mono text-muted-foreground">{a.user_id.slice(0, 8)}...</span>
                <span className="text-destructive font-bold">−{fmt(a.deducted)}</span>
                <span className={`font-semibold ${a.new_balance < 0 ? "text-destructive" : "text-foreground"}`}>
                  New: {fmt(a.new_balance)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default NpReconciliation;
