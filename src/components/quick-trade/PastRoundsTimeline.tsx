import { useRef, useEffect } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";

type Round = {
  id: string;
  asset: string;
  open_price: number | null;
  close_price: number | null;
  result: string | null;
  created_at: string;
  resolved_at: string | null;
};

interface PastRoundsTimelineProps {
  rounds: Round[];
}

export default function PastRoundsTimeline({ rounds }: PastRoundsTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to newest (rightmost)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [rounds.length]);

  if (rounds.length === 0) return null;

  const resolved = rounds
    .filter((r) => r.result && r.open_price && r.close_price)
    .slice(0, 12);

  if (resolved.length === 0) return null;

  return (
    <div className="mb-3">
      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
        Recent Rounds
      </p>
      <div
        ref={scrollRef}
        className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1"
      >
        {resolved.map((r) => {
          const isUp = r.result === "up";
          const delta =
            r.open_price && r.close_price
              ? ((Number(r.close_price) - Number(r.open_price)) /
                  Number(r.open_price)) *
                100
              : null;
          const time = new Date(
            r.resolved_at || r.created_at
          ).toLocaleTimeString("en", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });

          return (
            <div
              key={r.id}
              className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors ${
                isUp
                  ? "border-green-500/25 bg-green-500/5"
                  : "border-destructive/25 bg-destructive/5"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center ${
                  isUp ? "bg-green-500/20" : "bg-destructive/20"
                }`}
              >
                {isUp ? (
                  <ArrowUp className="w-3 h-3 text-green-500" />
                ) : (
                  <ArrowDown className="w-3 h-3 text-destructive" />
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-muted-foreground leading-tight">
                  {time}
                </span>
                {delta !== null && (
                  <span
                    className={`text-[10px] font-bold leading-tight ${
                      isUp ? "text-green-500" : "text-destructive"
                    }`}
                  >
                    {isUp ? "+" : ""}
                    {delta.toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
