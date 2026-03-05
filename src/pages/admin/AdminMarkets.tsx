import React, { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Loader2, Trash2, CheckCircle, XCircle, Gavel, Plus, Pencil, Check, X, ChevronDown, ChevronUp, TrendingUp, Pin, ShieldAlert, ShieldCheck, Ban } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import BulkCSVImport from "@/components/admin/BulkCSVImport";
import AdminPagination from "@/components/admin/AdminPagination";

const CATEGORIES = ["Crypto", "AI & Tech", "Science", "Economy", "Entertainment", "Sports", "Politics", "Other"];

interface MarketRow {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  market_type: string;
  volume: number;
  participants: number;
  yes_price: number;
  end_date: string;
  created_at: string;
  resolution_source: string;
  trending: boolean;
  pinned_trending: boolean;
  creator_wallet: string;
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

interface TrendingScore {
  market_id: string;
  volume_score: number;
  participant_score: number;
  recent_bets_score: number;
  comments_score: number;
  likes_score: number;
  total_score: number;
}

interface EditState {
  id: string;
  title: string;
  description: string;
  category: string;
  end_date: string;
  resolution_source: string;
  trending: boolean;
}

const AdminMarkets = () => {
  const navigate = useNavigate();
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [pendingMarkets, setPendingMarkets] = useState<MarketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "active" | "resolved" | "cancelled">("all");
  const [resolveState, setResolveState] = useState<ResolveState | null>(null);
  const [resolving, setResolving] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [trendingScores, setTrendingScores] = useState<Map<string, TrendingScore>>(new Map());
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [mktPage, setMktPage] = useState(1);
  const MKT_PAGE_SIZE = 20;
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [cancellingPendingId, setCancellingPendingId] = useState<string | null>(null);

  const fetchMarkets = async () => {
    let query = supabase
      .from("markets")
      .select("id, title, description, category, status, market_type, volume, participants, yes_price, end_date, created_at, resolution_source, trending, pinned_trending, creator_wallet")
      .order("created_at", { ascending: false });
    if (filter !== "all") query = query.eq("status", filter);
    const { data, error } = await query;
    if (!error && data) setMarkets(data);
    setLoading(false);
  };

  const [feeBasedMarketIds, setFeeBasedMarketIds] = useState<Set<string>>(new Set());

  const fetchPendingMarkets = async () => {
    const { data } = await supabase
      .from("markets")
      .select("id, title, description, category, status, market_type, volume, participants, yes_price, end_date, created_at, resolution_source, trending, pinned_trending, creator_wallet")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (data) {
      setPendingMarkets(data);
      // Check which pending markets were created via fee bypass
      const ids = data.map(m => m.id);
      if (ids.length > 0) {
        const { data: feeTxns } = await supabase
          .from("transactions")
          .select("market_id")
          .in("market_id", ids)
          .eq("side", "market_creation_fee")
          .eq("status", "confirmed");
        if (feeTxns) {
          setFeeBasedMarketIds(new Set(feeTxns.map(t => t.market_id!)));
        }
      }
    }
  };

  useEffect(() => { fetchMarkets(); fetchTrendingScores(); fetchPendingMarkets(); setMktPage(1); }, [filter]);

  const paginatedMarkets = useMemo(() => markets.slice((mktPage - 1) * MKT_PAGE_SIZE, mktPage * MKT_PAGE_SIZE), [markets, mktPage]);

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    const market = pendingMarkets.find(m => m.id === id) || markets.find(m => m.id === id);
    const { error } = await supabase.from("markets").update({ status: "active" }).eq("id", id);
    if (error) { toast.error("Failed to approve"); }
    else {
      toast.success("Market approved and now live!");
      // Notify creator to place their first prediction
      if (market?.creator_wallet) {
        await supabase.from("notifications").insert({
          user_id: market.creator_wallet,
          title: "Market Approved! 🎉",
          message: `Your market "${market.title}" has been approved! Place your first prediction (min $5) to make it visible to everyone.`,
          type: "info",
          market_id: id,
        });
      }
      fetchMarkets(); fetchPendingMarkets();
    }
    setApprovingId(null);
  };

