import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CheckCircle2, Trophy, TrendingDown, ArrowUp, ArrowDown, Minus, Share2 } from "lucide-react";
import { motion } from "framer-motion";
import { optionColors } from "@/lib/optionColors";
import ShareModal from "@/components/ShareModal";
import ProfitShareCard from "@/components/ProfitShareCard";
import TransactionStatusTracker, { buildResolveStages } from "@/components/TransactionStatusTracker";

interface ResolutionSummaryProps {
  marketId: string;
  marketTitle?: string;
  resolvedSide: string | null;
  winningOptionId: string | null;
  options?: { id: string; label: string; price: number; sortOrder: number }[];
  marketType: string;
  sportPredictedOutcome?: string | null;
}

interface Position {
  id: string;
  side: string;
  shares: number;
  avg_price: number;
  option_id: string | null;
}

interface PayoutTx {
  amount: number;
  side: string;
  type: string;
}

const colorAlpha = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

export default function ResolutionSummary({ marketId, marketTitle, resolvedSide, winningOptionId, options, marketType, sportPredictedOutcome }: ResolutionSummaryProps) {
  const { user } = useAuth();
  const isMulti = marketType === "multi" || marketType === "range";
  const [shareOpen, setShareOpen] = useState(false);
  const profitCardRef = useRef<HTMLDivElement>(null);

  const winningOption = options?.find(o => o.id === winningOptionId);
  // For binary sports markets, prefer the actual team/outcome name over "YES"/"NO"
  const sportLabel = sportPredictedOutcome?.trim();
  const winningLabel = isMulti && winningOption
    ? winningOption.label
    : sportLabel && resolvedSide === "yes"
      ? sportLabel
      : sportLabel && resolvedSide === "no"
        ? `Not ${sportLabel}`
        : resolvedSide
          ? resolvedSide.toUpperCase()
          : "Unknown";

  const winningOptionIdx = winningOption && options
    ? options.findIndex(o => o.id === winningOptionId)
    : -1;
  const winColor = isMulti && winningOptionIdx >= 0
    ? optionColors[winningOptionIdx % optionColors.length]
    : resolvedSide === "yes" ? "#22c55e" : resolvedSide === "no" ? "#ef4444" : "#888";

  const { data: userPositions } = useQuery({
    queryKey: ["resolution-positions", marketId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions")
        .select("id, side, shares, avg_price, option_id")
        .eq("market_id", marketId)
        .eq("user_id", user!.id)
        .gt("shares", 0);
      if (error) throw error;
      return (data || []) as Position[];
    },
    enabled: !!user?.id,
  });

  const { data: payoutTxs } = useQuery({
    queryKey: ["resolution-payouts", marketId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("amount, side, type")
        .eq("market_id", marketId)
        .eq("user_id", user!.id)
        .in("type", ["payout", "refund", "one_sided_refund"]);
      if (error) throw error;
      return (data || []) as PayoutTx[];
    },
    enabled: !!user?.id,
  });

  const { data: marketMeta } = useQuery({
    queryKey: ["resolution-meta", marketId],
    queryFn: async () => {
      const { data } = await supabase
        .from("markets")
        .select("status, end_date, moderator_reviewed_at")
        .eq("id", marketId)
        .maybeSingle();
      return data;
    },
    refetchInterval: 5000,
  });

  const totalPayout = payoutTxs?.reduce((sum, tx) => sum + Number(tx.amount), 0) ?? 0;
  const hasPositions = userPositions && userPositions.length > 0;
  const didWin = totalPayout > 0;
  const totalWagered = userPositions?.reduce((sum, p) => sum + (Number(p.shares) * Number(p.avg_price)), 0) ?? 0;
  const netPnl = totalPayout - totalWagered;

  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Trader";
  const referralCode = user?.user_metadata?.display_name || user?.id || "";
  const referralLink = `https://opoll.org/market/${marketId}${referralCode ? `?ref=${referralCode}` : ""}`;

  return (
    <div className="space-y-3 mb-4">
      {/* Winning outcome banner */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border p-4"
        style={{
          borderColor: colorAlpha(winColor, 0.4),
          background: colorAlpha(winColor, 0.08),
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: colorAlpha(winColor, 0.2) }}>
            <Trophy className="w-5 h-5" style={{ color: winColor }} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Winning Outcome</p>
            <p className="text-lg font-bold" style={{ color: winColor }}>{winningLabel}</p>
          </div>
        </div>

        {isMulti && options && options.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {options
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((opt, i) => {
                const isWinner = opt.id === winningOptionId;
                const color = optionColors[i % optionColors.length];
                return (
                  <div key={opt.id} className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${isWinner ? "font-bold" : "opacity-50"}`}
                    style={{ background: colorAlpha(color, isWinner ? 0.15 : 0.05) }}>
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                      <span>{opt.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span style={{ color }}>{Math.round(opt.price * 100)}¢</span>
                      {isWinner && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </motion.div>

      {/* User result card */}
      {user && hasPositions && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`rounded-xl border p-4 ${
            didWin
              ? "border-green-500/30 bg-green-500/5"
              : "border-destructive/30 bg-destructive/5"
          }`}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              didWin ? "bg-green-500/20" : "bg-destructive/20"
            }`}>
              {didWin ? (
                <Trophy className="w-5 h-5 text-green-500" />
              ) : (
                <TrendingDown className="w-5 h-5 text-destructive" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-lg font-bold ${didWin ? "text-green-500" : "text-destructive"}`}>
                {didWin ? "You Won! 🎉" : "You Lost"}
              </p>
              <p className="text-xs text-muted-foreground">
                {didWin
                  ? `Payout: $${totalPayout.toFixed(2)} (${netPnl >= 0 ? "+" : ""}$${netPnl.toFixed(2)} profit)`
                  : `Lost: $${totalWagered.toFixed(2)}`}
              </p>
            </div>
            {didWin && (
              <button
                onClick={() => setShareOpen(true)}
                className="shrink-0 w-9 h-9 rounded-full bg-green-500/15 hover:bg-green-500/25 flex items-center justify-center transition-colors"
              >
                <Share2 className="w-4 h-4 text-green-500" />
              </button>
            )}
          </div>

          {/* Position breakdown */}
          <div className="space-y-2 border-t border-border/30 pt-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Your Predictions</p>
            {userPositions.map((pos) => {
              const optionMatch = options?.find(o => o.id === pos.option_id);
              const optIdx = optionMatch && options ? options.findIndex(o => o.id === pos.option_id) : -1;
              const posLabel = isMulti && optionMatch
                ? optionMatch.label
                : sportLabel && pos.side === "yes"
                  ? sportLabel
                  : sportLabel && pos.side === "no"
                    ? `Not ${sportLabel}`
                    : pos.side.toUpperCase();
              const posColor = isMulti && optIdx >= 0
                ? optionColors[optIdx % optionColors.length]
                : pos.side === "yes" ? "#22c55e" : "#ef4444";
              const isWinningPos = isMulti
                ? pos.option_id === winningOptionId
                : pos.side === resolvedSide;
              const cost = Number(pos.shares) * Number(pos.avg_price);

              return (
                <div key={pos.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: colorAlpha(posColor, 0.15) }}>
                      {pos.side === "yes" || (isMulti && isWinningPos)
                        ? <ArrowUp className="w-3 h-3" style={{ color: posColor }} />
                        : pos.side === "no"
                          ? <ArrowDown className="w-3 h-3" style={{ color: posColor }} />
                          : <Minus className="w-3 h-3" style={{ color: posColor }} />}
                    </div>
                    <div>
                      <p className="text-xs font-semibold">{posLabel}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {Number(pos.shares).toFixed(2)} shares @ {(Number(pos.avg_price) * 100).toFixed(0)}¢
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">Cost: ${cost.toFixed(2)}</p>
                    <p className={`text-xs font-bold ${isWinningPos ? "text-green-500" : "text-destructive"}`}>
                      {isWinningPos ? "✓ Won" : "✗ Lost"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Payout breakdown */}
          {payoutTxs && payoutTxs.length > 0 && (
            <div className="mt-3 border-t border-border/30 pt-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Payouts</p>
              {payoutTxs.map((tx, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1">
                  <span className="text-muted-foreground capitalize">
                    {tx.type === "one_sided_refund" ? "One-Sided Bonus" : tx.type === "refund" ? "Refund" : "Winning Payout"}
                  </span>
                  <span className="font-bold text-green-500">+${Number(tx.amount).toFixed(2)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm font-bold pt-2 border-t border-border/20 mt-1">
                <span>Total Received</span>
                <span className="text-green-500">${totalPayout.toFixed(2)}</span>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Off-screen profit share card for screenshot */}
      {didWin && user && (
        <ProfitShareCard
          ref={profitCardRef}
          market={marketTitle || "Prediction Market"}
          side={winningLabel}
          profit={netPnl}
          payout={totalPayout}
          displayName={displayName}
          referralCode={referralCode}
        />
      )}

      <ShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        title={`I just won +$${netPnl.toFixed(2)} on oPoll! 🔥`}
        description={marketTitle || "Prediction Market"}
        marketUrl={referralLink}
        marketId={marketId}
        captureRef={profitCardRef}
      />
    </div>
  );
}