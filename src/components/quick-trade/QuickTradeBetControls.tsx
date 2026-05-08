import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUp, ArrowDown, Loader2, Moon, AlertTriangle, DollarSign, TrendingUp, TrendingDown, Clock } from "lucide-react";
import { isMarketOpen, getNextOpenTime } from "@/lib/marketHours";
import { getAssetClass } from "@/data/assetClasses";
import { hapticLight } from "@/lib/haptics";
import AnimatedNumber from "@/components/AnimatedNumber";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

interface QuickTradeBetControlsProps {
  userBet: { side: string; amount: number } | null;
  betAmount: string;
  setBetAmount: (v: string) => void;
  placing: boolean;
  isLocked: boolean;
  timeLeft: number;
  qtMinBet: number;
  qtMaxBet: number;
  onPlaceBet: (side: "up" | "down") => void;
  amountPresets: number[];
  asset?: string;
  currentPrice?: number | null;
  timeframeLabel?: string;
  poolUp?: number;
  poolDown?: number;
}

export default function QuickTradeBetControls({
  userBet, betAmount, setBetAmount, placing, isLocked, timeLeft,
  qtMinBet, qtMaxBet, onPlaceBet, amountPresets, asset, currentPrice, timeframeLabel,
  poolUp, poolDown,
}: QuickTradeBetControlsProps) {
  const assetClass = asset ? getAssetClass(asset) : "crypto";
  const marketOpen = isMarketOpen(assetClass);
  const nextOpen = !marketOpen ? getNextOpenTime(assetClass) : "";
  const [confirmSide, setConfirmSide] = useState<"up" | "down" | null>(null);

  const handleConfirmTrade = () => {
    if (confirmSide) {
      onPlaceBet(confirmSide);
      setConfirmSide(null);
    }
  };

  if (userBet) {
    return (
      <div className={`rounded-2xl border p-4 mb-4 text-center ${
        userBet.side === "up" ? "border-green-500/30 bg-green-500/5" : "border-destructive/30 bg-destructive/5"
      }`}>
        <p className="text-sm font-semibold text-foreground mb-1">
          Your trade: <span className={userBet.side === "up" ? "text-green-500" : "text-destructive"}>
            {userBet.side.toUpperCase()}
          </span> — ${Number(userBet.amount).toFixed(2)}
        </p>
        <p className="text-xs text-muted-foreground">Waiting for round to resolve...</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 mb-4">
      {!marketOpen && (
        <div className="flex items-center justify-center gap-2 mb-3 py-2 px-3 rounded-xl bg-muted/50 border border-muted-foreground/15">
          <Moon className="w-4 h-4 text-muted-foreground" />
          <div className="text-center">
            <p className="text-xs font-semibold text-muted-foreground">Market Closed</p>
            <p className="text-[10px] text-muted-foreground/70">{nextOpen}</p>
          </div>
        </div>
      )}

      <div className="mb-3">
        <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">Amount ($)</label>
        <Input
          type="number"
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          min={String(qtMinBet)}
          max={String(qtMaxBet)}
          step="1"
          className="text-lg font-bold text-center h-12"
          disabled={isLocked || timeLeft === 0 || !marketOpen}
        />
        <div className="flex gap-1.5 sm:gap-2 mt-2">
          {amountPresets.map((p) => (
            <button
              key={p}
              onClick={() => setBetAmount(String(p))}
              disabled={!marketOpen}
              className="flex-1 py-2 rounded-lg text-xs font-semibold bg-muted/50 hover:bg-muted text-muted-foreground transition-colors disabled:opacity-50"
            >
              ${p}
            </button>
          ))}
        </div>
      </div>

      {(() => {
        // Parimutuel implied prob → cents on a $1 payout.
        // Empty pools (round just spawned) → fall back to 50/50 with payout placeholder.
        const total = (poolUp ?? 0) + (poolDown ?? 0);
        const hasPools = total > 0;
        const upCents = hasPools ? Math.max(1, Math.min(99, Math.round(((poolDown ?? 0) / total) * 100))) : 50;
        const downCents = 100 - upCents;
        const fmtPayout = (cents: number) => hasPools ? `Win $${(1 / (cents / 100)).toFixed(2)}/$1` : "Win —/$1";
        const tap = (s: "up" | "down") => { void hapticLight(); setConfirmSide(s); };
        return (
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <Button
              onClick={() => tap("up")}
              disabled={placing || isLocked || timeLeft === 0 || !marketOpen}
              className="h-16 sm:h-[68px] flex-col gap-0 text-base font-extrabold bg-green-600 hover:bg-green-700 text-white rounded-xl shadow-[0_0_20px_hsl(142_71%_45%/0.3)]"
            >
              <span className="flex items-center gap-1.5 leading-none">
                <ArrowUp className="w-5 h-5" />
                Up <AnimatedNumber value={upCents} className="tabular-nums" />¢
              </span>
              <span className="text-[10px] font-semibold opacity-80 leading-none transition-opacity duration-300">{fmtPayout(upCents)}</span>
            </Button>
            <Button
              onClick={() => tap("down")}
              disabled={placing || isLocked || timeLeft === 0 || !marketOpen}
              className="h-16 sm:h-[68px] flex-col gap-0 text-base font-extrabold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-[0_0_20px_hsl(0_84%_60%/0.3)]"
            >
              <span className="flex items-center gap-1.5 leading-none">
                <ArrowDown className="w-5 h-5" />
                Down <AnimatedNumber value={downCents} className="tabular-nums" />¢
              </span>
              <span className="text-[10px] font-semibold opacity-80 leading-none transition-opacity duration-300">{fmtPayout(downCents)}</span>
            </Button>
          </div>
        );
      })()}

      {placing && (
        <div className="flex items-center justify-center gap-2 mt-3">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Placing trade...</span>
        </div>
      )}

      {/* Confirmation Modal */}
      <AlertDialog open={!!confirmSide} onOpenChange={(open) => { if (!open) setConfirmSide(null); }}>
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center text-lg">Confirm Trade</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                {/* Trade Summary Card */}
                <div className={`rounded-xl border p-4 ${
                  confirmSide === "up"
                    ? "border-green-500/30 bg-green-500/5"
                    : "border-destructive/30 bg-destructive/5"
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {confirmSide === "up"
                        ? <TrendingUp className="w-5 h-5 text-green-500" />
                        : <TrendingDown className="w-5 h-5 text-destructive" />
                      }
                      <span className={`text-base font-bold ${confirmSide === "up" ? "text-green-500" : "text-destructive"}`}>
                        {confirmSide?.toUpperCase()}
                      </span>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-md">
                      {asset || "—"}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5" /> Amount
                      </span>
                      <span className="font-bold text-foreground">${Number(betAmount).toFixed(2)}</span>
                    </div>
                    {currentPrice != null && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Entry Price</span>
                        <span className="font-semibold text-foreground">
                          ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                        </span>
                      </div>
                    )}
                    {timeframeLabel && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" /> Timeframe
                        </span>
                        <span className="font-semibold text-foreground">{timeframeLabel}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Warning */}
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-200/80">
                    This trade is final and cannot be cancelled once placed. Your balance will be deducted immediately.
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 sm:flex-row">
            <AlertDialogCancel className="flex-1 mt-0">Cancel</AlertDialogCancel>
            <Button
              onClick={handleConfirmTrade}
              disabled={placing}
              className={`flex-1 font-bold ${
                confirmSide === "up"
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-red-600 hover:bg-red-700 text-white"
              }`}
            >
              {placing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {confirmSide === "up" ? <ArrowUp className="w-4 h-4 mr-1.5" /> : <ArrowDown className="w-4 h-4 mr-1.5" />}
              Confirm {confirmSide?.toUpperCase()}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
