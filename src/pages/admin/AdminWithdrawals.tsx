import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { logAuditEvent } from "@/lib/auditLog";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle, Clock, Search, RefreshCw, Copy, QrCode, X, ExternalLink, Banknote } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

const BANK_CODE_TO_NAME: Record<string, string> = {
  "044": "Access Bank", "023": "Citibank", "063": "Diamond (Access)", "050": "Ecobank",
  "084": "Enterprise Bank", "070": "Fidelity Bank", "011": "First Bank", "214": "FCMB",
  "058": "GTBank", "030": "Heritage Bank", "301": "Jaiz Bank", "082": "Keystone Bank",
  "526": "Kuda Bank", "100004": "OPay", "100002": "Paga", "999991": "PalmPay",
  "076": "Polaris Bank", "101": "Providus Bank", "221": "Stanbic IBTC",
  "068": "Standard Chartered", "232": "Sterling Bank", "100": "SunTrust Bank",
  "032": "Union Bank", "033": "United Bank (UBA)", "215": "Unity Bank",
  "035": "Wema Bank", "057": "Zenith Bank",
};

const getBankName = (code: string) => BANK_CODE_TO_NAME[code] || code;

const AdminWithdrawals = () => {
  const { canEdit } = useAdminContext();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [wdPage, setWdPage] = useState(1);
  const WD_PAGE_SIZE = 20;
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [txHashInput, setTxHashInput] = useState("");
  const [qrAddress, setQrAddress] = useState<string | null>(null);
  const [fiatDetails, setFiatDetails] = useState<{ bank_code: string; account_number: string; account_name: string; amount: number } | null>(null);
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

      // Enrich with profile info
      const userIds = [...new Set((data || []).map((w) => w.user_id))];
      const { data: profiles } = userIds.length
        ? await supabase.rpc("admin_get_profiles_with_email", { _ids: userIds })
        : { data: [] };
      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));

      return (data || []).map((w) => ({
        ...w,
        display_name: profileMap[w.user_id]?.display_name || "Unknown",
        email: profileMap[w.user_id]?.email || "",
      }));
    },
  });

  const filtered = withdrawals.filter((w: any) => {
    // Status filter
    if (statusFilter !== "all" && w.status !== statusFilter) return false;
    // Search filter
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      w.wallet_address?.toLowerCase().includes(s) ||
      w.user_id?.toLowerCase().includes(s) ||
      w.status?.toLowerCase().includes(s) ||
      w.email?.toLowerCase().includes(s) ||
      w.display_name?.toLowerCase().includes(s)
    );
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
    onSuccess: (_, variables) => {
      logAuditEvent({
        action: variables.action === "approve" ? "withdrawal_approved" : "withdrawal_rejected",
        targetId: variables.withdrawal_id,
        targetType: "withdrawal",
        details: { action: variables.action, note: variables.admin_note, tx_hash: variables.tx_hash },
      });
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

  const paginatedWd = useMemo(() => filtered.slice((wdPage - 1) * WD_PAGE_SIZE, wdPage * WD_PAGE_SIZE), [filtered, wdPage]);
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h1 className="text-xl sm:text-2xl font-bold">Withdrawals</h1>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by email, name, wallet..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setWdPage(1); }}
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex gap-1.5 mb-4">
        {[
          { value: "all", label: "All" },
          { value: "pending", label: "Pending" },
          { value: "processing", label: "Processing" },
          { value: "completed", label: "Completed" },
          { value: "rejected", label: "Rejected" },
        ].map((f) => (
          <Button
            key={f.value}
            variant={statusFilter === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => { setStatusFilter(f.value); setWdPage(1); }}
            className="text-xs"
          >
            {f.label}
          </Button>
        ))}
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
                  <TableHead>User</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead>TX Hash</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedWd.map((w: any) => (
                  <TableRow key={w.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{w.display_name}</div>
                      <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">{w.email || w.user_id.slice(0, 8)}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(w.created_at), "MMM d, yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="font-bold">${Number(w.amount).toFixed(2)}</TableCell>
                    <TableCell>
                      {(() => {
                        const isFiat = w.crypto_currency === "NGN";
                        const parts = isFiat ? w.wallet_address?.split(":") : null;
                        return (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs max-w-[100px] truncate" title={w.wallet_address}>
                              {isFiat && parts?.length === 3 ? `${parts[2]}` : w.wallet_address}
                            </span>
                            <button
                              onClick={() => { navigator.clipboard.writeText(isFiat && parts?.length === 3 ? parts[1] : w.wallet_address); toast.success(isFiat ? "Account number copied!" : "Wallet address copied!"); }}
                              className="p-1 rounded hover:bg-muted transition-colors shrink-0"
                              title={isFiat ? "Copy account number" : "Copy address"}
                            >
                              <Copy className="w-3 h-3 text-muted-foreground" />
                            </button>
                            {isFiat && parts?.length === 3 ? (
                              <button
                                onClick={() => setFiatDetails({ bank_code: parts[0], account_number: parts[1], account_name: parts[2], amount: w.amount })}
                                className="p-1 rounded hover:bg-muted transition-colors shrink-0"
                                title="View bank details"
                              >
                                <Banknote className="w-3 h-3 text-muted-foreground" />
                              </button>
                            ) : (
                              <button
                                onClick={() => setQrAddress(w.wallet_address)}
                                className="p-1 rounded hover:bg-muted transition-colors shrink-0"
                                title="Show QR code"
                              >
                                <QrCode className="w-3 h-3 text-muted-foreground" />
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      {w.tx_hash ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs max-w-[80px] truncate" title={w.tx_hash}>
                            {w.tx_hash}
                          </span>
                          <a
                            href={`https://bscscan.com/tx/${w.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded hover:bg-muted transition-colors shrink-0"
                            title="View on BscScan"
                          >
                            <ExternalLink className="w-3 h-3 text-primary" />
                          </a>
                        </div>
                      ) : w.nowpayments_id && w.status === "completed" ? (
                        <button
                          onClick={async () => {
                            setProcessingId(w.id);
                            try {
                              const { data, error } = await supabase.functions.invoke("verify-np-payout", {
                                body: { batch_id: w.nowpayments_id, action: "update_hash" },
                              });
                              if (error) throw error;
                              if (data?.updated > 0) {
                                toast.success("TX hash updated!");
                                queryClient.invalidateQueries({ queryKey: ["admin_withdrawals"] });
                              } else {
                                toast.info("Hash not yet available from payment provider");
                              }
                            } catch (e: any) {
                              toast.error(e.message || "Failed to fetch hash");
                            }
                            setProcessingId(null);
                          }}
                          disabled={processingId === w.id}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                          title="Fetch TX hash from payment provider"
                        >
                          {processingId === w.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          Fetch Hash
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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
                      {w.admin_note || (w.nowpayments_id || (w.crypto_currency === "NGN" && w.status === "completed" && !w.admin_note) ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 text-[10px] font-semibold">Auto</span>
                      ) : "—")}
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

      {/* QR Code Modal */}
      {qrAddress && (
        <>
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50" onClick={() => setQrAddress(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-xs bg-card border border-border rounded-2xl p-6 shadow-lg text-center">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold">Wallet QR Code</h3>
              <button onClick={() => setQrAddress(null)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrAddress)}`}
              alt="QR Code"
              className="mx-auto w-48 h-48 rounded-lg bg-white p-2"
            />
            <p className="font-mono text-[10px] text-muted-foreground mt-3 break-all">{qrAddress}</p>
            <button
              onClick={() => { navigator.clipboard.writeText(qrAddress); toast.success("Copied!"); }}
              className="mt-3 w-full py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" /> Copy Address
            </button>
          </div>
        </>
      )}

      {/* Fiat Bank Details Modal */}
      {fiatDetails && (
        <>
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50" onClick={() => setFiatDetails(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-xs bg-card border border-border rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold flex items-center gap-1.5"><Banknote className="w-4 h-4 text-primary" /> Recipient Bank Details</h3>
              <button onClick={() => setFiatDetails(null)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-muted/50 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Account Name</p>
                <p className="text-sm font-semibold">{fiatDetails.account_name}</p>
              </div>
              <div className="p-3 rounded-xl bg-muted/50 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Account Number</p>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-mono font-semibold">{fiatDetails.account_number}</p>
                  <button
                    onClick={() => { navigator.clipboard.writeText(fiatDetails.account_number); toast.success("Account number copied!"); }}
                    className="p-1 rounded hover:bg-muted transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-muted/50 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Bank</p>
                <p className="text-sm font-semibold">{getBankName(fiatDetails.bank_code)}</p>
              </div>
              <div className="p-3 rounded-xl bg-muted/50 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Withdrawal Amount</p>
                <p className="text-sm font-bold text-primary">${Number(fiatDetails.amount).toFixed(2)}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminWithdrawals;
