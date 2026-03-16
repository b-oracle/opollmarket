import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Scale, Loader2, AlertTriangle, CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface Summary {
  total_flw_deposits: number;
  confirmed_deposits: number;
  pending_deposits: number;
  expired_deposits: number;
  failed_deposits: number;
  total_confirmed_usd: number;
  total_pending_usd: number;
  total_flw_withdrawals: number;
  confirmed_withdrawals: number;
  pending_withdrawals: number;
  failed_withdrawals: number;
  total_confirmed_withdrawals_usd: number;
  total_pending_withdrawals_usd: number;
  net_flow: number;
}

interface AnomalyRecord {
  tx_id: string;
  user_id: string;
  amount: number;
  status: string;
  payment_id: string | null;
  created_at: string;
  type: string;
}

const FlutterwaveReconciliation = () => {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyRecord[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session?.user);
    });
  }, []);

  const fmt = (v: number) => `$${(v ?? 0).toFixed(2)}`;

  const runAudit = async () => {
    setLoading(true);
    try {
      // Query all Flutterwave transactions directly from DB
      const { data: deposits, error: depErr } = await supabase
        .from("transactions")
        .select("id, user_id, amount, status, nowpayments_payment_id, created_at")
        .eq("type", "deposit")
        .eq("payment_provider", "flutterwave")
        .order("created_at", { ascending: false });

      if (depErr) throw depErr;

      const { data: withdrawals, error: wdErr } = await supabase
        .from("transactions")
        .select("id, user_id, amount, status, nowpayments_payment_id, created_at")
        .eq("type", "withdrawal")
        .eq("payment_provider", "flutterwave")
        .order("created_at", { ascending: false });

      if (wdErr) throw wdErr;

      const deps = deposits || [];
      const wds = withdrawals || [];

      const confirmed_deps = deps.filter(d => d.status === "confirmed");
      const pending_deps = deps.filter(d => d.status === "pending");
      const expired_deps = deps.filter(d => d.status === "expired");
      const failed_deps = deps.filter(d => d.status === "failed");

      const confirmed_wds = wds.filter(w => w.status === "confirmed");
      const pending_wds = wds.filter(w => w.status === "pending");
      const failed_wds = wds.filter(w => w.status === "failed");

      const sum = (arr: typeof deps) => arr.reduce((s, r) => s + Number(r.amount), 0);

      const s: Summary = {
        total_flw_deposits: deps.length,
        confirmed_deposits: confirmed_deps.length,
        pending_deposits: pending_deps.length,
        expired_deposits: expired_deps.length,
        failed_deposits: failed_deps.length,
        total_confirmed_usd: sum(confirmed_deps),
        total_pending_usd: sum(pending_deps),
        total_flw_withdrawals: wds.length,
        confirmed_withdrawals: confirmed_wds.length,
        pending_withdrawals: pending_wds.length,
        failed_withdrawals: failed_wds.length,
        total_confirmed_withdrawals_usd: sum(confirmed_wds),
        total_pending_withdrawals_usd: sum(pending_wds),
        net_flow: sum(confirmed_deps) - sum(confirmed_wds),
      };

      setSummary(s);

      // Find anomalies: stale pending (>2h old)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const stalePending = [...pending_deps, ...pending_wds]
        .filter(r => r.created_at < twoHoursAgo)
        .map(r => ({
          tx_id: r.id,
          user_id: r.user_id,
          amount: Number(r.amount),
          status: r.status,
          payment_id: r.nowpayments_payment_id,
          created_at: r.created_at,
          type: deps.some(d => d.id === r.id) ? "deposit" : "withdrawal",
        }));

      setAnomalies(stalePending);
      toast.success(`Audit complete: ${deps.length} deposits, ${wds.length} withdrawals`);
    } catch (err: any) {
      toast.error(err.message || "Failed to run audit");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold">Flutterwave Reconciliation</h3>
          <Badge variant="secondary" className="text-[10px]">FLW</Badge>
        </div>
        <button
          onClick={runAudit}
          disabled={loading || isAuthenticated === false}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scale className="w-3.5 h-3.5" />}
          {loading ? "Auditing..." : "Run Audit"}
        </button>
      </div>

      {isAuthenticated === false && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <p className="text-xs text-destructive font-medium">Please log in as an admin.</p>
        </div>
      )}

      {isAuthenticated !== false && !summary && !loading && (
        <p className="text-xs text-muted-foreground">
          Audits all Flutterwave deposit and withdrawal transactions in the database.
        </p>
      )}

      {summary && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <div className="rounded-lg bg-muted/30 border border-border p-2.5">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">Total Deposits</span>
              <p className="text-base font-bold">{summary.total_flw_deposits}</p>
              <p className="text-[9px] text-muted-foreground">
                <span className="text-green-500">{summary.confirmed_deposits} confirmed</span> · {summary.pending_deposits} pending
              </p>
            </div>
            <div className="rounded-lg bg-primary/5 border border-primary/10 p-2.5">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">Confirmed Deposits</span>
              <p className="text-base font-bold text-primary">{fmt(summary.total_confirmed_usd)}</p>
            </div>
            <div className="rounded-lg bg-muted/30 border border-border p-2.5">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">Total Withdrawals</span>
              <p className="text-base font-bold">{summary.total_flw_withdrawals}</p>
              <p className="text-[9px] text-muted-foreground">
                <span className="text-green-500">{summary.confirmed_withdrawals} confirmed</span> · {summary.pending_withdrawals} pending
              </p>
            </div>
            <div className={`rounded-lg p-2.5 ${summary.net_flow < 0 ? "bg-destructive/5 border border-destructive/10" : "bg-green-500/5 border border-green-500/10"}`}>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">Net Flow</span>
              <p className={`text-base font-bold ${summary.net_flow < 0 ? "text-destructive" : "text-green-500"}`}>{fmt(summary.net_flow)}</p>
              <p className="text-[9px] text-muted-foreground">deposits − withdrawals</p>
            </div>
          </div>

          {summary.expired_deposits > 0 || summary.failed_deposits > 0 || summary.failed_withdrawals > 0 ? (
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/10 p-2.5">
                <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">Expired Deposits</span>
                <p className="text-base font-bold text-yellow-500">{summary.expired_deposits}</p>
              </div>
              <div className="rounded-lg bg-destructive/5 border border-destructive/10 p-2.5">
                <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">Failed Deposits</span>
                <p className="text-base font-bold text-destructive">{summary.failed_deposits}</p>
              </div>
              <div className="rounded-lg bg-destructive/5 border border-destructive/10 p-2.5">
                <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium block mb-0.5">Failed Withdrawals</span>
                <p className="text-base font-bold text-destructive">{summary.failed_withdrawals}</p>
              </div>
            </div>
          ) : null}

          {anomalies.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
                <span className="text-xs font-semibold">Stale Pending ({anomalies.length})</span>
              </div>
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="p-2">Type</th>
                        <th className="p-2">User</th>
                        <th className="p-2 text-right">Amount</th>
                        <th className="p-2">Reference</th>
                        <th className="p-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {anomalies.map((a) => (
                        <tr key={a.tx_id} className="border-b border-border/50 bg-yellow-500/5">
                          <td className="p-2 capitalize font-medium">{a.type}</td>
                          <td className="p-2 font-mono">{a.user_id.slice(0, 8)}…</td>
                          <td className="p-2 text-right font-bold">{fmt(a.amount)}</td>
                          <td className="p-2 font-mono text-muted-foreground">{a.payment_id?.slice(0, 20) || "—"}</td>
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

          {anomalies.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-green-500">
              <CheckCircle2 className="w-4 h-4" />
              <span className="font-medium">No anomalies found — all Flutterwave transactions look healthy.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FlutterwaveReconciliation;
