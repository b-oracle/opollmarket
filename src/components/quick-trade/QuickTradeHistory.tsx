import { useState } from "react";
import { ArrowUp, ArrowDown, History } from "lucide-react";

type Round = {
  id: string;
  asset: string;
  open_price: number | null;
  close_price: number | null;
  result: string | null;
  created_at: string;
  resolved_at: string | null;
};

type Bet = {
  id: string;
  side: string;
  amount: number;
  payout: number;
  status: string;
  round_id: string;
  streak: number;
};

interface QuickTradeHistoryProps {
  recentRounds: Round[];
  userBets: Bet[];
  selectedAssetSymbol: string;
  historyPage: number;
  historyTotal: number;
  historyPerPage: number;
  onPageChange: (page: number) => void;
}

export default function QuickTradeHistory({
  recentRounds, userBets, selectedAssetSymbol,
  historyPage, historyTotal, historyPerPage, onPageChange,
}: QuickTradeHistoryProps) {
  const [tab, setTab] = useState<"yours" | "all">(userBets.length > 0 ? "yours" : "all");

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
          <History className="w-4 h-4 text-muted-foreground" />
          Results History
        </h3>
        <div className="flex items-center gap-1">
          {recentRounds.slice(0, 8).map((r) => (
            <div
              key={r.id}
              className={`w-2.5 h-2.5 rounded-full ${
                r.result === "up" ? "bg-green-500" : r.result === "down" ? "bg-destructive" : "bg-muted-foreground/40"
              }`}
              title={`${r.result?.toUpperCase() || "FLAT"}`}
            />
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-3 p-0.5 rounded-lg bg-muted/50">
        <button
          onClick={() => setTab("yours")}
          className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-colors ${
            tab === "yours" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Your Trades
        </button>
        <button
          onClick={() => setTab("all")}
          className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition-colors ${
            tab === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          All Rounds
        </button>
      </div>

      {/* Your Trades tab */}
      {tab === "yours" && (
        userBets.length > 0 ? (
          <div className="space-y-2">
            {userBets.map((b) => {
              const round = recentRounds.find((r) => r.id === b.round_id);
              const won = b.status === "won";
              const lost = b.status === "lost";
              const pnl = won ? Number(b.payout) - Number(b.amount) : lost ? -Number(b.amount) : 0;
              const priceDelta = round?.open_price && round?.close_price
                ? ((Number(round.close_price) - Number(round.open_price)) / Number(round.open_price) * 100)
                : null;

              return (
                <div key={b.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      won ? "bg-green-500/15" : lost ? "bg-destructive/15" : "bg-muted"
                    }`}>
                      {b.side === "up" ? (
                        <ArrowUp className={`w-4 h-4 ${won ? "text-green-500" : "text-destructive"}`} />
                      ) : (
                        <ArrowDown className={`w-4 h-4 ${won ? "text-green-500" : "text-destructive"}`} />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        {b.side.toUpperCase()} · ${Number(b.amount).toFixed(2)}
                        {b.streak > 1 && <span className="ml-1 text-amber-500">🔥{b.streak}</span>}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {round?.asset || selectedAssetSymbol}
                        {priceDelta !== null && (
                          <span className={priceDelta >= 0 ? "text-green-500 ml-1" : "text-destructive ml-1"}>
                            {priceDelta >= 0 ? "+" : ""}{priceDelta.toFixed(2)}%
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-bold ${won ? "text-green-500" : lost ? "text-destructive" : "text-muted-foreground"}`}>
                      {won ? `+$${pnl.toFixed(2)}` : lost ? `-$${Number(b.amount).toFixed(2)}` : "Pending"}
                    </p>
                    {won && b.payout && (
                      <p className="text-[10px] text-muted-foreground">
                        Payout: ${Number(b.payout).toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">No trades yet</p>
        )
      )}

      {/* All Rounds tab */}
      {tab === "all" && (
        recentRounds.length > 0 ? (
          <div className="space-y-2">
            {recentRounds.map((r) => {
              const priceDelta = r.open_price && r.close_price
                ? ((Number(r.close_price) - Number(r.open_price)) / Number(r.open_price) * 100)
                : null;
              return (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      r.result === "up" ? "bg-green-500/15" : r.result === "down" ? "bg-destructive/15" : "bg-muted"
                    }`}>
                      {r.result === "up" ? (
                        <ArrowUp className="w-4 h-4 text-green-500" />
                      ) : (
                        <ArrowDown className="w-4 h-4 text-destructive" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        {r.result?.toUpperCase() || "—"} · {r.asset}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(r.resolved_at || r.created_at).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", hour12: true })}
                        {priceDelta !== null && (
                          <span className={priceDelta >= 0 ? "text-green-500 ml-1" : "text-destructive ml-1"}>
                            {priceDelta >= 0 ? "+" : ""}{priceDelta.toFixed(2)}%
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">
                      ${Number(r.open_price || 0).toLocaleString()} → ${Number(r.close_price || 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">No rounds resolved yet</p>
        )
      )}

      {tab === "all" && historyTotal > historyPerPage && (
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50">
          <button
            onClick={() => onPageChange(Math.max(0, historyPage - 1))}
            disabled={historyPage === 0}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-[10px] text-muted-foreground">
            {historyPage + 1} / {Math.ceil(historyTotal / historyPerPage)}
          </span>
          <button
            onClick={() => onPageChange(historyPage + 1)}
            disabled={(historyPage + 1) * historyPerPage >= historyTotal}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