  const handleReject = async (id: string) => {
    if (!confirm("Reject this market for content violation? The creation fee will be FORFEITED (not refunded). Only the initial liquidity will be refunded.")) return;
    setRejectingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-market", {
        body: { market_id: id, reason: "moderation" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const feeMsg = data?.creation_fee_forfeited > 0 ? ` Creation fee ($${data.creation_fee_forfeited}) forfeited.` : "";
      toast.success(`Market rejected.${feeMsg} Liquidity refunded.`);
      fetchMarkets();
      fetchPendingMarkets();
    } catch (err: any) {
      toast.error(err?.message || "Failed to reject market");
    }
    setRejectingId(null);
  };

  const fetchTrendingScores = async () => {
    const { data, error } = await supabase.rpc("get_trending_scores");
    if (!error && data) {
      const map = new Map<string, TrendingScore>();
      (data as TrendingScore[]).forEach((s) => map.set(s.market_id, s));
      setTrendingScores(map);
    }
  };

  useEffect(() => {
    if (editState && titleInputRef.current) titleInputRef.current.focus();
  }, [editState?.id]);

  const startEdit = (m: MarketRow) => {
    setEditState({ id: m.id, title: m.title, description: m.description, category: m.category, end_date: m.end_date, resolution_source: m.resolution_source, trending: m.trending });
    setExpandedId(m.id);
  };

  const cancelEdit = () => setEditState(null);

