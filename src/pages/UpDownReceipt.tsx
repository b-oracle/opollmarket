import { useMemo } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft, ArrowUp, ArrowDown, CheckCircle2, XCircle, Trophy,
  TrendingDown, Receipt as ReceiptIcon, Wallet, ExternalLink, Info,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";

const fmtMoney = (v: number) => `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
const fmtDuration = (m: number) =>
  m >= 1440 ? `${Math.round(m / 1440)}d` : m >= 60 ? `${Math.round(m / 60)}h` : `${m}m`;
const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

const UpDownReceipt = () => {
  const { marketId = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["up-down-receipt", marketId, user?.id],
    enabled: !!user && !!marketId,
    queryFn: async () => {
      const [marketRes, posRes, txRes] = await Promise.all([
        supabase
          .from("markets")
          .select(
            "id, title, status, resolved_side, end_date, is_crypto_round, crypto_round_meta(asset, duration_minutes, open_price, close_price, end_time)",
          )
          .eq("id", marketId)
          .maybeSingle(),
        supabase
          .from("positions")
          .select("id, side, shares, avg_price, created_at")
          .eq("market_id", marketId)
          .eq("user_id", user!.id),
        supabase
          .from("transactions")
          .select("id, type, amount, side, shares, price, created_at, description, status")
          .eq("market_id", marketId)
          .eq("user_id", user!.id)
          .in("type", ["payout", "refund", "one_sided_refund"])
          .order("created_at", { ascending: false }),
      ]);
      return {
        market: marketRes.data as any,
        positions: (posRes.data as any[]) || [],
        payouts: (txRes.data as any[]) || [],
      };
    },
  });

  const { data: balanceRow } = useQuery({
    queryKey: ["receipt-balance", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("balances")
        .select("amount, bonus_balance")
        .eq("user_id", user!.id)
        .eq("currency", "USDT")
        .maybeSingle();
      return data as any;
    },
  });

  const calc = useMemo(() => {
    if (!data) return null;
    const { market, positions, payouts } = data;
    if (!market) return null;
    const winningSide = market.resolved_side as string | null;
    const winning = positions.filter((p: any) => p.side === winningSide && Number(p.shares) > 0);
    const losing = positions.filter((p: any) => p.side !== winningSide && Number(p.shares) > 0);
    const totalShares = winning.reduce((s: number, p: any) => s + Number(p.shares), 0);
    const totalCost = positions.reduce(
      (s: number, p: any) => s + Number(p.shares) * Number(p.avg_price), 0,
    );
    const winningCost = winning.reduce(
      (s: number, p: any) => s + Number(p.shares) * Number(p.avg_price), 0,
    );
    const losingCost = losing.reduce(
      (s: number, p: any) => s + Number(p.shares) * Number(p.avg_price), 0,
    );
    const grossPayout = totalShares; // each winning share pays $1
    const totalCredited = payouts.reduce((s: number, t: any) => s + Number(t.amount), 0);
    const fee = Math.max(0, grossPayout - totalCredited);
    const feePct = grossPayout > 0 ? (fee / grossPayout) * 100 : 0;
    const netProfit = totalCredited - totalCost;
    return {
      winningSide, winning, losing, totalShares, totalCost, winningCost, losingCost,
      grossPayout, totalCredited, fee, feePct, netProfit,
    };
  }, [data]);

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <div className="max-w-lg mx-auto px-4 pt-24 text-center text-sm text-muted-foreground">
          Loading receipt…
        </div>
        <BottomNav />
      </div>
    );
  }

  const market = data.market;
  if (!market) {
    return (
      <div className="min-h-screen bg-background">
        <TopBar />
        <div className="max-w-lg mx-auto px-4 pt-24 text-center text-sm text-muted-foreground">
          Market not found.
        </div>
        <BottomNav />
      </div>
    );
  }

  const meta = market.crypto_round_meta;
  const isCryptoRound = !!market.is_crypto_round && !!meta;
  const isResolved = market.status === "resolved";
  const isCancelled = market.status === "cancelled";
  const won = !!calc && calc.totalCredited > 0 && isResolved;
  const direction =
    meta && meta.close_price != null && meta.open_price != null
      ? meta.close_price > meta.open_price ? "UP" : meta.close_price < meta.open_price ? "DOWN" : "FLAT"
      : null;

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div
        className="max-w-lg mx-auto px-4 pb-28"
        style={{ paddingTop: "calc(var(--content-top) + 0.75rem)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full glass flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold leading-tight flex items-center gap-2">
              <ReceiptIcon className="w-4 h-4 text-primary" /> Winnings Receipt
            </h1>
            <p className="text-[11px] text-muted-foreground truncate">
              {isCryptoRound ? `${meta!.asset} ${fmtDuration(meta!.duration_minutes)}` : market.title}
            </p>
          </div>
        </div>

        {/* Status banner */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl border p-4 mb-3 ${
            isCancelled
              ? "border-muted bg-muted/20"
              : won
                ? "border-primary/40 bg-primary/10"
                : isResolved
                  ? "border-destructive/30 bg-destructive/5"
                  : "border-border/60 bg-card/40"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                isCancelled ? "bg-muted" : won ? "bg-primary/20" : "bg-destructive/15"
              }`}
            >
              {isCancelled ? (
                <Info className="w-5 h-5 text-muted-foreground" />
              ) : won ? (
                <Trophy className="w-5 h-5 text-primary" />
              ) : (
                <TrendingDown className="w-5 h-5 text-destructive" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                {isCancelled ? "Round Cancelled"
                  : !isResolved ? "Pending Resolution"
                  : won ? "Round Won" : "Round Lost"}
              </div>
              <div
                className={`text-2xl font-bold ${
                  isCancelled
                    ? "text-foreground"
                    : won ? "text-primary" : "text-destructive"
                }`}
              >
                {fmtMoney(calc?.totalCredited ?? 0)}
              </div>
              {calc && isResolved && !isCancelled && (
                <div className={`text-xs font-semibold ${calc.netProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                  Net {calc.netProfit >= 0 ? "+" : ""}{fmtMoney(calc.netProfit)} on {fmtMoney(calc.totalCost)} wagered
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Round outcome */}
        {isCryptoRound && (
          <div className="rounded-2xl border border-border/60 bg-card/40 p-4 mb-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Round Outcome
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">Open</div>
                <div className="text-sm font-bold tabular-nums">
                  {meta!.open_price != null ? `$${Number(meta!.open_price).toFixed(2)}` : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">Direction</div>
                <div
                  className={`text-sm font-bold flex items-center justify-center gap-1 ${
                    direction === "UP" ? "text-primary" : direction === "DOWN" ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {direction === "UP" && <ArrowUp className="w-3.5 h-3.5" />}
                  {direction === "DOWN" && <ArrowDown className="w-3.5 h-3.5" />}
                  {direction || "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">Close</div>
                <div className="text-sm font-bold tabular-nums">
                  {meta!.close_price != null ? `$${Number(meta!.close_price).toFixed(2)}` : "—"}
                </div>
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground text-center mt-2">
              Settled {fmtDateTime(meta!.end_time)}
            </div>
          </div>
        )}

        {/* Your entries */}
        {data.positions.length > 0 && (
          <div className="rounded-2xl border border-border/60 bg-card/40 p-4 mb-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Your Entries
            </div>
            <div className="space-y-2">
              {data.positions.map((p: any) => {
                const isWin = isResolved && p.side === market.resolved_side;
                const isYes = p.side === "yes";
                return (
                  <div key={p.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-md flex items-center justify-center ${
                          isYes ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
                        }`}
                      >
                        {isYes ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold">{isYes ? "UP" : "DOWN"}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {Number(p.shares).toFixed(2)} sh @ {(Number(p.avg_price) * 100).toFixed(0)}¢
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold tabular-nums">
                        {fmtMoney(Number(p.shares) * Number(p.avg_price))}
                      </div>
                      {isResolved && (
                        <div
                          className={`text-[10px] font-semibold flex items-center gap-1 justify-end ${
                            isWin ? "text-primary" : "text-destructive"
                          }`}
                        >
                          {isWin ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {isWin ? "Won" : "Lost"}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Calculation breakdown */}
        {calc && isResolved && !isCancelled && won && (
          <div className="rounded-2xl border border-border/60 bg-card/40 p-4 mb-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
              How your payout was calculated
            </div>
            <ol className="space-y-2.5 text-xs">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 shrink-0 rounded-full bg-muted text-[10px] flex items-center justify-center font-bold">1</span>
                <div className="flex-1">
                  <div className="font-semibold">Each winning share pays $1.00</div>
                  <div className="text-muted-foreground text-[11px] mt-0.5">
                    Round resolved <span className="font-semibold text-foreground">{(market.resolved_side || "").toUpperCase()}</span>.
                    You held <span className="font-semibold text-foreground">{calc.totalShares.toFixed(2)}</span> winning shares.
                  </div>
                </div>
                <span className="font-bold tabular-nums">{fmtMoney(calc.grossPayout)}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 shrink-0 rounded-full bg-muted text-[10px] flex items-center justify-center font-bold">2</span>
                <div className="flex-1">
                  <div className="font-semibold">Platform fee</div>
                  <div className="text-muted-foreground text-[11px] mt-0.5">
                    {calc.fee > 0 ? `${calc.feePct.toFixed(2)}% of gross winnings` : "No fee applied"}
                  </div>
                </div>
                <span className="font-bold tabular-nums text-destructive">−{fmtMoney(calc.fee)}</span>
              </li>
              <li className="flex items-start gap-2 pt-2 border-t border-border/40">
                <span className="w-5 h-5 shrink-0 rounded-full bg-primary/20 text-primary text-[10px] flex items-center justify-center font-bold">=</span>
                <div className="flex-1">
                  <div className="font-bold">Net payout credited</div>
                  <div className="text-muted-foreground text-[11px] mt-0.5">
                    Cost basis {fmtMoney(calc.totalCost)} → profit {calc.netProfit >= 0 ? "+" : ""}{fmtMoney(calc.netProfit)}
                  </div>
                </div>
                <span className="font-bold tabular-nums text-primary">{fmtMoney(calc.totalCredited)}</span>
              </li>
            </ol>
          </div>
        )}

        {/* Credit confirmation */}
        {data.payouts.length > 0 && (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-4 h-4 text-primary" />
              <div className="text-[11px] uppercase tracking-wider text-primary font-semibold">
                Credited to balance
              </div>
            </div>
            <div className="space-y-1.5">
              {data.payouts.map((tx: any) => (
                <div key={tx.id} className="flex items-center justify-between text-xs">
                  <div className="flex flex-col">
                    <span className="font-semibold capitalize">
                      {tx.type === "one_sided_refund" ? "One-sided refund"
                        : tx.type === "refund" ? "Refund"
                        : "Winning payout"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {fmtDateTime(tx.created_at)} · {tx.status}
                    </span>
                  </div>
                  <span className="font-bold text-primary tabular-nums">+{fmtMoney(Number(tx.amount))}</span>
                </div>
              ))}
            </div>
            {balanceRow && (
              <div className="flex items-center justify-between text-xs pt-2 mt-2 border-t border-primary/20">
                <span className="text-muted-foreground">Current balance</span>
                <span className="font-bold tabular-nums">{fmtMoney(Number(balanceRow.amount ?? 0))}</span>
              </div>
            )}
            <Link
              to="/transactions"
              className="mt-3 flex items-center justify-center gap-1.5 w-full rounded-lg bg-primary/15 hover:bg-primary/25 text-primary text-xs font-semibold py-2 transition-colors"
            >
              View in balance history <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        )}

        {/* Pending / no payout state */}
        {!isResolved && (
          <div className="rounded-2xl border border-border/60 bg-card/40 p-4 mb-3 text-center">
            <Info className="w-5 h-5 text-muted-foreground mx-auto mb-1.5" />
            <div className="text-sm font-semibold">Round still open</div>
            <div className="text-[11px] text-muted-foreground">
              The receipt will populate once the round settles{meta?.end_time ? ` at ${fmtDateTime(meta.end_time)}` : ""}.
            </div>
          </div>
        )}

        {isResolved && !won && !isCancelled && data.positions.length > 0 && (
          <div className="rounded-2xl border border-border/60 bg-card/40 p-4 mb-3 text-center">
            <div className="text-sm font-semibold">No payout this round</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Your side did not win — wagered {fmtMoney(calc?.totalCost ?? 0)}.
            </div>
          </div>
        )}

        <button
          onClick={() => navigate(`/market/${market.id}`)}
          className="w-full rounded-xl border border-border/60 bg-card/40 hover:bg-card/60 text-sm font-semibold py-3 transition-colors"
        >
          Open market
        </button>
      </div>
      <BottomNav />
    </div>
  );
};

export default UpDownReceipt;
