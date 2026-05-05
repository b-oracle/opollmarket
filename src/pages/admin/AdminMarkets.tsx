import React, { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Loader2, Trash2, CheckCircle, XCircle, Gavel, Plus, Pencil, Check, X, ChevronDown, ChevronUp, TrendingUp, Pin, ShieldAlert, ShieldCheck, Ban, BarChart3, Users, DollarSign, Layers, Clock, Archive, Flame, Eye, EyeOff, Download, ImagePlus, Sparkles, AlertOctagon } from "lucide-react";
import { compressImage } from "@/lib/imageCompression";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import RecordOnChainButton from "@/components/admin/RecordOnChainButton";
import { toast } from "sonner";
import { logAuditEvent } from "@/lib/auditLog";
import { motion, AnimatePresence } from "framer-motion";
import BulkCSVImport from "@/components/admin/BulkCSVImport";
import AdminPagination from "@/components/admin/AdminPagination";
import { useAdminContext } from "./AdminLayout";
import { useAuth } from "@/hooks/useAuth";
import RefundSummaryDialog, { RefundSummary } from "@/components/admin/RefundSummaryDialog";

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
  moderator_decision: string | null;
  moderator_id: string | null;
  moderator_reviewed_at: string | null;
  is_hidden: boolean;
  resolved_side: string | null;
  blockchain_tx_hash: string | null;
  image_url: string | null;
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
  image_url: string;
  newImageFile: File | null;
}
interface MarketStatsData {
  total: number;
  active: number;
  binary: number;
  multi: number;
  draft: number;
  pending: number;
  ended: number;
  resolved: number;
  cancelled: number;
  totalVolume: number;
  totalParticipants: number;
  totalLiquidity: number;
  trending: number;
  avgVolume: number;
  polymarket: number;
  boostedActive: number;
  boostedTotal: number;
}

