import { usePendingCopyTrades } from "@/hooks/usePendingCopyTrades";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { useEffect, useState } from "react";
import { Check, X, Clock, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import BottomSheet from "@/components/BottomSheet";

const PendingCopyTrades = () => {
  const { trades, loading, respondToTrade } = usePendingCopyTrades();
  const { isFeatureEnabled } = useFeatureToggles();
  const [open, setOpen] = useState(false);

  // Auto-open when new pending trades arrive
  useEffect(() => {
    if (trades.length > 0) setOpen(true);
  }, [trades.length]);

  if (!isFeatureEnabled("copy_trading") || trades.length === 0) return null;

  return (
    <>
      {/* Floating badge trigger */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-50 bg-primary text-primary-foreground rounded-full p-3 shadow-lg animate-pulse md:bottom-6 md:right-6"
        aria-label="Pending copy trades"
      >
        <Copy className="w-5 h-5" />
        <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
          {trades.length}
        </span>
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} maxHeight="70dvh">
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Copy className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-bold">Pending Copy Trades</h3>
            <Badge variant="secondary">{trades.length}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Approve or reject trades before they expire (2 min window).
          </p>

          <div className="space-y-3 max-h-[50dvh] overflow-y-auto">
            {trades.map((trade) => (
              <PendingTradeCard
                key={trade.id}
                trade={trade}
                loading={loading}
                onAccept={() => respondToTrade(trade.id, "accept")}
                onReject={() => respondToTrade(trade.id, "reject")}
              />
            ))}
          </div>
        </div>
      </BottomSheet>
    </>
  );
};

function PendingTradeCard({
  trade,
  loading,
  onAccept,
  onReject,
}: {
  trade: any;
  loading: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const tick = () => {
      const diff = new Date(trade.expires_at).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft("Expired"); return; }
      const s = Math.floor(diff / 1000);
      setTimeLeft(`${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`);
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [trade.expires_at]);

  const isExpired = timeLeft === "Expired";

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="font-semibold text-sm">{trade.trader_name}'s Trade</p>
          <p className="text-xs text-muted-foreground">
            {trade.trade_type === "quick_trade" ? "Quick Trade" : "Prediction"}
            {trade.market_title && ` — ${trade.market_title}`}
          </p>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span className={isExpired ? "text-destructive font-bold" : ""}>{timeLeft}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant="outline" className="uppercase">{trade.side}</Badge>
        <span className="font-bold text-primary">${Number(trade.amount).toFixed(2)}</span>
      </div>

      {!isExpired && (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 gap-1"
            onClick={onAccept}
            disabled={loading}
          >
            <Check className="w-4 h-4" /> Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1"
            onClick={onReject}
            disabled={loading}
          >
            <X className="w-4 h-4" /> Reject
          </Button>
        </div>
      )}
    </div>
  );
}

export default PendingCopyTrades;