  const saveEdit = async () => {
    if (!editState) return;
    if (editState.title.trim().length < 5) { toast.error("Title must be at least 5 characters"); return; }
    setSaving(true);
    const { error } = await supabase.from("markets").update({
      title: editState.title.trim(),
      description: editState.description.trim(),
      category: editState.category,
      end_date: editState.end_date,
      resolution_source: editState.resolution_source.trim(),
      trending: editState.trending,
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
    try {
      const { data, error } = await supabase.functions.invoke("resolve-market", {
        body: {
          market_id: market.id,
          winning_side: winningSide,
          winning_option_id: winningOptionId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Market resolved! ${data.winners} winners paid out $${data.total_paid_out?.toFixed(2)}`);
      setResolveState(null);
      fetchMarkets();
    } catch (err: any) {
      toast.error(err?.message || "Failed to resolve market");
    }
    setResolving(false);
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Cancel this market and refund all bets?")) return;
    try {
      const { data, error } = await supabase.functions.invoke("cancel-market", {
        body: { market_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Market cancelled! ${data.users_refunded} users refunded $${data.total_refunded?.toFixed(2)}`);
      fetchMarkets();
    } catch (err: any) {
      toast.error(err?.message || "Failed to cancel market");
    }
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-xl sm:text-2xl font-bold">Markets ({markets.length})</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <BulkCSVImport onComplete={fetchMarkets} />
          <button
            onClick={() => navigate("/admin/create-market")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            Create
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 overflow-x-auto scrollbar-hide">
        {(["all", "pending", "active", "resolved", "cancelled"] as const).map((f) => (
          <button
            key={f}
            onClick={() => { setLoading(true); setFilter(f); }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize whitespace-nowrap ${
              filter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Pending Review Section */}
      {pendingMarkets.length > 0 && filter !== "pending" && (
        <div className="bg-card border border-yellow-500/30 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-yellow-500/5 border-b border-yellow-500/20">
            <ShieldAlert className="w-4 h-4 text-yellow-500" />
            <h3 className="text-sm font-bold text-yellow-500">Pending Review ({pendingMarkets.length})</h3>
            <span className="text-xs text-muted-foreground ml-2">Markets awaiting moderation approval</span>
          </div>
          <div className="divide-y divide-border/50">
            {pendingMarkets.map((m) => (
              <div key={m.id} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-start gap-3 hover:bg-muted/20 transition-colors">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold truncate">{m.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.description}</p>
                  <div className="flex items-center gap-2 sm:gap-3 mt-2 flex-wrap">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.category}</span>
                    <span className="text-[10px] text-muted-foreground">•</span>
                    <span className="text-[10px] text-muted-foreground">{m.market_type}</span>
                    <span className="text-[10px] text-muted-foreground">•</span>
                    <span className="text-[10px] text-muted-foreground">Ends {new Date(m.end_date).toLocaleDateString()}</span>
                    <span className="text-[10px] text-muted-foreground hidden sm:inline">•</span>
                    <span className="text-[10px] text-muted-foreground hidden sm:inline">Created {new Date(m.created_at).toLocaleDateString()}</span>
                    {feeBasedMarketIds.has(m.id) && (
                      <>
                        <span className="text-[10px] text-muted-foreground">•</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/15 text-primary border border-primary/30">
                          💰 Fee-Based
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleApprove(m.id)}
                    disabled={approvingId === m.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {approvingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    Approve
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm("Cancel this pending market? The creator will receive a FULL refund (including creation fee).")) return;
                      setCancellingPendingId(m.id);
                      try {
                        const { data, error } = await supabase.functions.invoke("cancel-market", {
                          body: { market_id: m.id },
                        });
                        if (error) throw error;
                        if (data?.error) throw new Error(data.error);
                        toast.success("Market cancelled — full refund issued.");
                        fetchMarkets();
                        fetchPendingMarkets();
                      } catch (err: any) {
                        toast.error(err?.message || "Failed to cancel market");
                      }
                      setCancellingPendingId(null);
                    }}
                    disabled={cancellingPendingId === m.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-semibold hover:bg-muted/80 transition-all active:scale-95 disabled:opacity-50"
                    title="Cancel with full refund (including creation fee)"
                  >
                    {cancellingPendingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    Cancel
                  </button>
                  <button
                    onClick={() => handleReject(m.id)}
                    disabled={rejectingId === m.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 transition-all active:scale-95 disabled:opacity-50"
                    title="Reject for content violation — creation fee forfeited"
                  >
                    {rejectingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
              {paginatedMarkets.map((m) => {
                const isEditing = editState?.id === m.id;
                const isExpanded = expandedId === m.id;
                return (
                  <React.Fragment key={m.id}>
                    <tr className={`border-b border-border/50 ${isEditing ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                      {/* Title + expand toggle */}
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
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : m.id)}
                              className="p-0.5 rounded hover:bg-muted text-muted-foreground shrink-0"
                              title="Toggle description"
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                            <span className="font-medium truncate block">{m.title}</span>
                          </div>
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
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            m.status === "active" ? "bg-green-500/10 text-green-500" :
                            m.status === "resolved" ? "bg-blue-500/10 text-blue-500" :
                            "bg-yellow-500/10 text-yellow-500"
                          }`}>
                            {m.status}
                          </span>
                          {m.status === "pending" && feeBasedMarketIds.has(m.id) && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/15 text-primary">
                              💰
                            </span>
                          )}
                        </div>
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
                              {m.status === "pending" && (
                                <button
                                  onClick={async () => {
                                    const { error } = await supabase.from("markets").update({ status: "active" }).eq("id", m.id);
                                    if (error) { toast.error("Failed to approve"); return; }
                                    toast.success("Market approved and now live!");
                                    if (m.creator_wallet) {
                                      await supabase.from("notifications").insert({
                                        user_id: m.creator_wallet,
                                        title: "Market Approved! 🎉",
                                        message: `Your market "${m.title}" has been approved! Place your first prediction (min $5) to make it visible to everyone.`,
                                        type: "info",
                                        market_id: m.id,
                                      });
                                    }
                                    fetchMarkets();
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors"
                                  title="Approve Market"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                              )}
                              {(m.status === "active" || m.status === "pending") && (
                                <>
                                  {m.status === "active" && (
                                    <button
                                      onClick={() => openResolveModal(m)}
                                      className="p-1.5 rounded-lg hover:bg-green-500/10 text-green-500 transition-colors"
                                      title="Resolve Market"
                                    >
                                      <Gavel className="w-4 h-4" />
                                    </button>
                                  )}
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
                    {/* Expandable description row */}
                    {isExpanded && (
                      <tr className={`border-b border-border/50 ${isEditing ? "bg-primary/5" : "bg-muted/20"}`}>
                        <td colSpan={7} className="px-3 py-3">
                          <div className="pl-6 space-y-3">
                            {/* Description */}
                            <div>
                              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1 block">Description</label>
                              {isEditing ? (
                                <textarea
                                  value={editState.description}
                                  onChange={(e) => setEditState({ ...editState, description: e.target.value })}
                                  rows={3}
                                  className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                                  placeholder="Market description..."
                                />
                              ) : (
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{m.description || "No description"}</p>
                              )}
                            </div>

                            {/* Resolution Source */}
                            <div>
                              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1 block">Resolution Source</label>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editState.resolution_source}
                                  onChange={(e) => setEditState({ ...editState, resolution_source: e.target.value })}
                                  className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                  placeholder="e.g. CoinGecko price data..."
                                />
                              ) : (
                                <p className="text-sm text-muted-foreground">{m.resolution_source || "Not specified"}</p>
                              )}
                            </div>

                            {/* Trending */}
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Trending</label>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                m.trending ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                              }`}>
                                {m.trending ? "Yes" : "No"}
                              </span>
                            </div>

                            {/* Pin as Trending */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <Pin className="w-3 h-3 text-muted-foreground" />
                                <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Pin as Trending</label>
                              </div>
                              <button
                                onClick={async () => {
                                  const newVal = !m.pinned_trending;
                                  const { error } = await supabase.from("markets").update({ pinned_trending: newVal, trending: newVal || m.trending }).eq("id", m.id);
                                  if (error) { toast.error("Failed to update"); return; }
                                  toast.success(newVal ? "Market pinned as trending" : "Market unpinned");
                                  fetchMarkets();
                                }}
                                className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all active:scale-95 ${
                                  m.pinned_trending
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                }`}
                              >
                                {m.pinned_trending ? "📌 Pinned" : "Pin"}
                              </button>
                            </div>

                            {/* Trending Score Breakdown */}
                            {(() => {
                              const score = trendingScores.get(m.id);
                              if (!score) return null;
                              const bars = [
                                { label: "Volume", value: score.volume_score, max: 40, color: "bg-primary" },
                                { label: "Participants", value: score.participant_score, max: 20, color: "bg-primary/80" },
                                { label: "Recent Bets (48h)", value: score.recent_bets_score, max: 20, color: "bg-primary/60" },
                                { label: "Comments (48h)", value: score.comments_score, max: 10, color: "bg-primary/50" },
                                { label: "Likes (48h)", value: score.likes_score, max: 10, color: "bg-primary/40" },
                              ];
                              return (
                                <div>
                                  <div className="flex items-center gap-2 mb-2">
                                    <TrendingUp className="w-3.5 h-3.5 text-primary" />
                                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                                      Trending Score
                                    </label>
                                    <span className="text-sm font-bold text-primary ml-auto">
                                      {Number(score.total_score).toFixed(1)} / 100
                                    </span>
                                  </div>
                                  <div className="space-y-1.5">
                                    {bars.map((bar) => (
                                      <div key={bar.label} className="flex items-center gap-2">
                                        <span className="text-[10px] text-muted-foreground w-28 shrink-0">{bar.label}</span>
                                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                          <div
                                            className={`h-full rounded-full ${bar.color} transition-all`}
                                            style={{ width: `${(Number(bar.value) / bar.max) * 100}%` }}
                                          />
                                        </div>
                                        <span className="text-[10px] font-mono text-muted-foreground w-10 text-right">
                                          {Number(bar.value).toFixed(1)}/{bar.max}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {markets.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No markets found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <AdminPagination page={mktPage} totalItems={markets.length} pageSize={MKT_PAGE_SIZE} onPageChange={setMktPage} />

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
