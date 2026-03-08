import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUp, ArrowDown, Loader2 } from "lucide-react";

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
}

export default function QuickTradeBetControls({
  userBet, betAmount, setBetAmount, placing, isLocked, timeLeft,
  qtMinBet, qtMaxBet, onPlaceBet, amountPresets,
}: QuickTradeBetControlsProps) {
  if (userBet) {
    return (
      <div className={`rounded-2xl border p-4 mb-4 text-center ${
        userBet.side === "up" ? "border-green-500/30 bg-green-500/5" : "border-destructive/30 bg-destructive/5"
      }`}>
        <p className="text-sm font-semibold text-foreground mb-1">
          Your bet: <span className={userBet.side === "up" ? "text-green-500" : "text-destructive"}>
            {userBet.side.toUpperCase()}
          </span> — ${Number(userBet.amount).toFixed(2)}
        </p>
        <p className="text-xs text-muted-foreground">Waiting for round to resolve...</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 mb-4">
      <div className="mb-3">
        <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Amount ($)</label>
        <Input
          type="number"
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
          min={String(qtMinBet)}
          max={String(qtMaxBet)}
          step="1"
          className="text-lg font-bold text-center"
          disabled={isLocked || timeLeft === 0}
        />
        <div className="flex gap-2 mt-2">
          {amountPresets.map((p) => (
            <button
              key={p}
              onClick={() => setBetAmount(String(p))}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
            >
              ${p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          onClick={() => onPlaceBet("up")}
          disabled={placing || isLocked || timeLeft === 0}
          className="h-14 text-lg font-bold bg-green-600 hover:bg-green-700 text-white rounded-xl shadow-[0_0_20px_hsl(142_71%_45%/0.3)]"
        >
          <ArrowUp className="w-5 h-5 mr-2" />
          UP
        </Button>
        <Button
          onClick={() => onPlaceBet("down")}
          disabled={placing || isLocked || timeLeft === 0}
          className="h-14 text-lg font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-[0_0_20px_hsl(0_84%_60%/0.3)]"
        >
          <ArrowDown className="w-5 h-5 mr-2" />
          DOWN
        </Button>
      </div>

      {placing && (
        <div className="flex items-center justify-center gap-2 mt-3">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Placing bet...</span>
        </div>
      )}
    </div>
  );
}
