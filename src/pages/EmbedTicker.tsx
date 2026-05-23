import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp } from "lucide-react";

interface TickerMarket {
  id: string;
  title: string;
  yes_price: number;
  category: string;
}

const EmbedTicker = () => {
  const [markets, setMarkets] = useState<TickerMarket[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const limit = Math.min(parseInt(params.get("limit") || "10"), 20);

    supabase
      .from("markets")
      .select("id, title, yes_price, category")
      .eq("status", "active")
      .eq("trending", true)
      .order("volume", { ascending: false })
      .limit(limit)
      .then(({ data }) => {
        if (data) setMarkets(data);
      });
  }, []);

  if (markets.length === 0) return null;

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0a0a0f] text-white flex items-center">
      <div className="flex animate-ticker whitespace-nowrap gap-6 px-4">
        {[...markets, ...markets].map((m, i) => (
          <a
            key={`${m.id}-${i}`}
            href={`https://opoll.org/market/${m.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 shrink-0 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <span className="text-[10px] uppercase tracking-wider text-gray-500">{m.category}</span>
            <span className="text-xs font-medium truncate max-w-[180px]">{m.title}</span>
            <span className={`text-xs font-bold ${m.yes_price >= 0.5 ? "text-emerald-400" : "text-rose-400"}`}>
              {Math.round(m.yes_price * 100)}¢
            </span>
          </a>
        ))}
      </div>

      {/* Branding */}
      <div className="absolute right-3 flex items-center gap-1 opacity-40">
        <TrendingUp className="w-3 h-3 text-blue-400" />
        <span className="text-[9px] text-gray-500 font-medium">OPollmarket</span>
      </div>

      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker {
          animation: ticker 30s linear infinite;
        }
        .animate-ticker:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
};

export default EmbedTicker;
