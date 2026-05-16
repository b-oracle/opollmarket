import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, Loader2, ShieldCheck, AlertTriangle, Sparkles, XCircle, Clock, ExternalLink, Search, X, RefreshCw, Download, Calendar as CalendarIcon, ShieldAlert, Ban } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const CONFIRMATIONS_REQUIRED = 12;

interface BscDepositEvent {
  id: string;
  token: string;
  tx_hash: string;
  amount_usd: number;
  confirmations: number;
  status: "detected" | "credited" | "orphaned" | "manual_review" | "rejected";
  detected_at: string;
  credited_at: string | null;
  review_reason: string | null;
  reviewed_at: string | null;
}

type StatusFilter = "all" | "pending" | "review" | "confirmed" | "failed";

export default function BscDepositPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [rescanning, setRescanning] = useState(false);
  const COOLDOWN_MS = 20_000;
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  type RescanResult =
    | { kind: "ok"; checked: number; credited: number; failed: number; stillPending: number; at: number }
    | { kind: "error"; message: string; at: number };
  const [rescanResult, setRescanResult] = useState<RescanResult | null>(null);
  const [rescanStartedAt, setRescanStartedAt] = useState<number | null>(null);
  const [exportRange, setExportRange] = useState<DateRange | undefined>(undefined);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (cooldownUntil <= Date.now() && !rescanning) return;
    const id = setInterval(() => setNowTs(Date.now()), 250);
    return () => clearInterval(id);
  }, [cooldownUntil, rescanning]);

  const cooldownRemainingMs = Math.max(0, cooldownUntil - nowTs);
  const cooldownActive = cooldownRemainingMs > 0;
  const cooldownSecs = Math.ceil(cooldownRemainingMs / 1000);

  const rescan = async () => {
    if (rescanning || cooldownActive) return;
    setRescanning(true);
    setRescanStartedAt(Date.now());
    setRescanResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("bsc-deposit-rescan", { body: {} });
      if (error || (data as any)?.error) {
        const err = (data as any)?.error || error?.message;
        if (err === "cooldown") {
          const ms = (data as any)?.retry_after_ms || COOLDOWN_MS;
          setCooldownUntil(Date.now() + ms);
          setRescanResult({ kind: "error", message: `Cooldown active — wait ${Math.ceil(ms / 1000)}s.`, at: Date.now() });
          toast.message(`Please wait ${Math.ceil(ms / 1000)}s before rescanning again.`);
        } else {
          setRescanResult({ kind: "error", message: "Rescan failed. Try again shortly.", at: Date.now() });
          toast.error("Rescan failed. Try again shortly.");
        }
        return;
      }
      const d = (data as any) || {};
      const checked = d.checked ?? d.pending ?? 0;
      const credited = d.credited ?? 0;
      const failed = d.failed ?? 0;
      const stillPending = d.still_pending ?? Math.max(0, checked - credited - failed);
      setRescanResult({ kind: "ok", checked, credited, failed, stillPending, at: Date.now() });
      if (checked === 0) {
        toast.success("Rescan complete — no pending deposits to check.");
      } else {
        const parts = [
          `${checked} re-checked`,
          `${credited} confirmed`,
          `${failed} failed`,
          `${stillPending} still pending`,
        ];
        toast.success(`Rescan complete — ${parts.join(" · ")}`);
      }
      qc.invalidateQueries({ queryKey: ["bsc-deposit-events", user?.id] });
      setCooldownUntil(Date.now() + COOLDOWN_MS);
    } catch {
      setRescanResult({ kind: "error", message: "Rescan failed. Try again shortly.", at: Date.now() });
      toast.error("Rescan failed. Try again shortly.");
    } finally {
      setRescanning(false);
      setRescanStartedAt(null);
    }
  };

  const exportCsv = (range?: DateRange) => {
    if (!events.length) {
      toast.message("No deposits to export yet.");
      return;
    }
    // Inclusive range: start at 00:00, end at 23:59:59.999 of selected day
    const fromTs = range?.from ? new Date(range.from).setHours(0, 0, 0, 0) : null;
    const toTs = range?.to
      ? new Date(range.to).setHours(23, 59, 59, 999)
      : range?.from
      ? new Date(range.from).setHours(23, 59, 59, 999)
      : null;
    const filtered = events.filter((e) => {
      if (fromTs == null) return true;
      const t = new Date(e.detected_at).getTime();
      return t >= fromTs && (toTs == null || t <= toTs);
    });
    if (!filtered.length) {
      toast.message("No deposits in that date range.");
      return;
    }
    const statusLabel = (s: BscDepositEvent["status"]) =>
      s === "credited" ? "Confirmed" :
      s === "orphaned" ? "Failed" :
      s === "manual_review" ? "Under Review" :
      s === "rejected" ? "Rejected" :
      "Pending";
    const escape = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = [
      "Detected At (UTC)",
      "Credited At (UTC)",
      "Token",
      "Amount (USD)",
      "Status",
      "Confirmations",
      "Tx Hash",
    ];
    const rows = filtered.map((e) => [
      new Date(e.detected_at).toISOString(),
      e.credited_at ? new Date(e.credited_at).toISOString() : "",
      e.token,
      Number(e.amount_usd).toFixed(6),
      statusLabel(e.status),
      e.confirmations,
      e.tx_hash,
    ]);
    const csv = [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const suffix = range?.from
      ? `${format(range.from, "yyyy-MM-dd")}_to_${format(range.to ?? range.from, "yyyy-MM-dd")}`
      : new Date().toISOString().slice(0, 10);
    a.download = `bsc-deposits-${suffix}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} deposit${filtered.length === 1 ? "" : "s"} to CSV.`);
  };

  // 1. Fetch / allocate this user's deposit address
  const {
    data: address,
    isLoading: addrLoading,
    error: addrError,
    refetch: refetchAddress,
  } = useQuery({
    queryKey: ["bsc-deposit-address", user?.id],
    enabled: !!user,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-bsc-deposit-address", { body: {} });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return (data as { address: string }).address;
    },
  });

  // 2. Fetch deposit history for this user
  const { data: events = [], isLoading: eventsLoading } = useQuery<BscDepositEvent[]>({
    queryKey: ["bsc-deposit-events", user?.id],
    enabled: !!user,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bsc_deposit_events")
        .select("id, token, tx_hash, amount_usd, confirmations, status, detected_at, credited_at, review_reason, reviewed_at")
        .eq("user_id", user!.id)
        .order("detected_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as BscDepositEvent[];
    },
  });

  // 3. Realtime subscription for instant updates + status-change toasts
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`bsc-deposits-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bsc_deposit_events", filter: `user_id=eq.${user.id}` },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["bsc-deposit-events", user.id] });

          // Only fire toast on status transitions (UPDATE) — skip initial INSERT (still pending)
          if (payload.eventType === "UPDATE") {
            const oldStatus = (payload.old as any)?.status;
            const newStatus = (payload.new as any)?.status;
            const amount = Number((payload.new as any)?.amount_usd || 0);
            const token = (payload.new as any)?.token || "";
            const txHash = (payload.new as any)?.tx_hash || "";
            const short = txHash ? `${txHash.slice(0, 6)}…${txHash.slice(-4)}` : "";

            if (oldStatus !== newStatus) {
              if (newStatus === "credited") {
                toast.success(`Deposit confirmed: +$${amount.toFixed(2)} ${token}`, {
                  description: short ? `Tx ${short} credited to your balance.` : undefined,
                  duration: 8000,
                });
              } else if (newStatus === "orphaned") {
                toast.error(`Deposit failed: $${amount.toFixed(2)} ${token}`, {
                  description: short ? `Tx ${short} was orphaned. Contact support if funds were sent.` : undefined,
                  duration: 10000,
                });
              } else if (newStatus === "manual_review") {
                toast.message(`Deposit under review: $${amount.toFixed(2)} ${token}`, {
                  description: "Above auto-credit threshold — our team will review shortly.",
                  duration: 8000,
                });
              } else if (newStatus === "rejected") {
                toast.error(`Deposit rejected: $${amount.toFixed(2)} ${token}`, {
                  description: short ? `Tx ${short} was rejected after review. Contact support.` : undefined,
                  duration: 10000,
                });
              }
            }
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  const copy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 1500);
  };

  if (addrLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Generating your deposit address…
      </div>
    );
  }

  if (addrError || !address) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-destructive" />
          <div className="flex-1">
            <p className="font-semibold text-destructive">Could not load deposit address</p>
            <p className="text-muted-foreground mt-1">{(addrError as Error)?.message || "Try again."}</p>
            <button onClick={() => refetchAddress()} className="mt-2 text-xs underline">Retry</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pitch */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs flex items-start gap-2">
        <Sparkles className="w-4 h-4 mt-0.5 text-primary shrink-0" />
        <div>
          <p className="font-semibold text-foreground">No fees · Auto-credit · ~36s after 12 confirmations</p>
          <p className="text-muted-foreground mt-0.5">Send <b>USDT or USDC on BNB Smart Chain (BEP20)</b> to the address below. Minimum $1.</p>
        </div>
      </div>

      {/* QR + address */}
      <div className="rounded-2xl border border-border bg-card p-4 flex flex-col items-center gap-3">
        <div className="p-3 rounded-xl bg-white">
          <QRCodeSVG value={address} size={160} />
        </div>
        <div className="w-full">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Your BEP20 address</label>
          <div className="mt-1 flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 font-mono text-xs break-all">
            <span className="flex-1">{address}</span>
            <button onClick={copy} className="p-1.5 rounded hover:bg-muted shrink-0">
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Warning */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
        <div>
          <p className="font-semibold text-foreground">Only send USDT or USDC on BSC (BEP20).</p>
          <p className="text-muted-foreground mt-0.5">Anything else — different token, different chain — is unrecoverable.</p>
        </div>
      </div>

      {/* History */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-xs font-semibold text-muted-foreground">Deposit history</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">{events.length} total</span>
            <button
              onClick={rescan}
              disabled={rescanning || cooldownActive}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition tabular-nums"
              aria-label={cooldownActive ? `Rescan available in ${cooldownSecs}s` : "Rescan pending deposits"}
              title={cooldownActive ? `Available in ${cooldownSecs}s` : undefined}
            >
              <RefreshCw className={`w-3 h-3 ${rescanning ? "animate-spin" : ""}`} />
              {rescanning ? "Rescanning…" : cooldownActive ? `Wait ${cooldownSecs}s` : "Rescan"}
            </button>
            <Popover open={exportOpen} onOpenChange={setExportOpen}>
              <PopoverTrigger asChild>
                <button
                  disabled={!events.length}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-muted/40 text-foreground border border-border hover:bg-muted/70 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  aria-label="Export deposit history as CSV"
                >
                  <Download className="w-3 h-3" />
                  CSV
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3 space-y-3" align="end">
                <div className="space-y-1">
                  <p className="text-xs font-semibold">Export deposits</p>
                  <p className="text-[10px] text-muted-foreground">
                    {exportRange?.from
                      ? exportRange.to
                        ? `${format(exportRange.from, "MMM d, yyyy")} – ${format(exportRange.to, "MMM d, yyyy")}`
                        : `${format(exportRange.from, "MMM d, yyyy")} – pick end date`
                      : "Pick a date range, or leave blank for all."}
                  </p>
                </div>
                <Calendar
                  mode="range"
                  selected={exportRange}
                  onSelect={setExportRange}
                  numberOfMonths={1}
                  disabled={(d) => d > new Date()}
                  initialFocus
                  className={cn("p-0 pointer-events-auto")}
                />
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setExportRange(undefined)}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    Clear
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        exportCsv(undefined);
                        setExportOpen(false);
                      }}
                      className="px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-muted/40 text-foreground border border-border hover:bg-muted/70"
                    >
                      All time
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        exportCsv(exportRange);
                        setExportOpen(false);
                      }}
                      disabled={!exportRange?.from}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Download className="w-3 h-3" />
                      Export
                    </button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Rescan progress / result banner */}
        {(rescanning || rescanResult) && (
          <div
            className={`mx-1 mb-2 rounded-lg border px-2.5 py-2 text-[11px] flex items-center gap-2 ${
              rescanning
                ? "border-primary/30 bg-primary/5 text-foreground"
                : rescanResult?.kind === "error"
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "border-emerald-500/30 bg-emerald-500/10 text-foreground"
            }`}
            role="status"
            aria-live="polite"
          >
            {rescanning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span className="flex-1">
                  Polling chain for pending deposits…
                  {rescanStartedAt ? (
                    <span className="text-muted-foreground ml-1 tabular-nums">
                      {Math.max(0, Math.floor((nowTs - rescanStartedAt) / 1000))}s
                    </span>
                  ) : null}
                </span>
              </>
            ) : rescanResult?.kind === "ok" ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="flex-1">
                  {rescanResult.checked === 0 ? (
                    "No pending deposits to re-check."
                  ) : (
                    <>
                      <span className="font-semibold">{rescanResult.checked}</span> re-checked ·{" "}
                      <span className="text-emerald-500 font-semibold">{rescanResult.credited}</span> confirmed ·{" "}
                      <span className="text-destructive font-semibold">{rescanResult.failed}</span> failed ·{" "}
                      <span className="text-muted-foreground font-semibold">{rescanResult.stillPending}</span> pending
                    </>
                  )}
                </span>
                <button
                  onClick={() => setRescanResult(null)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Dismiss"
                >
                  <X className="w-3 h-3" />
                </button>
              </>
            ) : rescanResult?.kind === "error" ? (
              <>
                <XCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1">{rescanResult.message}</span>
                <button
                  onClick={() => setRescanResult(null)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Dismiss"
                >
                  <X className="w-3 h-3" />
                </button>
              </>
            ) : null}
          </div>
        )}

        {/* Search by tx hash */}
        <div className="relative mb-2 px-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by tx hash…"
            className="w-full rounded-lg bg-muted/40 border border-border pl-8 pr-8 py-2 text-xs font-mono placeholder:font-sans placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Status filter pills */}
        <div className="flex gap-1.5 mb-2 px-1 overflow-x-auto no-scrollbar">
          {([
            { key: "all", label: "All" },
            { key: "pending", label: "Pending" },
            { key: "confirmed", label: "Confirmed" },
            { key: "failed", label: "Failed" },
          ] as { key: StatusFilter; label: string }[]).map((p) => {
            const count =
              p.key === "all" ? events.length :
              p.key === "pending" ? events.filter((e) => e.status === "detected").length :
              p.key === "confirmed" ? events.filter((e) => e.status === "credited").length :
              events.filter((e) => e.status === "orphaned").length;
            const active = filter === p.key;
            return (
              <button
                key={p.key}
                onClick={() => setFilter(p.key)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider border transition ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/60"
                }`}
              >
                {p.label} <span className="opacity-70">{count}</span>
              </button>
            );
          })}
        </div>

        {eventsLoading ? (
          <div className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border rounded-xl flex items-center justify-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading history…
          </div>
        ) : (() => {
          const q = search.trim().toLowerCase();
          const filtered = events.filter((e) => {
            const statusOk =
              filter === "all" ? true :
              filter === "pending" ? e.status === "detected" :
              filter === "confirmed" ? e.status === "credited" :
              e.status === "orphaned";
            const searchOk = q ? e.tx_hash.toLowerCase().includes(q) : true;
            return statusOk && searchOk;
          });
          if (filtered.length === 0) {
            return (
              <div className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border rounded-xl">
                {q
                  ? `No deposits match "${search}".`
                  : filter === "all"
                    ? "Waiting for an incoming transfer…"
                    : `No ${filter} deposits.`}
              </div>
            );
          }
          return (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {filtered.map((ev) => {
                const isPending = ev.status === "detected";
                const isConfirmed = ev.status === "credited";
                const isFailed = ev.status === "orphaned";
                const progressPct = Math.min(100, (ev.confirmations / CONFIRMATIONS_REQUIRED) * 100);
                return (
                  <motion.div
                    key={ev.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`rounded-xl border bg-card p-3 text-xs ${
                      isConfirmed ? "border-emerald-500/30" :
                      isFailed ? "border-destructive/30" :
                      "border-primary/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isConfirmed && <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />}
                        {isPending && <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />}
                        {isFailed && <XCircle className="w-4 h-4 text-destructive shrink-0" />}
                        <span className="font-semibold truncate">
                          ${Number(ev.amount_usd).toFixed(2)} {ev.token}
                        </span>
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                        isConfirmed ? "text-emerald-500" :
                        isFailed ? "text-destructive" :
                        "text-primary"
                      }`}>
                        {isConfirmed ? "Confirmed" : isFailed ? "Failed" : "Pending"}
                      </span>
                    </div>

                    {/* Confirmation progress bar (pending only) */}
                    {isPending && (
                      <div className="mt-2">
                        <div className="h-1 w-full bg-muted/50 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-primary"
                            initial={{ width: 0 }}
                            animate={{ width: `${progressPct}%` }}
                            transition={{ duration: 0.6 }}
                          />
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {Math.min(ev.confirmations, CONFIRMATIONS_REQUIRED)}/{CONFIRMATIONS_REQUIRED} confirmations
                        </div>
                      </div>
                    )}

                    {/* Failure reason */}
                    {isFailed && (
                      <p className="mt-1.5 text-[10px] text-destructive/90">
                        Orphaned by chain reorg or duplicate. Contact support with the tx hash if funds were sent.
                      </p>
                    )}

                    {/* Meta row */}
                    <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                      <span>
                        {formatDistanceToNow(new Date(ev.detected_at), { addSuffix: true })}
                      </span>
                      <a
                        href={`https://bscscan.com/tx/${ev.tx_hash}`}
                        target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:text-primary font-mono"
                      >
                        {ev.tx_hash.slice(0, 8)}…{ev.tx_hash.slice(-6)}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
