import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Trophy, TrendingUp, Users, DollarSign, Droplets, Receipt } from "lucide-react";

type Props = {
  marketId: string;
  userId: string;
  resolvedSide: string | null;
  winningOptionId: string | null;
  marketType?: string | null;
};

type Breakdown = {
  totalPayouts: number;
  payoutCount: number;
  totalRefunds: number;
  refundCount: number;
  totalVolume: number;
  winningLabel: string;
  // Creator-specific
  creatorRealized: number;
  creatorPending: number;
  liquidityReturn: number;
  totalEarnings: number;
};

const Row = ({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: any;
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) => (
  <div className="flex items-center justify-between gap-3 py-2 border-b border-border/40 last:border-0">
    <div className="flex items-center gap-2 min-w-0">
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <p className="text-xs text-muted-foreground truncate">{label}</p>
    </div>
    <div className="text-right shrink-0">
      <p className={`text-xs font-semibold ${accent || "text-foreground"}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  </div>
);

const ResolvedMarketDetail = ({ marketId, userId, resolvedSide, winningOptionId }: Props) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Breakdown | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);

      const [payoutsRes, refundsRes, buysRes, commPaidRes, commPendingRes, liqRefundRes, optionRes] =
        await Promise.all([
          supabase
            .from("transactions")
            .select("amount, user_id")
            .eq("market_id", marketId)
            .eq("type", "payout")
            .eq("status", "confirmed"),
          supabase
            .from("transactions")
            .select("amount")
            .eq("market_id", marketId)
            .eq("type", "refund")
            .eq("status", "confirmed"),
          supabase
            .from("transactions")
            .select("amount")
            .eq("market_id", marketId)
            .eq("type", "buy")
            .eq("status", "confirmed")
            .in("side", ["yes", "no", "option"]),
          supabase
            .from("transactions")
            .select("amount")
            .eq("market_id", marketId)
            .eq("user_id", userId)
            .eq("type", "commission")
            .eq("status", "confirmed"),
          supabase
            .from("pending_commissions" as any)
            .select("amount, status")
            .eq("market_id", marketId)
            .eq("user_id", userId)
            .eq("type", "creator"),
          supabase
            .from("transactions")
            .select("amount")
            .eq("market_id", marketId)
            .eq("user_id", userId)
            .eq("type", "refund")
            .eq("side", "liquidity_return")
            .eq("status", "confirmed"),
          winningOptionId
            ? supabase.from("market_options").select("label").eq("id", winningOptionId).maybeSingle()
            : Promise.resolve({ data: null } as any),
        ]);

      if (cancelled) return;

      const payouts = (payoutsRes.data as any[]) || [];
      const refunds = (refundsRes.data as any[]) || [];
      const buys = (buysRes.data as any[]) || [];
      const commPaid = (commPaidRes.data as any[]) || [];
      const commPending = (commPendingRes.data as any[]) || [];
      const liqRefund = (liqRefundRes.data as any[]) || [];
      const optionLabel = (optionRes as any)?.data?.label as string | undefined;

      const totalPayouts = payouts.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const totalRefunds = refunds.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const totalVolume = buys.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const creatorRealizedFromTx = commPaid.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const creatorReleasedPending = commPending
        .filter((c) => c.status === "released")
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const creatorPending = commPending
        .filter((c) => c.status === "pending")
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const liquidityReturn = liqRefund.reduce((s, p) => s + (Number(p.amount) || 0), 0);

      const creatorRealized = creatorRealizedFromTx + creatorReleasedPending;

      let winningLabel = "—";
      if (optionLabel) winningLabel = optionLabel;
      else if (resolvedSide === "yes") winningLabel = "YES";
      else if (resolvedSide === "no") winningLabel = "NO";
      else if (resolvedSide === "cancelled") winningLabel = "Cancelled (refunded)";
      else if (resolvedSide) winningLabel = resolvedSide.toUpperCase();

      setData({
        totalPayouts,
        payoutCount: payouts.length,
        totalRefunds,
        refundCount: refunds.length,
        totalVolume,
        winningLabel,
        creatorRealized,
        creatorPending,
        liquidityReturn,
        totalEarnings: creatorRealized + liquidityReturn,
      });
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [marketId, userId, resolvedSide, winningOptionId]);

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const isCancelled = resolvedSide === "cancelled";
  const uniqueWinners = data.payoutCount;

  return (
    <div className="mt-2 bg-muted/30 border border-border rounded-xl p-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
      {/* Winning side highlight */}
      <div
        className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${
          isCancelled
            ? "bg-amber-500/10 border-amber-500/20"
            : "bg-emerald-500/10 border-emerald-500/20"
        }`}
      >
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isCancelled ? "bg-amber-500/20" : "bg-emerald-500/20"
          }`}
        >
          <Trophy className={`w-4 h-4 ${isCancelled ? "text-amber-500" : "text-emerald-500"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {isCancelled ? "Outcome" : "Winning Side"}
          </p>
          <p
            className={`text-sm font-bold truncate ${
              isCancelled ? "text-amber-500" : "text-emerald-500"
            }`}
          >
            {data.winningLabel}
          </p>
        </div>
      </div>

      {/* Market totals */}
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Market Totals
        </p>
        <Row icon={TrendingUp} label="Total Volume" value={`$${data.totalVolume.toFixed(2)}`} />
        <Row
          icon={DollarSign}
          label={isCancelled ? "Total Refunded" : "Total Payouts"}
          value={`$${(isCancelled ? data.totalRefunds : data.totalPayouts).toFixed(2)}`}
          hint={`${isCancelled ? data.refundCount : data.payoutCount} transactions`}
          accent="text-emerald-500"
        />
        <Row
          icon={Users}
          label={isCancelled ? "Refund Recipients" : "Winners Paid"}
          value={String(isCancelled ? data.refundCount : uniqueWinners)}
        />
      </div>

      {/* Your earnings breakdown */}
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Your Earnings Breakdown
        </p>
        <Row
          icon={Receipt}
          label="Creator Commissions"
          value={`$${data.creatorRealized.toFixed(2)}`}
          accent={data.creatorRealized > 0 ? "text-emerald-500" : undefined}
        />
        {data.creatorPending > 0 && (
          <Row
            icon={Receipt}
            label="Pending Commissions"
            value={`$${data.creatorPending.toFixed(2)}`}
            accent="text-amber-500"
          />
        )}
        <Row
          icon={Droplets}
          label="Liquidity Returned"
          value={`$${data.liquidityReturn.toFixed(2)}`}
          accent={data.liquidityReturn > 0 ? "text-blue-500" : undefined}
        />
        <div className="flex items-center justify-between gap-3 pt-2 mt-1 border-t border-border">
          <p className="text-xs font-semibold">Final Earnings</p>
          <p className="text-sm font-bold text-emerald-500">${data.totalEarnings.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
};

export default ResolvedMarketDetail;
