import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowDownToLine, ArrowUpFromLine, TrendingUp, TrendingDown, Trophy, RotateCcw, Droplets, Lock, Receipt, AlertCircle, Gift, Wallet, Zap, Flame, Banknote } from "lucide-react";

interface Props {
  userId: string;
}

interface Row {
  label: string;
  amount: number;
  count: number;
  sign: 1 | -1;
  icon: any;
  cls: string;
  hint?: string;
}

const fmt = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const BalanceBreakdown = ({ userId }: Props) => {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-balance-breakdown", userId],
    queryFn: async () => {
      const [txRes, qbRes, balRes, refRewRes, debtRes, giftSentRes, giftRecvRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("type, amount, side, status, description, bonus_amount")
          .eq("user_id", userId)
          .eq("status", "confirmed"),
        supabase
          .from("quick_bets")
          .select("status, amount, payout")
          .eq("user_id", userId)
          .in("status", ["won", "lost"]),
        supabase
          .from("balances")
          .select("amount, bonus_balance")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("referral_rewards")
          .select("amount")
          .eq("referrer_id", userId),
        supabase
          .from("balance_debts")
          .select("amount, settled_amount, status")
          .eq("user_id", userId),
        supabase
          .from("transactions")
          .select("amount")
          .eq("user_id", userId)
          .eq("type", "gift_sent")
          .eq("status", "confirmed"),
        supabase
          .from("transactions")
          .select("amount")
          .eq("user_id", userId)
          .eq("type", "gift_received")
          .eq("status", "confirmed"),
      ]);

      const txns = txRes.data || [];
      const qbs = qbRes.data || [];
      const bal = balRes.data;
      const refRews = refRewRes.data || [];
      const debts = debtRes.data || [];

      const sum = (arr: any[], pred: (t: any) => boolean, key: "amount" | "bonus_amount" = "amount") =>
        arr.filter(pred).reduce((s, t) => s + Number(t[key] || 0), 0);
      const count = (arr: any[], pred: (t: any) => boolean) => arr.filter(pred).length;

      // === DEPOSITS (+) ===
      const deposits = sum(txns, (t) => t.type === "deposit");
      const depositsCount = count(txns, (t) => t.type === "deposit");

      // === WITHDRAWALS (-) ===
      const withdrawals = sum(txns, (t) => t.type === "withdrawal");
      const withdrawalsCount = count(txns, (t) => t.type === "withdrawal");
      const withdrawalFees = sum(txns, (t) => t.type === "buy" && t.side === "withdrawal_fee");

      // === PREDICTION BUYS (-) excluding liquidity & fees ===
      const buyExcludeSides = new Set([
        "initial_liquidity",
        "market_creation_fee",
        "broadcast_fee",
        "boost_fee",
        "auto_resolve_fee",
        "withdrawal_fee",
        "ai_generation",
        "ai_market_creation",
        "ai_image",
        "ai_social_image",
        "ai_social_caption",
        "ai_description",
        "ai_details",
        "social_ad",
        "promotion_boost_flash_broadcast",
        "broadcast_alert",
      ]);
      const predictionBuys = sum(txns, (t) => t.type === "buy" && !buyExcludeSides.has(t.side));
      const predictionBuysCount = count(txns, (t) => t.type === "buy" && !buyExcludeSides.has(t.side));

      // === PREDICTION SELLS (+) ===
      const predictionSells = sum(txns, (t) => t.type === "sell");
      const predictionSellsCount = count(txns, (t) => t.type === "sell");

      // === PAYOUTS (+) ===
      const payouts = sum(txns, (t) => t.type === "payout");
      const payoutsCount = count(txns, (t) => t.type === "payout");

      // === REFUNDS (+) ===
      const refundsAll = sum(txns, (t) => t.type === "refund");
      const refundsCount = count(txns, (t) => t.type === "refund");

      // === MARKET CREATION: liquidity lock (-) ===
      const liquidityLock = sum(
        txns,
        (t) => t.type === "buy" && t.side === "initial_liquidity"
      );
      const liquidityLockCount = count(
        txns,
        (t) => t.type === "buy" && t.side === "initial_liquidity"
      );

      // === MARKET CREATION: liquidity unlock/return (+) ===
      const liquidityReturn = sum(
        txns,
        (t) =>
          (t.type === "refund" || t.type === "payout") && t.side === "liquidity_return"
      );
      const liquidityReturnCount = count(
        txns,
        (t) =>
          (t.type === "refund" || t.type === "payout") && t.side === "liquidity_return"
      );

      // === MARKET CREATION FEE (-) ===
      const marketCreationFee = sum(
        txns,
        (t) =>
          (t.type === "buy" && t.side === "market_creation_fee") ||
          (t.type === "buy" && t.description === "creation_fee_escrow_hold") ||
          (t.type === "buy" && t.description === "market_creation_fee")
      );
      const marketCreationFeeCount = count(
        txns,
        (t) =>
          (t.type === "buy" && t.side === "market_creation_fee") ||
          (t.type === "buy" && t.description === "creation_fee_escrow_hold") ||
          (t.type === "buy" && t.description === "market_creation_fee")
      );

      // === CREATION FEE REFUND (+) ===
      const creationFeeRefund = sum(
        txns,
        (t) => t.type === "refund" && t.description === "creation_fee_escrow_refund"
      );
      const creationFeeRefundCount = count(
        txns,
        (t) => t.type === "refund" && t.description === "creation_fee_escrow_refund"
      );

      // === CREATOR COMMISSIONS (+) ===
      const creatorCommissions = sum(txns, (t) => t.type === "commission" && t.side === "creator");
      const creatorCommissionsCount = count(txns, (t) => t.type === "commission" && t.side === "creator");

      // === REFERRAL COMMISSIONS (+) ===
      const referralCommissions = sum(txns, (t) => t.type === "commission" && t.side === "referral");
      const referralCommissionsCount = count(txns, (t) => t.type === "commission" && t.side === "referral");

      // === OTHER COMMISSIONS / CREDITS (+) ===
      const otherCredits = sum(
        txns,
        (t) =>
          t.type === "commission" &&
          t.side !== "creator" &&
          t.side !== "referral"
      );
      const otherCreditsCount = count(
        txns,
        (t) =>
          t.type === "commission" &&
          t.side !== "creator" &&
          t.side !== "referral"
      );

      // === QUICK TRADES ===
      const qtBuys = qbs.reduce((s, q) => s + Number(q.amount || 0), 0);
      const qtBuysCount = qbs.length;
      const qtPayouts = qbs.filter((q) => q.status === "won").reduce((s, q) => s + Number(q.payout || 0), 0);
      const qtPayoutsCount = count(qbs, (q) => q.status === "won");
      const qtBonus = sum(txns, (t) => t.type === "qt_one_sided_bonus");
      const qtBonusCount = count(txns, (t) => t.type === "qt_one_sided_bonus");

      // === FEES (broadcast / boost / auto-resolve / AI / withdrawal) (-) ===
      const broadcastFees = sum(txns, (t) => t.type === "buy" && t.side === "broadcast_fee");
      const broadcastFeesCount = count(txns, (t) => t.type === "buy" && t.side === "broadcast_fee");
      const boostFees = sum(txns, (t) => t.type === "buy" && t.side === "boost_fee");
      const boostFeesCount = count(txns, (t) => t.type === "buy" && t.side === "boost_fee");
      const autoResolveFees = sum(txns, (t) => t.type === "buy" && t.side === "auto_resolve_fee");
      const autoResolveFeesCount = count(txns, (t) => t.type === "buy" && t.side === "auto_resolve_fee");
      const aiFees = sum(
        txns,
        (t) =>
          t.type === "buy" &&
          (t.side?.startsWith("ai_") || t.side === "ai_generation")
      );
      const aiFeesCount = count(
        txns,
        (t) =>
          t.type === "buy" &&
          (t.side?.startsWith("ai_") || t.side === "ai_generation")
      );

      // === GIFTS ===
      const giftsSent = giftSentRes.data?.reduce((s, t) => s + Number(t.amount || 0), 0) || 0;
      const giftsSentCount = giftSentRes.data?.length || 0;
      const giftsReceived = giftRecvRes.data?.reduce((s, t) => s + Number(t.amount || 0), 0) || 0;
      const giftsReceivedCount = giftRecvRes.data?.length || 0;

      // === CLAWBACKS (-) ===
      const clawbacks = sum(txns, (t) => t.type === "clawback");
      const clawbacksCount = count(txns, (t) => t.type === "clawback");

      // === DEBT SETTLEMENTS ===
      const settledDebt = debts.reduce(
        (s, d: any) => s + Number(d.settled_amount || 0),
        0
      );
      const settledDebtCount = debts.filter((d: any) => Number(d.settled_amount || 0) > 0).length;
      const outstandingDebt = debts
        .filter((d: any) => d.status === "pending")
        .reduce((s, d: any) => s + Number(d.amount || 0), 0);
      const outstandingDebtCount = debts.filter((d: any) => d.status === "pending").length;

      // === REFERRAL REWARDS (+) — separate table ===
      const referralRewards = refRews.reduce((s, r) => s + Number(r.amount || 0), 0);
      const referralRewardsCount = refRews.length;

      // === Final balances ===
      const mainBalance = bal ? Number(bal.amount) : 0;
      const bonusBalance = bal ? Number(bal.bonus_balance ?? 0) : 0;
      const currentBalance = mainBalance + bonusBalance;

      // === Net calculation ===
      const inflows =
        deposits +
        predictionSells +
        payouts +
        refundsAll +
        liquidityReturn +
        creationFeeRefund +
        creatorCommissions +
        referralCommissions +
        otherCredits +
        qtPayouts +
        qtBonus +
        giftsReceived +
        referralRewards;

      const outflows =
        withdrawals +
        withdrawalFees +
        predictionBuys +
        liquidityLock +
        marketCreationFee +
        broadcastFees +
        boostFees +
        autoResolveFees +
        aiFees +
        qtBuys +
        giftsSent +
        clawbacks +
        settledDebt;

      const computedNet = inflows - outflows;

      const inflowRows: Row[] = [
        { label: "Deposits", amount: deposits, count: depositsCount, sign: 1, icon: ArrowDownToLine, cls: "text-primary" },
        { label: "Prediction Sells", amount: predictionSells, count: predictionSellsCount, sign: 1, icon: TrendingDown, cls: "text-green-500" },
        { label: "Prediction Payouts", amount: payouts, count: payoutsCount, sign: 1, icon: Trophy, cls: "text-green-500" },
        { label: "Refunds", amount: refundsAll - creationFeeRefund - liquidityReturn, count: refundsCount - creationFeeRefundCount - liquidityReturnCount, sign: 1, icon: RotateCcw, cls: "text-cyan-500", hint: "Excludes liquidity & creation-fee refunds shown below" },
        { label: "Liquidity Returned", amount: liquidityReturn, count: liquidityReturnCount, sign: 1, icon: Droplets, cls: "text-cyan-400" },
        { label: "Creation Fee Refunded", amount: creationFeeRefund, count: creationFeeRefundCount, sign: 1, icon: RotateCcw, cls: "text-cyan-400" },
        { label: "Creator Commissions", amount: creatorCommissions, count: creatorCommissionsCount, sign: 1, icon: Wallet, cls: "text-emerald-500" },
        { label: "Referral Commissions", amount: referralCommissions, count: referralCommissionsCount, sign: 1, icon: Gift, cls: "text-emerald-400" },
        { label: "Other Credits", amount: otherCredits, count: otherCreditsCount, sign: 1, icon: Receipt, cls: "text-muted-foreground" },
        { label: "Quick Trade Payouts", amount: qtPayouts, count: qtPayoutsCount, sign: 1, icon: Zap, cls: "text-green-500" },
        { label: "Quick Trade Bonus", amount: qtBonus, count: qtBonusCount, sign: 1, icon: Zap, cls: "text-emerald-400" },
        { label: "Gifts Received", amount: giftsReceived, count: giftsReceivedCount, sign: 1, icon: Gift, cls: "text-pink-400" },
        { label: "Referral Rewards", amount: referralRewards, count: referralRewardsCount, sign: 1, icon: Gift, cls: "text-pink-400" },
      ];

      const outflowRows: Row[] = [
        { label: "Withdrawals", amount: withdrawals, count: withdrawalsCount, sign: -1, icon: ArrowUpFromLine, cls: "text-amber-500" },
        { label: "Withdrawal Fees", amount: withdrawalFees, count: 0, sign: -1, icon: Banknote, cls: "text-amber-400" },
        { label: "Prediction Buys", amount: predictionBuys, count: predictionBuysCount, sign: -1, icon: TrendingUp, cls: "text-red-500" },
        { label: "Liquidity Locked", amount: liquidityLock, count: liquidityLockCount, sign: -1, icon: Lock, cls: "text-blue-500" },
        { label: "Market Creation Fee", amount: marketCreationFee, count: marketCreationFeeCount, sign: -1, icon: Receipt, cls: "text-orange-500" },
        { label: "Broadcast Fees", amount: broadcastFees, count: broadcastFeesCount, sign: -1, icon: Flame, cls: "text-orange-400" },
        { label: "Boost Fees", amount: boostFees, count: boostFeesCount, sign: -1, icon: Flame, cls: "text-orange-400" },
        { label: "Auto-Resolve Fees", amount: autoResolveFees, count: autoResolveFeesCount, sign: -1, icon: Receipt, cls: "text-orange-400" },
        { label: "AI Generation Fees", amount: aiFees, count: aiFeesCount, sign: -1, icon: Receipt, cls: "text-violet-400" },
        { label: "Quick Trade Buys", amount: qtBuys, count: qtBuysCount, sign: -1, icon: Zap, cls: "text-red-400" },
        { label: "Gifts Sent", amount: giftsSent, count: giftsSentCount, sign: -1, icon: Gift, cls: "text-pink-500" },
        { label: "Admin Clawbacks", amount: clawbacks, count: clawbacksCount, sign: -1, icon: AlertCircle, cls: "text-red-600" },
        { label: "Debts Settled", amount: settledDebt, count: settledDebtCount, sign: -1, icon: AlertCircle, cls: "text-red-500", hint: "Auto-deductions to clear prior debt" },
      ];

      return {
        inflowRows: inflowRows.filter((r) => r.amount > 0 || r.count > 0),
        outflowRows: outflowRows.filter((r) => r.amount > 0 || r.count > 0),
        inflows,
        outflows,
        computedNet,
        currentBalance,
        mainBalance,
        bonusBalance,
        outstandingDebt,
        outstandingDebtCount,
      };
    },
    enabled: !!userId,
  });

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
      </div>
    );
  }

  const drift = data.currentBalance - data.computedNet;
  const driftAbs = Math.abs(drift);
  const driftCls = driftAbs < 0.01 ? "text-green-500" : driftAbs < 1 ? "text-amber-500" : "text-red-500";

  const Section = ({ title, rows, total, sign }: { title: string; rows: Row[]; total: number; sign: 1 | -1 }) => (
    <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border/50">
        <span className="text-xs font-bold uppercase tracking-wide">{title}</span>
        <span className={`text-sm font-bold ${sign === 1 ? "text-green-500" : "text-red-500"}`}>
          {sign === 1 ? "+" : "-"}
          {fmt(total)}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-center text-muted-foreground py-4 text-xs">No activity</p>
      ) : (
        <div className="divide-y divide-border/40">
          {rows.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.label} className="flex items-center gap-3 px-3 py-2">
                <div className={`p-1.5 rounded-md bg-muted ${r.cls}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{r.label}</p>
                  {r.hint && <p className="text-[10px] text-muted-foreground mt-0.5">{r.hint}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-xs font-bold ${r.sign === 1 ? "text-green-500" : "text-red-500"}`}>
                    {r.sign === 1 ? "+" : "-"}
                    {fmt(r.amount)}
                  </p>
                  {r.count > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      {r.count} {r.count === 1 ? "tx" : "txs"}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Top summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-xl bg-muted/30 border border-border/50">
          <p className="text-[10px] text-muted-foreground font-medium mb-1">Main Balance</p>
          <p className="text-sm font-bold">{fmt(data.mainBalance)}</p>
        </div>
        <div className="p-2.5 rounded-xl bg-muted/30 border border-border/50">
          <p className="text-[10px] text-muted-foreground font-medium mb-1">Bonus Balance</p>
          <p className="text-sm font-bold">{fmt(data.bonusBalance)}</p>
        </div>
        <div className="p-2.5 rounded-xl bg-muted/30 border border-border/50">
          <p className="text-[10px] text-muted-foreground font-medium mb-1">Total Balance</p>
          <p className="text-sm font-bold text-primary">{fmt(data.currentBalance)}</p>
        </div>
      </div>

      {/* Inflows */}
      <Section title="Inflows" rows={data.inflowRows} total={data.inflows} sign={1} />

      {/* Outflows */}
      <Section title="Outflows" rows={data.outflowRows} total={data.outflows} sign={-1} />

      {/* Net calculation */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Total Inflows</span>
          <span className="font-bold text-green-500">+{fmt(data.inflows)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Total Outflows</span>
          <span className="font-bold text-red-500">-{fmt(data.outflows)}</span>
        </div>
        <div className="border-t border-border/50 pt-2 flex items-center justify-between">
          <span className="text-sm font-bold">Computed Net</span>
          <span className="text-base font-bold">{fmt(data.computedNet)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold">Current Balance</span>
          <span className="text-base font-bold text-primary">{fmt(data.currentBalance)}</span>
        </div>
        <div className="border-t border-border/50 pt-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground">Reconciliation Drift</span>
          <span className={`text-sm font-bold ${driftCls}`}>
            {drift >= 0 ? "+" : ""}
            {fmt(drift)}
          </span>
        </div>
        {driftAbs >= 0.01 && (
          <p className="text-[10px] text-muted-foreground leading-snug">
            Drift represents balance not explained by ledger rows. Common causes: locked liquidity in
            active markets (still on-book), open prediction positions, pending withdrawals, or
            unlogged historical adjustments.
          </p>
        )}
      </div>
    </div>
  );
};

export default BalanceBreakdown;
