import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle, Clock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAdminContext } from "./AdminLayout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import AdminPagination from "@/components/admin/AdminPagination";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  processing: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  completed: "bg-green-500/10 text-green-500 border-green-500/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

const AdminWithdrawals = () => {
  const { canEdit } = useAdminContext();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [wdPage, setWdPage] = useState(1);
  const WD_PAGE_SIZE = 20;
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [txHashInput, setTxHashInput] = useState("");
  const [showActionModal, setShowActionModal] = useState<{
    id: string;
    action: "approve" | "reject";
    amount: number;
  } | null>(null);

  const { data: withdrawals = [], isLoading } = useQuery({
    queryKey: ["admin_withdrawals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const processMutation = useMutation({
    mutationFn: async ({
      withdrawal_id,
      action,
      admin_note,
      tx_hash,
    }: {
      withdrawal_id: string;
      action: string;
      admin_note?: string;
      tx_hash?: string;
    }) => {
      setProcessingId(withdrawal_id);
      const { data, error } = await supabase.functions.invoke(
        "process-withdrawal",
        { body: { withdrawal_id, action, admin_note, tx_hash } }
      );
      if (error || data?.error)
        throw new Error(data?.error || error?.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_withdrawals"] });
      setShowActionModal(null);
      setNoteInput("");
      setTxHashInput("");
      setProcessingId(null);
    },
    onError: () => {
      setProcessingId(null);
    },
  });

  const filtered = withdrawals.filter((w: any) =>
    !search ||
    w.wallet_address?.toLowerCase().includes(search.toLowerCase()) ||
    w.user_id?.toLowerCase().includes(search.toLowerCase()) ||
    w.status?.toLowerCase().includes(search.toLowerCase())
  );

  const paginatedWd = useMemo(() => filtered.slice((wdPage - 1) * WD_PAGE_SIZE, wdPage * WD_PAGE_SIZE), [filtered, wdPage]);
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">Withdrawals</h1>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by wallet, user, status..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No withdrawal requests found.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedWd.map((w: any) => (
                  <TableRow key={w.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(w.created_at), "MMM d, yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="font-bold">${Number(w.amount).toFixed(2)}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[140px] truncate">
                      {w.wallet_address}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                          statusColors[w.status] || ""
                        }`}
                      >
                        {w.status === "pending" && <Clock className="w-3 h-3" />}
                        {w.status === "completed" && <CheckCircle2 className="w-3 h-3" />}
                        {w.status === "rejected" && <XCircle className="w-3 h-3" />}
                        {w.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                      {w.admin_note || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {w.status === "pending" && canEdit && (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() =>
                              setShowActionModal({
                                id: w.id,
                                action: "approve",
                                amount: w.amount,
                              })
                            }
                            className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() =>
                              setShowActionModal({
                                id: w.id,
                                action: "reject",
                                amount: w.amount,
                              })
                            }
                            className="px-3 py-1.5 bg-destructive text-destructive-foreground rounded-lg text-xs font-semibold hover:bg-destructive/90 transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <AdminPagination page={wdPage} totalItems={filtered.length} pageSize={WD_PAGE_SIZE} onPageChange={setWdPage} />
        </>
      )}

      {/* Action modal */}
      {showActionModal && (
        <>
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
            onClick={() => setShowActionModal(null)}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-lg">
            <h3 className="text-lg font-bold mb-4">
              {showActionModal.action === "approve" ? "Approve" : "Reject"} Withdrawal — ${Number(showActionModal.amount).toFixed(2)}
            </h3>

            {showActionModal.action === "approve" && (
              <div className="mb-4">
                <label className="text-xs text-muted-foreground mb-1 block">Tx Hash (optional)</label>
                <Input
                  value={txHashInput}
                  onChange={(e) => setTxHashInput(e.target.value)}
                  placeholder="0x..."
                  className="font-mono text-xs"
                />
              </div>
            )}

            <div className="mb-5">
              <label className="text-xs text-muted-foreground mb-1 block">
                Mod Note {showActionModal.action === "reject" ? "(reason)" : "(optional)"}
              </label>
              <Input
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder={
                  showActionModal.action === "reject"
                    ? "Reason for rejection..."
                    : "Optional note..."
                }
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowActionModal(null);
                  setNoteInput("");
                  setTxHashInput("");
                }}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  processMutation.mutate({
                    withdrawal_id: showActionModal.id,
                    action: showActionModal.action,
                    admin_note: noteInput || undefined,
                    tx_hash: txHashInput || undefined,
                  })
                }
                disabled={processingId === showActionModal.id}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-colors flex items-center justify-center gap-2 ${
                  showActionModal.action === "approve"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-destructive hover:bg-destructive/90"
                }`}
              >
                {processingId === showActionModal.id && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {showActionModal.action === "approve" ? "Confirm Approve" : "Confirm Reject"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminWithdrawals;
