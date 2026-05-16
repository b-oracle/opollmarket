import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, Loader2, ShieldCheck, AlertTriangle, Sparkles } from "lucide-react";
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

export default function BscDepositPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

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

  // 2. Fetch recent deposit events for this user
  const { data: events = [] } = useQuery<BscDepositEvent[]>({
    queryKey: ["bsc-deposit-events", user?.id],
    enabled: !!user,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bsc_deposit_events")
        .select("id, token, tx_hash, amount_usd, confirmations, status, detected_at, credited_at")
        .eq("user_id", user!.id)
        .order("detected_at", { ascending: false })
        .limit(10);
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

      {/* Activity */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">Recent deposits</p>
        {events.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border rounded-xl">
            Waiting for an incoming transfer…
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((ev) => (
              <motion.div
                key={ev.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-border bg-card p-3 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {ev.status === "credited" ? (
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    )}
                    <span className="font-semibold">${Number(ev.amount_usd).toFixed(2)} {ev.token}</span>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${
                    ev.status === "credited" ? "text-emerald-500" : "text-primary"
                  }`}>
                    {ev.status === "credited"
                      ? "Credited"
                      : `${Math.min(ev.confirmations, CONFIRMATIONS_REQUIRED)}/${CONFIRMATIONS_REQUIRED} confirmations`}
                  </span>
                </div>
                <a
                  href={`https://bscscan.com/tx/${ev.tx_hash}`}
                  target="_blank" rel="noreferrer"
                  className="block mt-1 font-mono text-[10px] text-muted-foreground truncate hover:text-primary"
                >
                  {ev.tx_hash}
                </a>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
