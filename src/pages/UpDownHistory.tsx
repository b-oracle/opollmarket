import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowUp, ArrowDown, Repeat, TrendingUp, TrendingDown, Clock, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";

type Tab = "open" | "settled";

interface PositionRow {
  id: string;
  market_id: string;
  side: string;
  shares: number;
  avg_price: number;
  created_at: string;
  markets: {
    id: string;
    title: string;
    status: string;
    yes_price: number;
    no_price: number;
    resolved_side: string | null;
    end_date: string;
    is_crypto_round: boolean;
    crypto_round_meta: {
      asset: string;
      duration_minutes: number;
      open_price: number;
      close_price: number | null;
      end_time: string;
    } | null;
  } | null;
}

const fmtMoney = (v: number) => {
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
};

const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

const fmtDuration = (m: number) => {
  if (m >= 1440) return `${Math.round(m / 1440)}d`;
  if (m >= 60) return `${Math.round(m / 60)}h`;
  return `${m}m`;
};

const fmtTimeAgo = (date: string) => {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const UpDownHistory = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("open");

  const { data: positions = [], isLoading } = useQuery({
    queryKey: ["up-down-positions", user?.id],
    queryFn: async (): Promise<PositionRow[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("positions")
        .select(`
          id, market_id, side, shares, avg_price, created_at,
          markets!inner (
            id, title, status, yes_price, no_price, resolved_side, end_date, is_crypto_round,
            crypto_round_meta ( asset, duration_minutes, open_price, close_price, end_time )
          )
        `)
        .eq("user_id", user.id)
        .eq("markets.is_crypto_round", true)
        .gt("shares", 0)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any) || [];
    },
    enabled: !!user,
    staleTime: 15_000,
  });

  const enriched = useMemo(() => {
    return positions
      .filter((p) => p.markets)
      .map((p) => {
        const m = p.markets!;
        const isYes = p.side === "yes";
        const currentPrice = isYes ? m.yes_price : m.no_price;
        const cost = p.shares * p.avg_price;
        const isResolved = m.status === "resolved";
        const isCancelled = m.status === "cancelled";

        let value: number;
        let realized = false;
        if (isResolved) {
          realized = true;
          value = m.resolved_side === p.side ? p.shares : 0;
        } else if (isCancelled) {
          realized = true;
          value = cost; // assume refund
        } else {
          value = p.shares * currentPrice;
        }

        const pnl = value - cost;
        const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
        return { ...p, currentPrice, cost, value, pnl, pnlPct, realized, isCancelled };
      });
  }, [positions]);

  const open = enriched.filter((p) => !p.realized);
  const settled = enriched.filter((p) => p.realized);

  const summary = useMemo(() => {
    const list = tab === "open" ? open : settled;
    const cost = list.reduce((s, p) => s + p.cost, 0);
    const value = list.reduce((s, p) => s + p.value, 0);
    const pnl = value - cost;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    const wins = settled.filter((p) => !p.isCancelled && p.pnl > 0).length;
    const losses = settled.filter((p) => !p.isCancelled && p.pnl <= 0).length;
    return { cost, value, pnl, pnlPct, count: list.length, wins, losses };
  }, [tab, open, settled]);

  const list = tab === "open" ? open : settled;

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="max-w-lg mx-auto px-4 pb-28" style={{ paddingTop: "calc(var(--content-top) + 0.75rem)" }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full glass flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold leading-tight">Up/Down History</h1>
            <p className="text-[11px] text-muted-foreground">Bets, positions and PnL</p>
          </div>
          <motion.button
            onClick={async () => {
              await qc.invalidateQueries({ queryKey: ["up-down-positions", user?.id] });
              toast.success("Refreshed");
            }}
            whileTap={{ rotate: 360 }}
            transition={{ duration: 0.5 }}
            className="w-8 h-8 rounded-full glass flex items-center justify-center"
          >
            <Repeat className="w-4 h-4 text-muted-foreground" />
          </motion.button>
        </div>

        {/* Summary card */}
        <div className="rounded-2xl border border-border/60 bg-card/60 p-4 mb-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            {tab === "open" ? "Unrealized PnL" : "Realized PnL"}
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className={`text-3xl font-bold ${summary.pnl >= 0 ? "text-primary" : "text-destructive"}`}>
                {fmtMoney(summary.pnl)}
              </div>
              <div className={`text-xs font-semibold ${summary.pnl >= 0 ? "text-primary" : "text-destructive"}`}>
                {fmtPct(summary.pnlPct)}
              </div>
            </div>
            <div className="text-right text-[11px] text-muted-foreground space-y-0.5">
              <div>Cost: <span className="font-semibold text-foreground">{fmtMoney(summary.cost)}</span></div>
              <div>Value: <span className="font-semibold text-foreground">{fmtMoney(summary.value)}</span></div>
              {tab === "settled" && (
                <div>
                  <span className="text-primary font-semibold">{summary.wins}W</span>
                  {" / "}
                  <span className="text-destructive font-semibold">{summary.losses}L</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {(["open", "settled"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${
                tab === t ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground"
              }`}
            >
              {t} ({t === "open" ? open.length : settled.length})
            </button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="text-center py-12 text-sm text-muted-foreground">Loading…</div>
        ) : list.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            No {tab} Up/Down positions yet.
          </div>
        ) : (
          <div className="space-y-2">
            {list.map((p) => {
              const m = p.markets!;
              const meta = m.crypto_round_meta;
              const isYes = p.side === "yes";
              return (
                <button
                  key={p.id}
                  onClick={() => navigate(p.realized ? `/up-down/receipt/${m.id}` : `/market/${m.id}`)}
                  className="w-full text-left rounded-xl border border-border/50 bg-card/40 p-3 active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          isYes ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
                        }`}
                      >
                        {isYes ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {meta ? `${meta.asset} ${fmtDuration(meta.duration_minutes)}` : m.title}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                          <span className="font-semibold">{isYes ? "UP" : "DOWN"}</span>
                          <span>·</span>
                          <span>{p.shares.toFixed(2)} sh</span>
                          <span>·</span>
                          <span>@ {(p.avg_price * 100).toFixed(0)}¢</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-sm font-bold ${p.pnl >= 0 ? "text-primary" : "text-destructive"}`}>
                        {fmtMoney(p.pnl)}
                      </div>
                      <div className={`text-[10px] font-semibold ${p.pnl >= 0 ? "text-primary" : "text-destructive"}`}>
                        {fmtPct(p.pnlPct)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-2">
                      {p.realized ? (
                        p.isCancelled ? (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <XCircle className="w-3 h-3" /> Cancelled
                          </span>
                        ) : m.resolved_side === p.side ? (
                          <span className="flex items-center gap-1 text-primary font-semibold">
                            <CheckCircle2 className="w-3 h-3" /> Won
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-destructive font-semibold">
                            <XCircle className="w-3 h-3" /> Lost
                          </span>
                        )
                      ) : (
                        <span className="flex items-center gap-1">
                          {p.pnl >= 0 ? (
                            <TrendingUp className="w-3 h-3 text-primary" />
                          ) : (
                            <TrendingDown className="w-3 h-3 text-destructive" />
                          )}
                          Mark {(p.currentPrice * 100).toFixed(0)}¢
                        </span>
                      )}
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {fmtTimeAgo(p.created_at)}
                      </span>
                    </div>
                    {meta?.open_price != null && (
                      <span>
                        {meta.open_price.toFixed(2)}
                        {meta.close_price != null && ` → ${meta.close_price.toFixed(2)}`}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
};

export default UpDownHistory;
