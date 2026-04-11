import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Pencil, TrendingUp } from "lucide-react";
import { optimizedImageUrl } from "@/lib/optimizedImage";
import MarketTagSelector, { type MarketTag } from "./MarketTagSelector";

interface TaggedMarketsCarouselProps {
  spaceId: string;
  taggedMarketIds: string[];
  isHost: boolean;
  isCoHost?: boolean;
  onMinimize?: () => void;
}

const TaggedMarketsCarousel = ({ spaceId, taggedMarketIds, isHost, isCoHost = false, onMinimize }: TaggedMarketsCarouselProps) => {
  const canEdit = isHost || isCoHost;
  const navigate = useNavigate();
  const [markets, setMarkets] = useState<MarketTag[]>([]);
  const [editing, setEditing] = useState(false);
  const [editMarkets, setEditMarkets] = useState<MarketTag[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!taggedMarketIds || taggedMarketIds.length === 0) {
      setMarkets([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("markets")
        .select("id, title, yes_price, image_url")
        .in("id", taggedMarketIds);
      if (data) {
        setMarkets(data.map((m) => ({ id: m.id, title: m.title, yes_price: m.yes_price, image_url: m.image_url })));
      }
    })();
  }, [taggedMarketIds]);

  if (markets.length === 0 && !editing && !canEdit) return null;

  if (markets.length === 0 && !editing && canEdit) {
    return (
      <div className="px-5 py-2 border-b border-border">
        <button
          onClick={() => { setEditMarkets([]); setEditing(true); }}
          className="flex items-center gap-1.5 text-[10px] text-primary font-semibold hover:text-primary/80 transition-colors"
        >
          <TrendingUp className="w-3 h-3" /> + Tag Markets
        </button>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    await supabase
      .from("spaces" as any)
      .update({ tagged_market_ids: editMarkets.map((m) => m.id) } as any)
      .eq("id", spaceId);
    setMarkets(editMarkets);
    setEditing(false);
    setSaving(false);
  };

  if (editing) {
    return (
      <div className="px-5 py-3 border-b border-border space-y-2">
        <MarketTagSelector selected={editMarkets} onChange={setEditMarkets} max={10} />
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving}
            className="text-xs font-semibold text-primary px-3 py-1 rounded-lg bg-primary/10 disabled:opacity-40">
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={() => setEditing(false)}
            className="text-xs text-muted-foreground px-3 py-1">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-2 border-b border-border">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
          <TrendingUp className="w-3 h-3" /> Tagged Markets
        </span>
        {canEdit && (
          <button onClick={() => { setEditMarkets(markets); setEditing(true); }}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
            <Pencil className="w-3 h-3" /> Edit
          </button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-1">
        {markets.map((m) => (
          <button
            key={m.id}
            onClick={() => { onMinimize?.(); navigate(`/market/${m.id}`); }}
            className="snap-start shrink-0 w-[200px] flex items-center gap-2 bg-muted/50 border border-border rounded-xl p-2 hover:bg-muted/80 transition-colors"
          >
            {m.image_url ? (
              <img
                src={optimizedImageUrl(m.image_url, "thumb")}
                alt=""
                className="w-10 h-10 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <TrendingUp className="w-4 h-4 text-primary" />
              </div>
            )}
            <div className="min-w-0 flex-1 text-left">
              <p className="text-[10px] font-semibold leading-tight truncate">{m.title}</p>
              <p className="text-[10px] text-primary font-bold mt-0.5">
                {Math.round(m.yes_price * 100)}% Yes
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default TaggedMarketsCarousel;
