import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

type TickerBet = {
  id: string;
  side: "up" | "down";
  amount: number;
  ts: number;
};

interface Props {
  roundId: string | undefined;
  className?: string;
  max?: number;
}

const MAX_DEFAULT = 8;

const LiveBetsTicker = ({ roundId, className, max = MAX_DEFAULT }: Props) => {
  const [bets, setBets] = useState<TickerBet[]>([]);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!roundId) {
      setBets([]);
      seenRef.current = new Set();
      return;
    }

    let cancelled = false;
    seenRef.current = new Set();

    const loadInitial = async () => {
      const { data } = await supabase
        .from("quick_bets")
        .select("id, side, amount, created_at")
        .eq("round_id", roundId)
        .order("created_at", { ascending: false })
        .limit(max);
      if (cancelled || !data) return;
      const initial: TickerBet[] = data.map((b: any) => ({
        id: b.id,
        side: b.side,
        amount: Number(b.amount),
        ts: new Date(b.created_at).getTime(),
      }));
      initial.forEach((b) => seenRef.current.add(b.id));
      setBets(initial);
    };
    loadInitial();

    const channel = supabase
      .channel(`ticker-${roundId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "quick_bets", filter: `round_id=eq.${roundId}` },
        (payload) => {
          const row: any = payload.new;
          if (!row || seenRef.current.has(row.id)) return;
          seenRef.current.add(row.id);
          setBets((prev) => [
            { id: row.id, side: row.side, amount: Number(row.amount), ts: Date.now() },
            ...prev,
          ].slice(0, max));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [roundId, max]);

  if (!roundId || bets.length === 0) {
    return (
      <div className={cn("text-[11px] text-muted-foreground/60 px-1 py-1", className)}>
        Waiting for first bet…
      </div>
    );
  }

  const fmt = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(n < 10 ? 2 : 0)}`;

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-md border border-border/40 bg-muted/20 px-2 py-1.5",
        className,
      )}
      aria-label="Live bets ticker"
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Live bets
        </span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
        {bets.map((b, i) => (
          <div
            key={b.id}
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium tabular-nums whitespace-nowrap shrink-0 transition-all",
              b.side === "up"
                ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20",
              i === 0 && "animate-in fade-in slide-in-from-left-2 duration-300",
            )}
          >
            {b.side === "up" ? (
              <TrendingUp className="h-2.5 w-2.5" />
            ) : (
              <TrendingDown className="h-2.5 w-2.5" />
            )}
            {fmt(b.amount)}
          </div>
        ))}
      </div>
    </div>
  );
};

export default LiveBetsTicker;
