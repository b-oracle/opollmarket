import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, AlertTriangle, Search } from "lucide-react";

type LedgerRow = {
  id: string;
  correlation_id: string | null;
  user_id: string;
  actor_id: string | null;
  source: string | null;
  reason: string | null;
  success: boolean;
  error_message: string | null;
  delta_main: number;
  delta_bonus: number;
  delta_insurance: number;
  before_main: number | null;
  after_main: number | null;
  created_at: string;
};

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : `${n >= 0 ? "+" : ""}$${Math.abs(n).toFixed(2)}`;

export const BalanceLedgerPanel = () => {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [failuresOnly, setFailuresOnly] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("balance_ledger")
      .select(
        "id, correlation_id, user_id, actor_id, source, reason, success, error_message, delta_main, delta_bonus, delta_insurance, before_main, after_main, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (failuresOnly) q = q.eq("success", false);
    if (search.trim()) {
      const s = search.trim();
      q = q.or(`correlation_id.ilike.%${s}%,user_id.eq.${s},source.ilike.%${s}%`);
    }
    const { data, error } = await q;
    if (error) console.error("[BalanceLedgerPanel] load error:", error);
    setRows((data as LedgerRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failuresOnly]);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">Balance Ledger</h3>
          <p className="text-xs text-muted-foreground">
            Every credit and debit, including failures, with correlation IDs for tracing.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Button
            variant={failuresOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setFailuresOnly((v) => !v)}
          >
            <AlertTriangle className="w-4 h-4 mr-1" />
            {failuresOnly ? "Failures only" : "All"}
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Search correlation id, user id, or source…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <Button variant="outline" onClick={load}>
          <Search className="w-4 h-4" />
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b">
              <th className="text-left p-2">When</th>
              <th className="text-left p-2">Source</th>
              <th className="text-left p-2">User</th>
              <th className="text-right p-2">Δ Main</th>
              <th className="text-right p-2">Δ Bonus</th>
              <th className="text-right p-2">Δ Ins.</th>
              <th className="text-left p-2">Correlation</th>
              <th className="text-left p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b hover:bg-muted/30 align-top">
                <td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                <td className="p-2">{r.source ?? "—"}</td>
                <td className="p-2 font-mono">{r.user_id.slice(0, 8)}…</td>
                <td className="p-2 text-right font-mono">{fmt(r.delta_main)}</td>
                <td className="p-2 text-right font-mono">{fmt(r.delta_bonus)}</td>
                <td className="p-2 text-right font-mono">{fmt(r.delta_insurance)}</td>
                <td className="p-2 font-mono break-all max-w-[200px]">{r.correlation_id ?? "—"}</td>
                <td className="p-2">
                  {r.success ? (
                    <Badge variant="outline">ok</Badge>
                  ) : (
                    <div>
                      <Badge variant="destructive">failed</Badge>
                      {r.error_message && (
                        <div className="text-destructive mt-1 max-w-xs">{r.error_message}</div>
                      )}
                    </div>
                  )}
                  {r.reason && <div className="text-muted-foreground mt-1">{r.reason}</div>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  No ledger rows match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export default BalanceLedgerPanel;
