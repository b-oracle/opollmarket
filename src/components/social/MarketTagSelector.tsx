import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, Search, TrendingUp } from "lucide-react";

interface MarketTag {
  id: string;
  title: string;
  yes_price: number;
  image_url: string | null;
}

interface MarketTagSelectorProps {
  selected: MarketTag[];
  onChange: (markets: MarketTag[]) => void;
  max?: number;
  categoryFilter?: string;
}

const MarketTagSelector = ({ selected, onChange, max = 5, categoryFilter }: MarketTagSelectorProps) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MarketTag[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from("markets")
        .select("id, title, yes_price, image_url")
        .ilike("title", `%${query.trim()}%`)
        .eq("status", "active")
        .limit(10);
      setResults(
        (data || [])
          .filter((m) => !selected.some((s) => s.id === m.id))
          .map((m) => ({ id: m.id, title: m.title, yes_price: m.yes_price, image_url: m.image_url }))
      );
      setSearching(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, selected]);

  const addMarket = (m: MarketTag) => {
    if (selected.length >= max) return;
    onChange([...selected, m]);
    setQuery("");
    setResults([]);
  };

  const removeMarket = (id: string) => {
    onChange(selected.filter((m) => m.id !== id));
  };

  return (
    <div className="space-y-2">
      <label className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
        <TrendingUp className="w-3 h-3 shrink-0" /> Tag Markets ({selected.length}/{max})
      </label>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((m) => (
            <span key={m.id} className="flex items-center gap-1.5 bg-primary/10 text-primary text-[10px] font-medium px-2 py-1 rounded-full">
              {m.image_url ? (
                <img src={m.image_url} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" />
              ) : (
                <TrendingUp className="w-3 h-3 shrink-0" />
              )}
              {m.title.length > 25 ? m.title.slice(0, 25) + "…" : m.title}
              <button onClick={() => removeMarket(m.id)} className="hover:text-destructive">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      {selected.length < max && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search markets to tag…"
            className="w-full bg-muted/50 border border-border rounded-lg pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
          />
          {results.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-background border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto z-10">
              {results.map((m) => (
                <button
                  key={m.id}
                  onClick={() => addMarket(m)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex items-center gap-2"
                >
                  {m.image_url ? (
                    <img src={m.image_url} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
                  ) : (
                    <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center shrink-0">
                      <TrendingUp className="w-3 h-3 text-primary" />
                    </div>
                  )}
                  <span className="truncate flex-1">{m.title}</span>
                  <span className="shrink-0 text-[10px] text-primary font-semibold">
                    {Math.round(m.yes_price * 100)}%
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MarketTagSelector;
export type { MarketTag };
