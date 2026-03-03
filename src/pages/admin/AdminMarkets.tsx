import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Loader2, Trash2, CheckCircle, XCircle, Gavel, Plus, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const CATEGORIES = ["Crypto", "AI & Tech", "Science", "Economy", "Entertainment", "Sports", "Politics", "Other"];

interface MarketRow {
  id: string;
  title: string;
  category: string;
  status: string;
  market_type: string;
  volume: number;
  participants: number;
  yes_price: number;
  end_date: string;
  created_at: string;
}

interface MarketOption {
  id: string;
  label: string;
  price: number;
  sort_order: number;
}

interface ResolveState {
  market: MarketRow;
  options: MarketOption[];
  winningSide: string | null;
  winningOptionId: string | null;
}

interface EditState {
  id: string;
  title: string;
  category: string;
  end_date: string;
}

const AdminMarkets = () => {
  const navigate = useNavigate();
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "resolved" | "cancelled">("all");
  const [resolveState, setResolveState] = useState<ResolveState | null>(null);
  const [resolving, setResolving] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const fetchMarkets = async () => {
    let query = supabase
      .from("markets")
      .select("id, title, category, status, market_type, volume, participants, yes_price, end_date, created_at")
      .order("created_at", { ascending: false });
    if (filter !== "all") query = query.eq("status", filter);
    const { data, error } = await query;
    if (!error && data) setMarkets(data);
    setLoading(false);
  };

  useEffect(() => { fetchMarkets(); }, [filter]);

  useEffect(() => {
    if (editState && titleInputRef.current) titleInputRef.current.focus();
  }, [editState?.id]);

  const startEdit = (m: MarketRow) => {
    setEditState({ id: m.id, title: m.title, category: m.category, end_date: m.end_date });
  };

  const cancelEdit = () => setEditState(null);

  const saveEdit = async () => {
    if (!editState) return;
    if (editState.title.trim().length < 5) { toast.error("Title must be at least 5 characters"); return; }
    setSaving(true);
    const { error } = await supabase.from("markets").update({
      title: editState.title.trim(),
      category: editState.category,
      end_date: editState.end_date,
    }).eq("id", editState.id);
    if (error) toast.error("Failed to save changes");
    else { toast.success("Market updated"); setEditState(null); fetchMarkets(); }
    setSaving(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") cancelEdit();
  };

  const openResolveModal = async (market: MarketRow) => {
    if (market.market_type === "multi") {
      const { data } = await supabase
        .from("market_options")
        .select("id, label, price, sort_order")
        .eq("market_id", market.id)
        .order("sort_order");
      setResolveState({ market, options: data || [], winningSide: null, winningOptionId: null });
    } else {
      setResolveState({ market, options: [], winningSide: null, winningOptionId: null });
    }
  };

  const confirmResolve = async () => {
    if (!resolveState) return;
    const { market, winningSide, winningOptionId } = resolveState;
    if (market.market_type === "binary" && !winningSide) { toast.error("Select the winning side (Yes or No)"); return; }
    if (market.market_type === "multi" && !winningOptionId) { toast.error("Select the winning option"); return; }
    setResolving(true);
    const updateData: Record<string, unknown> = { status: "resolved" };
    if (market.market_type === "binary" && winningSide) {
      updateData.yes_price = winningSide === "yes" ? 1 : 0;
      updateData.no_price = winningSide === "no" ? 1 : 0;
    }
    const { error } = await supabase.from("markets").update(updateData).eq("id", market.id);
    if (market.market_type === "multi" && winningOptionId) {
      await supabase.from("market_options").update({ price: 0 }).eq("market_id", market.id);
      await supabase.from("market_options").update({ price: 1 }).eq("id", winningOptionId);
    }
    if (error) toast.error("Failed to resolve market");
    else { toast.success("Market resolved successfully!"); setResolveState(null); fetchMarkets(); }
    setResolving(false);
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Cancel this market? All bets will need to be refunded.")) return;
    const { error } = await supabase.from("markets").update({ status: "cancelled" }).eq("id", id);
    if (error) toast.error("Failed to cancel market");
    else { toast.success("Market cancelled"); fetchMarkets(); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Permanently delete this market and all related data?")) return;
    const { error } = await supabase.from("markets").delete().eq("id", id);
    if (error) toast.error("Failed to delete market");
    else { toast.success("Market deleted"); fetchMarkets(); }
  };

  const handleReactivate = async (id: string) => {
    const { error } = await supabase.from("markets").update({ status: "active" }).eq("id", id);
    if (error) toast.error("Failed to reactivate");
    else { toast.success("Market reactivated"); fetchMarkets(); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Markets ({markets.length})</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/admin/create-market")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Market
          </button>
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
            {(["all", "active", "resolved", "cancelled"] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setLoading(true); setFilter(f); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
                  filter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="p-3">Title</th>
                <th className="p-3">Category</th>
                <th className="p-3">Type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Volume</th>
                <th className="p-3">End Date</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m) => {
                const isEditing = editState?.id === m.id;
                return (
                  <tr key={m.id} className={`border-b border-border/50 ${isEditing ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                    {/* Title */}
                    <td className="p-3 max-w-[220px]">
                      {isEditing ? (
                        <input
                          ref={titleInputRef}
                          value={editState.title}
                          onChange={(e) => setEditState({ ...editState, title: e.target.value })}
                          onKeyDown={handleKeyDown}
                          className="w-full bg-muted/50 border border-border rounded-lg px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      ) : (
                        <span className="font-medium truncate block">{m.title}</span>
                      )}
                    </td>
                    {/* Category */}
                    <td className="p-3">
                      {isEditing ? (
                        <select
                          value={editState.category}
                          onChange={(e) => setEditState({ ...editState, category: e.target.value })}
                          className="bg-muted/50 border border-border rounded-lg px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground">{m.category}</span>
                      )}
                    </td>
                    {/* Type */}
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary">
                        {m.market_type}
                      </span>
                    </td>
                    {/* Status */}
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        m.status === "active" ? "bg-green-500/10 text-green-500" :
                        m.status === "resolved" ? "bg-blue-500/10 text-blue-500" :
                        "bg-yellow-500/10 text-yellow-500"
                      }`}>
                        {m.status}
                      </span>
                    </td>
                    {/* Volume */}
                    <td className="p-3 text-muted-foreground">${Number(m.volume).toLocaleString()}</td>
                    {/* End Date */}
                    <td className="p-3">
                      {isEditing ? (
                        <input
                          type="date"
                          value={editState.end_date}
                          onChange={(e) => setEditState({ ...editState, end_date: e.target.value })}
                          onKeyDown={handleKeyDown}
                          className="bg-muted/50 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      ) : (
                        <span className="text-muted-foreground text-xs">{new Date(m.end_date).toLocaleDateString()}</span>
                      )}
                    </td>
                    {/* Actions */}
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {isEditing ? (
                          <>
                            <button
                              onClick={saveEdit}
                              disabled={saving}
                              className="p-1.5 rounded-lg hover:bg-green-500/10 text-green-500 transition-colors"
                              title="Save"
                            >
                              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(m)}
                              className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            {m.status === "active" && (
                              <>
                                <button
                                  onClick={() => openResolveModal(m)}
                                  className="p-1.5 rounded-lg hover:bg-green-500/10 text-green-500 transition-colors"
                                  title="Resolve Market"
                                >
                                  <Gavel className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleCancel(m.id)}
                                  className="p-1.5 rounded-lg hover:bg-yellow-500/10 text-yellow-500 transition-colors"
                                  title="Cancel Market"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {(m.status === "resolved" || m.status === "cancelled") && (
                              <button
                                onClick={() => handleReactivate(m.id)}
                                className="p-1.5 rounded-lg hover:bg-blue-500/10 text-blue-500 transition-colors"
                                title="Reactivate"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(m.id)}
                              className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {markets.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No markets found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resolution Modal */}
      <AnimatePresence>
        {resolveState && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60"
              onClick={() => setResolveState(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-card border border-border rounded-2xl p-6 w-full max-w-md mx-4 z-10"
            >
              <div className="flex items-center gap-2 mb-1">
                <Gavel className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-bold">Resolve Market</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-5 line-clamp-2">{resolveState.market.title}</p>

              {resolveState.market.market_type === "binary" ? (
                <div className="space-y-2 mb-6">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Select winning outcome:</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setResolveState({ ...resolveState, winningSide: "yes" })}
                      className={`p-4 rounded-xl border-2 text-center font-bold text-sm transition-all ${
                        resolveState.winningSide === "yes"
                          ? "border-green-500 bg-green-500/10 text-green-500"
                          : "border-border hover:border-green-500/50 text-muted-foreground"
                      }`}
                    >
                      ✅ Yes
                    </button>
                    <button
                      onClick={() => setResolveState({ ...resolveState, winningSide: "no" })}
                      className={`p-4 rounded-xl border-2 text-center font-bold text-sm transition-all ${
                        resolveState.winningSide === "no"
                          ? "border-red-500 bg-red-500/10 text-red-500"
                          : "border-border hover:border-red-500/50 text-muted-foreground"
                      }`}
                    >
                      ❌ No
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 mb-6">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Select winning option:</p>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {resolveState.options.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setResolveState({ ...resolveState, winningOptionId: opt.id })}
                        className={`w-full p-3 rounded-xl border-2 text-left text-sm font-medium transition-all ${
                          resolveState.winningOptionId === opt.id
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:border-primary/50 text-muted-foreground"
                        }`}
                      >
                        {opt.label}
                        <span className="ml-2 text-xs opacity-60">{(opt.price * 100).toFixed(0)}%</span>
                      </button>
                    ))}
                    {resolveState.options.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No options found for this market</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setResolveState(null)}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmResolve}
                  disabled={resolving}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {resolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gavel className="w-4 h-4" />}
                  Confirm Resolution
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminMarkets;
