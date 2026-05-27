import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Undo2, CheckCircle2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { logAuditEvent } from "@/lib/auditLog";
import AdminPagination from "@/components/admin/AdminPagination";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Escrow = {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  created_at: string;
  released_at: string | null;
  display_name?: string;
  email?: string;
};

const TABS = ["all", "held", "refunded", "used"] as const;
type Tab = typeof TABS[number];

const PAGE_SIZE = 20;

const AdminEscrows = () => {
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [confirm, setConfirm] = useState<{ id: string; action: "refunded" | "used"; amount: number; user: string } | null>(null);
  const [acting, setActing] = useState(false);

  const fetchEscrows = async () => {
    setLoading(true);
    let q = supabase
      .from("creation_fee_escrows" as any)
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (tab !== "all") q = q.eq("status", tab);

    const { data, count, error } = await q;
    if (error) { setLoading(false); return; }

    const rows = (data || []) as any[];
    const userIds = [...new Set(rows.map((r: any) => r.user_id))];

    let profiles: Record<string, { display_name: string; email: string }> = {};
    if (userIds.length) {
      const { data: pData } = await supabase.rpc("admin_get_user_emails", {
        _user_ids: userIds,
      });
      ((pData as any[]) || []).forEach((p: any) => { profiles[p.id] = p; });
    }

    setEscrows(rows.map((r: any) => ({
      ...r,
      display_name: profiles[r.user_id]?.display_name || "Unknown",
      email: profiles[r.user_id]?.email || "",
    })));
    setTotal(count || 0);
    setLoading(false);
  };

  useEffect(() => { setPage(1); }, [tab]);
  useEffect(() => { fetchEscrows(); }, [tab, page]);

  const handleRelease = async () => {
    if (!confirm) return;
    setActing(true);
    const { data, error } = await supabase.rpc("release_creation_fee_escrow" as any, {
      _escrow_id: confirm.id,
      _action: confirm.action,
    });

    const result = data as any;
    if (error || !result?.success) {
      toast({ title: "Error", description: error?.message || result?.error || "Failed", variant: "destructive" });
    } else {
      toast({ title: confirm.action === "refunded" ? "Refunded" : "Marked Used", description: `$${confirm.amount} ${confirm.action === "refunded" ? "returned to user" : "credited to platform pool"}.` });
      logAuditEvent({
        action: "balance_adjusted",
        targetId: confirm.id,
        targetType: "escrow",
        details: { action: confirm.action, amount: confirm.amount, user: confirm.user },
      });
      fetchEscrows();
    }
    setActing(false);
    setConfirm(null);
  };

  const statusBadge = (s: string) => {
    if (s === "held") return <Badge className="bg-amber-500/15 text-amber-600 border-0">Held</Badge>;
    if (s === "refunded") return <Badge className="bg-emerald-500/15 text-emerald-600 border-0">Refunded</Badge>;
    return <Badge className="bg-blue-500/15 text-blue-600 border-0">Used</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Creation Fee Escrows</h2>
        <Button variant="outline" size="sm" onClick={fetchEscrows} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="flex gap-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
              tab === t ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Escrows</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : escrows.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">No escrows found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Released</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {escrows.map((e) => (
                    <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium">{e.display_name}</div>
                        <div className="text-xs text-muted-foreground">{e.email}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold">${e.amount}</td>
                      <td className="px-4 py-3">{statusBadge(e.status)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-muted-foreground">{e.released_at ? new Date(e.released_at).toLocaleDateString() : "—"}</td>
                      <td className="px-4 py-3 text-right">
                        {e.status === "held" ? (
                          <div className="flex gap-1.5 justify-end">
                            <Button size="sm" variant="outline" onClick={() => setConfirm({ id: e.id, action: "refunded", amount: e.amount, user: e.display_name || "" })}>
                              <Undo2 className="w-3.5 h-3.5 mr-1" /> Refund
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => setConfirm({ id: e.id, action: "used", amount: e.amount, user: e.display_name || "" })}>
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Mark Used
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <AdminPagination page={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </CardContent>
      </Card>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.action === "refunded" ? "Refund Escrow" : "Mark Escrow Used"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "refunded"
                ? `This will return $${confirm?.amount} to ${confirm?.user}'s main balance.`
                : `This will credit $${confirm?.amount} to the platform pool.`}
              {" "}This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRelease} disabled={acting}>
              {acting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {confirm?.action === "refunded" ? "Refund" : "Mark Used"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminEscrows;