const AdminMarkets = () => {
  const { canEdit } = useAdminContext();
  const { isSuperAdmin, isAdmin, isModerator, user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [pendingMarkets, setPendingMarkets] = useState<MarketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "active" | "ended" | "resolved" | "cancelled" | "polymarket">("all");
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
  const [moderatorReviewingId, setModeratorReviewingId] = useState<string | null>(null);
  const [moderatorNameMap, setModeratorNameMap] = useState<Map<string, string>>(new Map());
  const [endedCount, setEndedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [generatingAiImage, setGeneratingAiImage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [voidState, setVoidState] = useState<{ market: MarketRow; reason: string } | null>(null);
  const [voiding, setVoiding] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedMarkets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedMarkets.map(m => m.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Permanently delete ${selectedIds.size} selected market(s) and all related data? This cannot be undone.`)) return;
    setBatchDeleting(true);
    let deleted = 0;
    for (const id of selectedIds) {
      const { error } = await supabase.from("markets").delete().eq("id", id);
      if (!error) {
        deleted++;
        const market = markets.find(m => m.id === id);
        logAuditEvent({ action: "market_deleted", targetId: id, targetType: "market", details: { title: market?.title, batch: true } });
      }
    }
    toast.success(`${deleted} market(s) deleted`);
    setSelectedIds(new Set());
    setBatchDeleting(false);
    fetchMarkets();
    fetchGlobalStats();
  };

  // Global stats (fetched once, independent of filter)
  const [globalStats, setGlobalStats] = useState<MarketStatsData | null>(null);

  const fetchGlobalStats = async () => {
    // Batch-fetch ALL market rows to avoid 1000-row cap
    const fetchAllMarketRows = async () => {
      const allRows: { status: string; market_type: string; volume: number; participants: number; liquidity: number; trending: boolean; polymarket_id: string | null }[] = [];
      let from = 0;
      const batchSize = 1000;
      while (true) {
        const { data: batch, error } = await supabase.from("markets").select("status, market_type, volume, participants, liquidity, trending, polymarket_id").range(from, from + batchSize - 1);
        if (error || !batch || batch.length === 0) break;
        allRows.push(...batch);
        if (batch.length < batchSize) break;
        from += batchSize;
      }
      return allRows;
    };
    const [data, { data: boosts }] = await Promise.all([
      fetchAllMarketRows(),
      supabase.from("market_boosts").select("status"),
    ]);
    if (!data || data.length === 0) return;
    const stats: MarketStatsData = {
      total: data.length,
      active: data.filter(m => m.status === "active").length,
      binary: data.filter(m => m.market_type === "binary").length,
      multi: data.filter(m => m.market_type === "multi").length,
      draft: data.filter(m => m.status === "draft").length,
      pending: data.filter(m => m.status === "pending").length,
      ended: data.filter(m => m.status === "ended").length,
      resolved: data.filter(m => m.status === "resolved").length,
      cancelled: data.filter(m => m.status === "cancelled").length,
      totalVolume: data.reduce((s, m) => s + Number(m.volume || 0), 0),
      totalParticipants: data.reduce((s, m) => s + Number(m.participants || 0), 0),
      totalLiquidity: data.filter(m => m.status === "active").reduce((s, m) => s + Number(m.liquidity || 0), 0),
      trending: data.filter(m => m.trending).length,
      avgVolume: 0,
      polymarket: data.filter(m => m.polymarket_id).length,
      boostedActive: boosts?.filter(b => b.status === "active").length ?? 0,
      boostedTotal: boosts?.length ?? 0,
    };
    const activeWithVolume = data.filter(m => m.status === "active" && Number(m.volume) > 0);
    stats.avgVolume = activeWithVolume.length > 0 ? stats.totalVolume / activeWithVolume.length : 0;
    setGlobalStats(stats);
  };

  useEffect(() => { fetchGlobalStats(); }, []);

  const canFinalApprove = isSuperAdmin || isAdmin;
  const isModeratorOnly = isModerator && !isSuperAdmin && !isAdmin;

  const fetchMarkets = async () => {
    let query = supabase
      .from("markets")
      .select("id, title, description, category, status, market_type, volume, participants, yes_price, end_date, created_at, resolution_source, trending, pinned_trending, creator_wallet, moderator_decision, moderator_id, moderator_reviewed_at, polymarket_id, is_hidden, resolved_side, blockchain_tx_hash, image_url")
      .order("created_at", { ascending: false });
    if (filter === "polymarket") {
      query = query.not("polymarket_id", "is", null);
    } else if (filter !== "all") {
      query = query.eq("status", filter);
    }
    const { data, error } = await query;
    if (!error && data) setMarkets(data);
    // Always fetch ended + pending counts regardless of current filter
    const [{ count: endedC }, { count: pendingC }] = await Promise.all([
      supabase.from("markets").select("id", { count: "exact", head: true }).eq("status", "ended"),
      supabase.from("markets").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    setEndedCount(endedC ?? 0);
    setPendingCount(pendingC ?? 0);
    setLoading(false);
  };

  const [feeBasedMarketIds, setFeeBasedMarketIds] = useState<Set<string>>(new Set());

  const fetchPendingMarkets = async () => {
    const { data } = await supabase
      .from("markets")
      .select("id, title, description, category, status, market_type, volume, participants, yes_price, end_date, created_at, resolution_source, trending, pinned_trending, creator_wallet, moderator_decision, moderator_id, moderator_reviewed_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (data) {
      setPendingMarkets(data as MarketRow[]);
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
      // Resolve moderator names
      const modIds = [...new Set(data.filter(m => m.moderator_id).map(m => m.moderator_id!))];
      if (modIds.length > 0) {
        const { data: modProfiles } = await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", modIds);
        const map = new Map<string, string>();
        modProfiles?.forEach(p => map.set(p.id, p.display_name || p.email || p.id.slice(0, 8)));
        setModeratorNameMap(map);
      }
    }
  };

  useEffect(() => { fetchMarkets(); fetchTrendingScores(); fetchPendingMarkets(); setMktPage(1); setSelectedIds(new Set()); }, [filter]);

  const searchedMarkets = useMemo(() => {
    if (!searchQuery.trim()) return markets;
    const q = searchQuery.toLowerCase();
    return markets.filter(m => m.title.toLowerCase().includes(q) || m.description.toLowerCase().includes(q) || m.category.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
  }, [markets, searchQuery]);

  const paginatedMarkets = useMemo(() => searchedMarkets.slice((mktPage - 1) * MKT_PAGE_SIZE, mktPage * MKT_PAGE_SIZE), [searchedMarkets, mktPage]);
  // Moderator: recommend approve/reject (does NOT change market status)
  const handleModeratorReview = async (id: string, decision: "approve" | "reject") => {
    setModeratorReviewingId(id);
    const market = pendingMarkets.find(m => m.id === id);
    const { error } = await supabase.from("markets").update({
      moderator_decision: decision,
      moderator_id: currentUser?.id,
      moderator_reviewed_at: new Date().toISOString(),
    } as any).eq("id", id);
    if (error) {
      toast.error("Failed to submit review");
    } else {
      toast.success(`Market ${decision === "approve" ? "recommended for approval" : "recommended for rejection"}. Awaiting final decision.`);
      logAuditEvent({
        action: decision === "approve" ? "market_approved" : "market_rejected",
        targetId: id,
        targetType: "market",
        details: { title: market?.title, moderator_review: true, decision },
      });
      fetchPendingMarkets();
    }
    setModeratorReviewingId(null);
  };

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    const market = [...markets, ...pendingMarkets].find(m => m.id === id);
    const { error } = await supabase.from("markets").update({ status: "active" }).eq("id", id);
    if (error) { toast.error("Failed to approve"); }
    else {
      toast.success("Market approved and now live!");
      logAuditEvent({ action: "market_approved", targetId: id, targetType: "market", details: { title: market?.title } });
      fetchMarkets(); fetchPendingMarkets();
    }
    setApprovingId(null);
  };

  const handleReject = async (id: string) => {
    if (!confirm("Reject this market for content violation? The creation fee will be FORFEITED (not refunded). Only the initial liquidity will be refunded.")) return;
    setRejectingId(id);
    const market = [...markets, ...pendingMarkets].find(m => m.id === id);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-market", {
        body: { market_id: id, reason: "moderation" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const feeMsg = data?.creation_fee_forfeited > 0 ? ` Creation fee ($${data.creation_fee_forfeited}) forfeited.` : "";
      toast.success(`Market rejected.${feeMsg} Liquidity refunded.`);
      logAuditEvent({ action: "market_rejected", targetId: id, targetType: "market", details: { title: market?.title } });
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
    setEditState({ id: m.id, title: m.title, description: m.description, category: m.category, end_date: m.end_date, resolution_source: m.resolution_source, trending: m.trending, image_url: m.image_url || "", newImageFile: null });
    setExpandedId(m.id);
  };

  const cancelEdit = () => setEditState(null);

  const saveEdit = async () => {
    if (!editState) return;
    if (editState.title.trim().length < 5) { toast.error("Title must be at least 5 characters"); return; }
    setSaving(true);
    let imageUrl = editState.image_url;
    // Upload new image if selected
    if (editState.newImageFile) {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (!currentUser) throw new Error("Not authenticated");
        const compressed = await compressImage(editState.newImageFile, "market-banner");
        const ext = compressed.type === "image/webp" ? "webp" : compressed.type === "image/jpeg" ? "jpg" : "webp";
        const fileName = `${currentUser.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        
        // Retry upload up to 3 times (handles transient schema cache issues)
        let uploadError: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const { error: upErr } = await supabase.storage.from("market-images").upload(fileName, compressed, { contentType: compressed.type, upsert: true });
          if (!upErr) { uploadError = null; break; }
          uploadError = upErr;
          if (attempt < 2) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        }
        if (uploadError) throw uploadError;
        
        const { data: pubData } = supabase.storage.from("market-images").getPublicUrl(fileName);
        imageUrl = pubData.publicUrl;
      } catch (e: any) {
        toast.error("Image upload failed: " + (e.message || "Unknown error"));
        setSaving(false);
        return;
      }
    }
    const { error } = await supabase.from("markets").update({
      title: editState.title.trim(),
      description: editState.description.trim(),
      category: editState.category,
      end_date: editState.end_date,
      resolution_source: editState.resolution_source.trim(),
      trending: editState.trending,
      image_url: imageUrl || null,
    }).eq("id", editState.id);
    if (error) {
      console.error("Admin saveEdit error:", error);
      toast.error(`Failed to save changes: ${error.message || error.code || "Unknown error"}`);
    }
    else {
      toast.success("Market updated");
      logAuditEvent({ action: "market_edited", targetId: editState.id, targetType: "market", details: { title: editState.title.trim() } });
      setEditState(null); fetchMarkets();
    }
    setSaving(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") cancelEdit();
  };

  const openResolveModal = async (market: MarketRow) => {
    if (market.market_type === "multi" || market.market_type === "range") {
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
    if ((market.market_type === "multi" || market.market_type === "range") && !winningOptionId) { toast.error("Select the winning option"); return; }
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
      logAuditEvent({ action: "market_resolved", targetId: market.id, targetType: "market", details: { title: market.title, winning_side: winningSide, winning_option_id: winningOptionId } });
      setResolveState(null);
      fetchMarkets();
    } catch (err: any) {
      const msg = err?.message || "";
      // Resolve-market is a long-running function (payouts + notifications). The supabase-js
      // client may time out before the function completes, but the resolution still succeeds
      // server-side. Surface this with a clearer message and refresh so the UI reflects state.
      if (/Failed to send a request to the Edge Function|Failed to fetch|network|timeout/i.test(msg)) {
        toast.message("Resolution is processing in the background. Refreshing in a moment…");
        setTimeout(() => fetchMarkets(), 4000);
        setResolveState(null);
      } else {
        toast.error(msg || "Failed to resolve market");
      }
    }
    setResolving(false);
  };

  const handleCancel = async (id: string) => {
    if (!confirm("Cancel this market and refund all bets?")) return;
    const market = markets.find(m => m.id === id);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-market", {
        body: { market_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Market cancelled! ${data.users_refunded} users refunded $${data.total_refunded?.toFixed(2)}`);
      logAuditEvent({ action: "market_cancelled", targetId: id, targetType: "market", details: { title: market?.title } });
      fetchMarkets();
    } catch (err: any) {
      toast.error(err?.message || "Failed to cancel market");
    }
  };

  const confirmVoidAndRefund = async () => {
    if (!voidState) return;
    const { market, reason } = voidState;
    if (reason.trim().length < 10) {
      toast.error("Please provide a reason of at least 10 characters");
      return;
    }
    setVoiding(true);
    try {
      const { data, error } = await supabase.functions.invoke("void-and-refund", {
        body: { market_id: market.id, reason: reason.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(
        `Voided "${market.title}" — refunded ${data.users_refunded} users $${Number(data.total_refunded || 0).toFixed(2)}` +
        (data.users_clawed_back ? `; clawed back $${Number(data.total_clawed_back).toFixed(2)} from ${data.users_clawed_back} users` : "")
      );
      // Client-side audit shadow (server already wrote the canonical entry)
      logAuditEvent({
        action: "market_voided_and_refunded",
        targetId: market.id,
        targetType: "market",
        details: { title: market.title, reason: reason.trim(), previous_status: data.previous_status },
      });
      setVoidState(null);
      fetchMarkets();
    } catch (err: any) {
      const msg = err?.message || "";
      if (/Failed to send a request to the Edge Function|Failed to fetch|network|timeout/i.test(msg)) {
        toast.message("Void is processing in the background. Refreshing in a moment…");
        setTimeout(() => fetchMarkets(), 4000);
        setVoidState(null);
      } else {
        toast.error(msg || "Failed to void market");
      }
    }
    setVoiding(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Permanently delete this market and all related data?")) return;
    const market = markets.find(m => m.id === id);
    const { error } = await supabase.from("markets").delete().eq("id", id);
    if (error) toast.error("Failed to delete market");
    else {
      toast.success("Market deleted");
      logAuditEvent({ action: "market_deleted", targetId: id, targetType: "market", details: { title: market?.title } });
      fetchMarkets();
    }
  };

  const handleReactivate = async (id: string) => {
    const market = markets.find(m => m.id === id);
    const { error } = await supabase.from("markets").update({ status: "active" }).eq("id", id);
    if (error) toast.error("Failed to reactivate");
    else {
      toast.success("Market reactivated");
      logAuditEvent({ action: "market_reactivated", targetId: id, targetType: "market", details: { title: market?.title } });
      fetchMarkets();
    }
  };

  const resolvedMarkets = useMemo(() => markets.filter(m => m.status === "resolved"), [markets]);

  const escCsv = (val: string) => `"${String(val ?? "").replace(/"/g, '""')}"`;

  const exportColumns = (m: MarketRow) => [
    m.title, m.category, m.market_type, String(m.volume), String(m.participants),
    new Date(m.end_date).toLocaleDateString(), m.resolved_side ?? "",
    m.blockchain_tx_hash ? `https://bscscan.com/tx/${m.blockchain_tx_hash}` : "",
  ];
  const HEADERS = ["Title", "Category", "Type", "Volume", "Participants", "End Date", "Resolved Side", "Blockchain TX"];

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const rows = [HEADERS, ...resolvedMarkets.map(exportColumns)];
    const csv = rows.map(r => r.map(escCsv).join(",")).join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), "resolved_markets.csv");
  };

  const handleExportExcel = () => {
    const tableRows = resolvedMarkets.map(exportColumns);
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table><tr>${HEADERS.map(h => `<th>${h}</th>`).join("")}</tr>${tableRows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
    downloadBlob(new Blob([html], { type: "application/vnd.ms-excel" }), "resolved_markets.xls");
  };

  const handleExportPDF = () => {
    const tableRows = resolvedMarkets.map(exportColumns);
    const w = window.open("", "_blank");
    if (!w) { toast.error("Popup blocked"); return; }
    w.document.write(`<!DOCTYPE html><html><head><title>Resolved Markets</title><style>body{font-family:Arial,sans-serif;padding:20px}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f5f5f5;font-weight:600}h1{font-size:16px;margin-bottom:12px}a{color:#2563eb}</style></head><body><h1>Pollmarket — Resolved Markets (${resolvedMarkets.length})</h1><table><tr>${HEADERS.map(h => `<th>${h}</th>`).join("")}</tr>${tableRows.map(r => `<tr>${r.map((c, i) => i === 7 && c ? `<td><a href="${c}">${c.slice(0, 30)}…</a></td>` : `<td>${c}</td>`).join("")}</tr>`).join("")}</table><script>setTimeout(()=>window.print(),300)</script></body></html>`);
    w.document.close();
  };
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;



  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-xl sm:text-2xl font-bold">Markets ({searchedMarkets.length})</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {isSuperAdmin && resolvedMarkets.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-semibold hover:bg-secondary/80 transition-all active:scale-95">
                  <Download className="w-3.5 h-3.5" />
                  Export
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={handleExportCSV}>CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportExcel}>Excel (.xls)</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPDF}>PDF (Print)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canEdit && <BulkCSVImport onComplete={fetchMarkets} />}
          {canEdit && (
          <button
            onClick={() => navigate("/admin/create-market")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            Create
          </button>
          )}
        </div>
      </div>

      <Input
        placeholder="Search markets by title, category, or ID…"
        value={searchQuery}
        onChange={(e) => { setSearchQuery(e.target.value); setMktPage(1); }}
        className="h-9 text-sm"
      />

      {/* Analytics Summary Cards */}
      {globalStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {[
            { label: "Active", value: globalStats.active, sub: `${globalStats.binary} binary · ${globalStats.multi} multi`, icon: CheckCircle, color: "text-emerald-500" },
            { label: "Pending / Draft", value: `${globalStats.pending} / ${globalStats.draft}`, icon: Clock, color: "text-yellow-500" },
            { label: "Ended → Resolve", value: globalStats.ended, icon: Gavel, color: "text-orange-500" },
            { label: "Resolved", value: globalStats.resolved, sub: `${globalStats.cancelled} cancelled`, icon: Archive, color: "text-blue-500" },
            { label: "Total Volume", value: `$${globalStats.totalVolume >= 1_000_000 ? (globalStats.totalVolume / 1_000_000).toFixed(1) + "M" : globalStats.totalVolume >= 1_000 ? (globalStats.totalVolume / 1_000).toFixed(1) + "K" : globalStats.totalVolume.toFixed(0)}`, sub: `${globalStats.totalParticipants.toLocaleString()} participants`, icon: DollarSign, color: "text-primary" },
            { label: "Trending", value: globalStats.trending, sub: `${globalStats.polymarket} polymarket`, icon: TrendingUp, color: "text-pink-500" },
            { label: "Boosted", value: globalStats.boostedActive, sub: `${globalStats.boostedTotal} total all-time`, icon: Flame, color: "text-orange-500" },
          ].map((card) => (
            <div key={card.label} className="bg-card border border-border/50 rounded-xl p-3 space-y-1">
              <div className="flex items-center gap-1.5">
                <card.icon className={`w-3.5 h-3.5 ${card.color}`} />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{card.label}</span>
              </div>
              <p className="text-lg font-bold">{card.value}</p>
              {card.sub && <p className="text-[10px] text-muted-foreground">{card.sub}</p>}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 overflow-x-auto scrollbar-hide">
        {(["all", "pending", "active", "ended", "resolved", "cancelled", "polymarket"] as const).map((f) => (
          <button
            key={f}
            onClick={() => { setLoading(true); setFilter(f); }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize whitespace-nowrap ${
              filter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "polymarket" ? "🔮 Polymarket" : f}
            {f === "ended" && endedCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-orange-500 text-white">
                {endedCount}
              </span>
            )}
            {f === "pending" && pendingCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-yellow-500 text-white">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Pending Review Section */}
      {pendingMarkets.length > 0 && filter !== "pending" && (
        <div className="bg-card border border-yellow-500/30 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-yellow-500/5 border-b border-yellow-500/20">
            <ShieldAlert className="w-4 h-4 text-yellow-500" />
            <h3 className="text-sm font-bold text-yellow-500">Pending Review ({pendingMarkets.length})</h3>
            <span className="text-xs text-muted-foreground ml-2">
              {isModeratorOnly ? "Submit your recommendation for admin approval" : "Markets awaiting final approval"}
            </span>
          </div>
          <div className="divide-y divide-border/50">
            {pendingMarkets.map((m) => {
              const hasModReview = !!m.moderator_decision;
              const modName = m.moderator_id ? moderatorNameMap.get(m.moderator_id) || "A moderator" : null;
              return (
              <div key={m.id} className="p-3 sm:p-4 flex flex-col gap-3 hover:bg-muted/20 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
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

                  {/* Moderator-only: Recommend buttons */}
                  {isModeratorOnly && !hasModReview && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleModeratorReview(m.id, "approve")}
                        disabled={moderatorReviewingId === m.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 text-xs font-semibold hover:bg-emerald-500/20 transition-all active:scale-95 disabled:opacity-50"
                      >
                        {moderatorReviewingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                        Recommend Approve
                      </button>
                      <button
                        onClick={() => handleModeratorReview(m.id, "reject")}
                        disabled={moderatorReviewingId === m.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 transition-all active:scale-95 disabled:opacity-50"
                      >
                        {moderatorReviewingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                        Recommend Reject
                      </button>
                    </div>
                  )}

                  {/* Moderator: already reviewed */}
                  {isModeratorOnly && hasModReview && (
                    <div className="shrink-0">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        m.moderator_decision === "approve" ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"
                      }`}>
                        {m.moderator_decision === "approve" ? "✅ Recommended Approval" : "❌ Recommended Rejection"}
                      </span>
                      <p className="text-[10px] text-muted-foreground mt-1">Awaiting final decision</p>
                    </div>
                  )}

                  {/* Admin/Super Admin: Final decision buttons */}
                  {canFinalApprove && (
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
                            logAuditEvent({ action: "market_cancelled", targetId: m.id, targetType: "market", details: { title: m.title, pending: true } });
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
                  )}
                </div>

                {/* Moderator recommendation badge (visible to admins/super admins) */}
                {canFinalApprove && hasModReview && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                    m.moderator_decision === "approve"
                      ? "bg-emerald-500/5 border border-emerald-500/20 text-emerald-500"
                      : "bg-destructive/5 border border-destructive/20 text-destructive"
                  }`}>
                    {m.moderator_decision === "approve" ? <ShieldCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                    <span className="font-semibold">
                      {modName} recommended {m.moderator_decision === "approve" ? "approval" : "rejection"}
                    </span>
                    {m.moderator_reviewed_at && (
                      <span className="text-muted-foreground ml-1">
                        — {new Date(m.moderator_reviewed_at).toLocaleDateString()} {new Date(m.moderator_reviewed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Batch actions bar */}
      {isSuperAdmin && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-2.5">
          <span className="text-sm font-semibold text-destructive">{selectedIds.size} selected</span>
          <button
            onClick={handleBatchDelete}
            disabled={batchDeleting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold hover:bg-destructive/90 transition-all active:scale-95 disabled:opacity-50"
          >
            {batchDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Delete Selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                {isSuperAdmin && (
                  <th className="p-3 w-10">
                    <input
                      type="checkbox"
                      checked={paginatedMarkets.length > 0 && selectedIds.size === paginatedMarkets.length}
                      onChange={toggleSelectAll}
                      className="rounded border-border"
                    />
                  </th>
                )}
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
                    <tr className={`border-b border-border/50 ${selectedIds.has(m.id) ? "bg-primary/5" : isEditing ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                      {isSuperAdmin && (
                        <td className="p-3 w-10">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(m.id)}
                            onChange={() => toggleSelect(m.id)}
                            className="rounded border-border"
                          />
                        </td>
                      )}
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
                            m.status === "ended" ? "bg-orange-500/10 text-orange-500" :
                            m.status === "resolved" ? "bg-blue-500/10 text-blue-500" :
                            m.status === "cancelled" ? "bg-red-500/10 text-red-500" :
                            "bg-yellow-500/10 text-yellow-500"
                          }`}>
                            {m.status}
                          </span>
                          {m.status === "pending" && feeBasedMarketIds.has(m.id) && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/15 text-primary">
                              💰
                            </span>
                          )}
                          {m.is_hidden && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/15 text-yellow-500 border border-yellow-500/30">
                              👁️‍🗨️ Hidden
                            </span>
                          )}
                          {m.resolution_source === "Polymarket" && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/15 text-purple-500 border border-purple-500/30">
                              🔮 Polymarket
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
                      <td className="p-3">
                        {canEdit ? (
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
                                    fetchMarkets();
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors"
                                  title="Approve Market"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                              )}
                              {/* End Now button for active markets past end date */}
                              {m.status === "active" && new Date(m.end_date) <= new Date(new Date().toISOString().split("T")[0]) && (
                                <button
                                  onClick={async () => {
                                    const { error } = await supabase.from("markets").update({ status: "ended", updated_at: new Date().toISOString() }).eq("id", m.id).eq("status", "active");
                                    if (error) { toast.error("Failed to end market"); return; }
                                    toast.success("Market ended — ready for resolution");
                                    logAuditEvent({ action: "market_ended_manually", targetId: m.id, targetType: "market", details: { title: m.title } });
                                    fetchMarkets();
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-orange-500/10 text-orange-500 transition-colors"
                                  title="End Market Now"
                                >
                                  <Clock className="w-4 h-4" />
                                </button>
                              )}
                              {(m.status === "active" || m.status === "ended" || m.status === "pending") && (
                                <>
                                  {(m.status === "active" || m.status === "ended") && (
                                    <button
                                      onClick={() => openResolveModal(m)}
                                      className="p-1.5 rounded-lg hover:bg-green-500/10 text-green-500 transition-colors"
                                      title="Resolve Market"
                                    >
                                      <Gavel className="w-4 h-4" />
                                    </button>
                                  )}
                                  {m.status === "ended" && (
                                    <button
                                      onClick={async () => {
                                        const newEndDate = prompt("Re-open market — enter new end date (YYYY-MM-DD):", new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0]);
                                        if (!newEndDate) return;
                                        const parsed = new Date(newEndDate);
                                        if (isNaN(parsed.getTime()) || parsed <= new Date()) {
                                          toast.error("End date must be in the future");
                                          return;
                                        }
                                        const { error } = await supabase.from("markets").update({
                                          status: "active",
                                          end_date: newEndDate,
                                          updated_at: new Date().toISOString(),
                                        }).eq("id", m.id).eq("status", "ended");
                                        if (error) { toast.error("Failed to re-open market"); return; }
                                        toast.success("Market re-opened with new end date!");
                                        logAuditEvent({ action: "market_reopened", targetId: m.id, targetType: "market", details: { title: m.title, new_end_date: newEndDate } });
                                        fetchMarkets();
                                      }}
                                      className="p-1.5 rounded-lg hover:bg-blue-500/10 text-blue-500 transition-colors"
                                      title="Re-open market with new end date"
                                    >
                                      <Clock className="w-4 h-4" />
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
                                <>
                                  <button
                                    onClick={() => m.status !== "resolved" && handleReactivate(m.id)}
                                    disabled={m.status === "resolved"}
                                    className={`p-1.5 rounded-lg transition-colors ${m.status === "resolved" ? "opacity-30 cursor-not-allowed text-muted-foreground" : "hover:bg-blue-500/10 text-blue-500"}`}
                                    title={m.status === "resolved" ? "Resolved markets cannot be reactivated" : "Reactivate"}
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </button>
                                  {m.status === "resolved" && isSuperAdmin && (
                                    <RecordOnChainButton
                                      marketId={m.id}
                                      resolvedSide={m.resolved_side || "unknown"}
                                      totalPaid={m.volume}
                                      existingTxHash={m.blockchain_tx_hash}
                                      onRecorded={() => fetchMarkets()}
                                    />
                                  )}
                                </>
                              )}
                              {/* Emergency Void & Refund — super-admin only, on any non-cancelled market (including resolved) */}
                              {isSuperAdmin && m.status !== "cancelled" && (
                                <button
                                  onClick={() => setVoidState({ market: m, reason: "" })}
                                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors"
                                  title="Emergency: Void & Refund (overrides outcome, audit-logged)"
                                >
                                  <AlertOctagon className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={async () => {
                                  const newVal = !m.is_hidden;
                                  const { error } = await supabase.from("markets").update({ is_hidden: newVal } as any).eq("id", m.id);
                                  if (error) { toast.error("Failed to toggle visibility"); return; }
                                  toast.success(newVal ? "Market hidden from public" : "Market visible to public");
                                  logAuditEvent({ action: "settings_updated", targetId: m.id, targetType: "market", details: { is_hidden: newVal } });
                                  fetchMarkets();
                                }}
                                className={`p-1.5 rounded-lg transition-colors ${m.is_hidden ? "hover:bg-green-500/10 text-yellow-500" : "hover:bg-yellow-500/10 text-muted-foreground"}`}
                                title={m.is_hidden ? "Unhide Market" : "Hide Market"}
                              >
                                {m.is_hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
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
                        ) : (
                          <span className="text-[10px] text-muted-foreground">View only</span>
                        )}
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

                            {/* Market Image */}
                            {isEditing && canEdit ? (
                              <div>
                                <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1 block">Market Image</label>
                                <div className="flex items-center gap-3 flex-wrap">
                                  {(editState.newImageFile || editState.image_url) && (
                                    <img
                                      src={editState.newImageFile ? URL.createObjectURL(editState.newImageFile) : editState.image_url}
                                      alt="Market"
                                      className="w-16 h-16 rounded-lg object-cover border border-border"
                                    />
                                  )}
                                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border cursor-pointer hover:bg-muted transition-colors text-sm text-muted-foreground">
                                    <ImagePlus className="w-4 h-4" />
                                    {editState.image_url || editState.newImageFile ? "Replace Image" : "Add Image"}
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) setEditState({ ...editState, newImageFile: file });
                                      }}
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    disabled={generatingAiImage === editState.id}
                                    onClick={async () => {
                                      setGeneratingAiImage(editState.id);
                                      try {
                                        const { data, error } = await supabase.functions.invoke("generate-market-content", {
                                          body: { type: "image", title: editState.title, category: editState.category },
                                        });
                                        if (error) throw error;
                                        if (data?.error) { toast.error(data.error); return; }
                                        if (data?.imageUrl) {
                                          setEditState({ ...editState, image_url: data.imageUrl, newImageFile: null });
                                          toast.success("AI image generated!");
                                        }
                                      } catch (err: any) {
                                        toast.error(err?.message || "AI generation failed");
                                      } finally {
                                        setGeneratingAiImage(null);
                                      }
                                    }}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors text-sm text-primary font-medium disabled:opacity-50"
                                  >
                                    {generatingAiImage === editState.id ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Sparkles className="w-4 h-4" />
                                    )}
                                    AI Generate
                                  </button>
                                </div>
                              </div>
                            ) : (
                              m.image_url && (
                                <div>
                                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1 block">Market Image</label>
                                  <img src={m.image_url} alt="Market" className="w-20 h-20 rounded-lg object-cover border border-border" />
                                </div>
                              )
                            )}

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
                              {canEdit ? (
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
                              ) : (
                                <span className={`px-3 py-1 rounded-lg text-[10px] font-bold ${m.pinned_trending ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                                  {m.pinned_trending ? "📌 Pinned" : "Not Pinned"}
                                </span>
                              )}
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
      <AdminPagination page={mktPage} totalItems={searchedMarkets.length} pageSize={MKT_PAGE_SIZE} onPageChange={setMktPage} />

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

      {/* Emergency Void & Refund modal */}
      <AnimatePresence>
        {voidState && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => !voiding && setVoidState(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card border-2 border-red-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 rounded-lg bg-red-500/10 text-red-500">
                  <AlertOctagon className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-red-500">Emergency: Void &amp; Refund</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Overrides any outcome and refunds every participant in full. This action is permanent and audit-logged.
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">Market</div>
                  <div className="font-medium truncate">{voidState.market.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Status: <span className="font-mono">{voidState.market.status}</span>
                    {voidState.market.resolved_side && (
                      <> · Resolved as <span className="font-mono">{voidState.market.resolved_side.toUpperCase()}</span></>
                    )}
                  </div>
                </div>

                <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
                  <li>Reverses any payouts already credited (clawback).</li>
                  <li>Refunds every confirmed buy at face value.</li>
                  <li>Refunds creation fee &amp; returns initial liquidity.</li>
                  <li>Voids pending commissions and platform-pool fees.</li>
                  <li>Notifies all affected users.</li>
                </ul>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Reason (required, ≥10 chars — recorded in audit log)
                  </label>
                  <textarea
                    value={voidState.reason}
                    onChange={(e) => setVoidState({ ...voidState, reason: e.target.value })}
                    placeholder="e.g. Source data was inconclusive at deadline; market resolved prematurely."
                    rows={3}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40"
                    disabled={voiding}
                  />
                  <div className="text-[11px] text-muted-foreground mt-1">{voidState.reason.trim().length}/10</div>
                </div>
              </div>

              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setVoidState(null)}
                  disabled={voiding}
                  className="flex-1 px-4 py-2 rounded-lg border border-border hover:bg-muted text-sm font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmVoidAndRefund}
                  disabled={voiding || voidState.reason.trim().length < 10}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {voiding ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertOctagon className="w-4 h-4" />}
                  Void &amp; Refund
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
