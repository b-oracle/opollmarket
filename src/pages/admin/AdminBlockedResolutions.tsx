import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, ShieldAlert, AlertOctagon, Gavel, RefreshCw, ExternalLink } from "lucide-react";
import { logAuditEvent } from "@/lib/auditLog";
import { motion, AnimatePresence } from "framer-motion";

interface BlockedMarket {
  id: string;
  title: string;
  category: string;
  status: string;
  market_type: string;
  end_date: string | null;
  auto_resolve_deadline: string | null;
  resolution_block_reason: string | null;
  resolution_blocked_at: string | null;
  volume: number;
  participants: number;
  resolution_source: string | null;
}

interface MarketOption {
  id: string;
  label: string;
  sort_order: number;
}

const AdminBlockedResolutions = () => {
  const { isSuperAdmin, rolesLoaded } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [markets, setMarkets] = useState<BlockedMarket[]>([]);

  // Void modal state
  const [voidTarget, setVoidTarget] = useState<BlockedMarket | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  // Approve resolve modal state
  const [resolveTarget, setResolveTarget] = useState<BlockedMarket | null>(null);
  const [resolveOptions, setResolveOptions] = useState<MarketOption[]>([]);
  const [winningSide, setWinningSide] = useState<string | null>(null);
  const [winningOptionId, setWinningOptionId] = useState<string | null>(null);
  const [acknowledgeReason, setAcknowledgeReason] = useState("");
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (rolesLoaded && !isSuperAdmin) {
      navigate("/admin");
    }
  }, [rolesLoaded, isSuperAdmin, navigate]);

  const fetchBlocked = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("markets")
      .select("id, title, category, status, market_type, end_date, auto_resolve_deadline, resolution_block_reason, resolution_blocked_at, volume, participants, resolution_source")
      .eq("resolution_blocked", true)
      .neq("status", "cancelled")
      .neq("status", "resolved")
      .order("resolution_blocked_at", { ascending: false });

    if (error) {
      toast.error("Failed to load blocked markets");
    } else {
      setMarkets((data || []) as BlockedMarket[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isSuperAdmin) fetchBlocked();
  }, [isSuperAdmin]);

  const openVoid = (m: BlockedMarket) => {
    setVoidReason("");
    setVoidTarget(m);
  };

  const confirmVoid = async () => {
    if (!voidTarget) return;
    if (voidReason.trim().length < 10) {
      toast.error("Please provide a reason of at least 10 characters");
      return;
    }
    setVoiding(true);
    try {
      const { data, error } = await supabase.functions.invoke("void-and-refund", {
        body: { market_id: voidTarget.id, reason: voidReason.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(
        `Voided "${voidTarget.title}" — refunded ${data.users_refunded} users $${Number(data.total_refunded || 0).toFixed(2)}`
      );
      logAuditEvent({
        action: "blocked_market_voided",
        targetId: voidTarget.id,
        targetType: "market",
        details: { title: voidTarget.title, reason: voidReason.trim(), block_reason: voidTarget.resolution_block_reason },
      });
      setVoidTarget(null);
      fetchBlocked();
    } catch (err: any) {
      const msg = err?.message || "";
      if (/Failed to send a request to the Edge Function|Failed to fetch|network|timeout/i.test(msg)) {
        toast.message("Void is processing in the background. Refreshing in a moment…");
        setTimeout(() => fetchBlocked(), 4000);
        setVoidTarget(null);
      } else {
        toast.error(msg || "Failed to void market");
      }
    }
    setVoiding(false);
  };

  const openApprove = async (m: BlockedMarket) => {
    setWinningSide(null);
    setWinningOptionId(null);
    setAcknowledgeReason("");
    setResolveOptions([]);
    if (m.market_type === "multi" || m.market_type === "range") {
      const { data } = await supabase
        .from("market_options")
        .select("id, label, sort_order")
        .eq("market_id", m.id)
        .order("sort_order");
      setResolveOptions((data || []) as MarketOption[]);
    }
    setResolveTarget(m);
  };

  const confirmApproveResolve = async () => {
    if (!resolveTarget) return;
    if (resolveTarget.market_type === "binary" && !winningSide) {
      toast.error("Select the winning side");
      return;
    }
    if ((resolveTarget.market_type === "multi" || resolveTarget.market_type === "range") && !winningOptionId) {
      toast.error("Select the winning option");
      return;
    }
    if (acknowledgeReason.trim().length < 10) {
      toast.error("Document why this resolution is safe to approve (min 10 chars)");
      return;
    }
    setResolving(true);
    try {
      const { data, error } = await supabase.functions.invoke("resolve-market", {
        body: {
          market_id: resolveTarget.id,
          winning_side: winningSide,
          winning_option_id: winningOptionId,
          force: true,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Resolved! ${data.winners} winners paid $${Number(data.total_paid_out || 0).toFixed(2)}`);
      logAuditEvent({
        action: "blocked_market_force_resolved",
        targetId: resolveTarget.id,
        targetType: "market",
        details: {
          title: resolveTarget.title,
          winning_side: winningSide,
          winning_option_id: winningOptionId,
          override_reason: acknowledgeReason.trim(),
          original_block_reason: resolveTarget.resolution_block_reason,
        },
      });
      setResolveTarget(null);
      fetchBlocked();
    } catch (err: any) {
      const msg = err?.message || "";
      if (/Failed to send a request to the Edge Function|Failed to fetch|network|timeout/i.test(msg)) {
        toast.message("Resolution is processing in the background. Refreshing in a moment…");
        setTimeout(() => fetchBlocked(), 4000);
        setResolveTarget(null);
      } else {
        toast.error(msg || "Failed to resolve market");
      }
    }
    setResolving(false);
  };

  if (!rolesLoaded || (rolesLoaded && !isSuperAdmin)) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-amber-500" />
            Blocked Resolutions
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Markets flagged with abnormal resolution conditions. Review before voiding or force-resolving.
          </p>
        </div>
        <button
          onClick={fetchBlocked}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : markets.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/50 p-10 text-center">
          <ShieldAlert className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-base font-semibold">No blocked markets</p>
          <p className="text-sm text-muted-foreground mt-1">
            All markets are clear of abnormal-termination flags.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {markets.map((m) => (
            <div
              key={m.id}
              className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 text-[10px] font-bold uppercase tracking-wider">
                    Blocked
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-muted text-foreground/70 text-[10px] font-semibold uppercase">
                    {m.status}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{m.category}</span>
                </div>
                <h3 className="text-sm font-semibold mt-2 line-clamp-2">{m.title}</h3>
                <p className="text-xs text-amber-600 mt-1.5 font-medium">
                  Reason: {m.resolution_block_reason || "Unspecified abnormal termination"}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground mt-2">
                  <span>Volume ${Number(m.volume || 0).toFixed(2)}</span>
                  <span>{m.participants} participants</span>
                  {m.auto_resolve_deadline && (
                    <span>Deadline {new Date(m.auto_resolve_deadline).toLocaleString()}</span>
                  )}
                  {m.resolution_blocked_at && (
                    <span>Flagged {new Date(m.resolution_blocked_at).toLocaleString()}</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  onClick={() => navigate(`/markets/${m.id}`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs font-semibold hover:bg-muted/80 transition-all"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View
                </button>
                <button
                  onClick={() => openApprove(m)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 text-xs font-semibold hover:bg-emerald-500/20 transition-all"
                >
                  <Gavel className="w-3.5 h-3.5" />
                  Approve Resolution
                </button>
                <button
                  onClick={() => openVoid(m)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 transition-all"
                >
                  <AlertOctagon className="w-3.5 h-3.5" />
                  Void & Refund
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Void modal */}
      <AnimatePresence>
        {voidTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
            onClick={() => !voiding && setVoidTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-card border border-border p-5 shadow-2xl"
            >
              <h2 className="text-base font-bold flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-destructive" />
                Void & Refund
              </h2>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{voidTarget.title}</p>
              <div className="mt-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-600">
                Block reason: {voidTarget.resolution_block_reason || "Unspecified"}
              </div>
              <label className="block text-xs font-semibold mt-4 mb-1.5">Reason (audit log)</label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Explain why this market is being voided (min 10 chars)…"
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-destructive/40"
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  disabled={voiding}
                  onClick={() => setVoidTarget(null)}
                  className="px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs font-semibold hover:bg-muted/80"
                >
                  Cancel
                </button>
                <button
                  disabled={voiding}
                  onClick={confirmVoid}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold hover:bg-destructive/90 disabled:opacity-50"
                >
                  {voiding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertOctagon className="w-3.5 h-3.5" />}
                  Confirm Void
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Approve resolution modal */}
      <AnimatePresence>
        {resolveTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
            onClick={() => !resolving && setResolveTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-card border border-border p-5 shadow-2xl"
            >
              <h2 className="text-base font-bold flex items-center gap-2">
                <Gavel className="w-5 h-5 text-emerald-500" />
                Approve Resolution
              </h2>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{resolveTarget.title}</p>
              <div className="mt-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-600">
                Block reason: {resolveTarget.resolution_block_reason || "Unspecified"}
              </div>
              {resolveTarget.resolution_source && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  Resolution source: {resolveTarget.resolution_source}
                </p>
              )}

              {resolveTarget.market_type === "binary" ? (
                <div className="mt-4">
                  <label className="block text-xs font-semibold mb-1.5">Winning side</label>
                  <div className="grid grid-cols-2 gap-2">
                    {["yes", "no"].map((side) => (
                      <button
                        key={side}
                        onClick={() => setWinningSide(side)}
                        className={`px-3 py-2 rounded-lg text-xs font-bold uppercase border transition-all ${
                          winningSide === side
                            ? side === "yes"
                              ? "bg-emerald-500 text-white border-emerald-500"
                              : "bg-destructive text-destructive-foreground border-destructive"
                            : "bg-background border-border hover:bg-muted"
                        }`}
                      >
                        {side}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <label className="block text-xs font-semibold mb-1.5">Winning option</label>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {resolveOptions.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setWinningOptionId(opt.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                          winningOptionId === opt.id
                            ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/40"
                            : "bg-background border-border hover:bg-muted"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="block text-xs font-semibold mt-4 mb-1.5">
                Override justification (audit log)
              </label>
              <textarea
                value={acknowledgeReason}
                onChange={(e) => setAcknowledgeReason(e.target.value)}
                placeholder="Document the manual verification done before approving (min 10 chars)…"
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />

              <div className="flex justify-end gap-2 mt-4">
                <button
                  disabled={resolving}
                  onClick={() => setResolveTarget(null)}
                  className="px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs font-semibold hover:bg-muted/80"
                >
                  Cancel
                </button>
                <button
                  disabled={resolving}
                  onClick={confirmApproveResolve}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-500/90 disabled:opacity-50"
                >
                  {resolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gavel className="w-3.5 h-3.5" />}
                  Force Resolve
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminBlockedResolutions;
