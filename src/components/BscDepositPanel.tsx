import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, Loader2, ShieldCheck, AlertTriangle, Sparkles, XCircle, Clock, ExternalLink, Search, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const CONFIRMATIONS_REQUIRED = 12;

interface BscDepositEvent {
  id: string;
  token: string;
  tx_hash: string;
  amount_usd: number;
  confirmations: number;
  status: "detected" | "credited" | "orphaned";
  detected_at: string;
  credited_at: string | null;
}

type StatusFilter = "all" | "pending" | "confirmed" | "failed";

export default function BscDepositPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");

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
        .select("id, token, tx_hash, amount_usd, confirmations, status, detected_at, credited_at")
        .eq("user_id", user!.id)
        .order("detected_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as BscDepositEvent[];
    },
  });

  // 3. Realtime subscription for instant updates
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`bsc-deposits-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bsc_deposit_events", filter: `user_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["bsc-deposit-events", user.id] });
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
          <span className="text-[10px] text-muted-foreground">{events.length} total</span>
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
          const filtered = events.filter((e) =>
            filter === "all" ? true :
            filter === "pending" ? e.status === "detected" :
            filter === "confirmed" ? e.status === "credited" :
            e.status === "orphaned"
          );
          if (filtered.length === 0) {
            return (
              <div className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border rounded-xl">
                {filter === "all"
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
