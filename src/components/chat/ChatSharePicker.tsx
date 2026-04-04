import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Search, TrendingUp, Radio } from "lucide-react";
import { Input } from "@/components/ui/input";
import BottomSheet from "@/components/BottomSheet";

interface ChatSharePickerProps {
  open: boolean;
  onClose: () => void;
  onShare: (text: string) => void;
}

const ChatSharePicker = ({ open, onClose, onShare }: ChatSharePickerProps) => {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"markets" | "spaces">("markets");

  const { data: markets = [] } = useQuery({
    queryKey: ["share-picker-markets", search],
    queryFn: async () => {
      let q = supabase
        .from("markets")
        .select("id, title, category, yes_price, image_url")
        .eq("status", "active")
        .eq("is_hidden", false)
        .order("volume", { ascending: false })
        .limit(20);
      if (search) q = q.ilike("title", `%${search}%`);
      const { data } = await q;
      return data || [];
    },
    enabled: open && tab === "markets",
  });

  const { data: spaces = [] } = useQuery({
    queryKey: ["share-picker-spaces"],
    queryFn: async () => {
      const { data } = await supabase
        .from("spaces")
        .select("id, title, status, listener_count")
        .in("status", ["live", "scheduled"])
        .order("started_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: open && tab === "spaces",
  });

  const handleShareMarket = (id: string, title: string) => {
    const url = `${window.location.origin}/market/${id}`;
    onShare(url);
    onClose();
  };

  const handleShareSpace = (id: string, title: string) => {
    const url = `${window.location.origin}/spaces/${id}`;
    onShare(url);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="70dvh">
      <div className="p-4 space-y-3">
        <h3 className="text-base font-semibold text-foreground">Share in Chat</h3>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setTab("markets")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "markets" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            <TrendingUp className="w-4 h-4 inline mr-1" />
            Markets
          </button>
          <button
            onClick={() => setTab("spaces")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "spaces" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            <Radio className="w-4 h-4 inline mr-1" />
            Spaces
          </button>
        </div>

        {/* Search (markets only) */}
        {tab === "markets" && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search markets..."
              className="pl-9 h-9 rounded-full"
            />
          </div>
        )}

        {/* List */}
        <div className="max-h-[40dvh] overflow-y-auto space-y-1">
          {tab === "markets" &&
            markets.map((m: any) => (
              <button
                key={m.id}
                onClick={() => handleShareMarket(m.id, m.title)}
                className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors text-left"
              >
                {m.image_url ? (
                  <img src={m.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{m.title}</p>
                  <p className="text-xs text-muted-foreground">{m.category} • Yes {Math.round((m.yes_price ?? 0) * 100)}¢</p>
                </div>
              </button>
            ))}
          {tab === "spaces" &&
            spaces.map((s: any) => {
              const isLive = s.status === "live";
              return (
                <button
                  key={s.id}
                  onClick={() => handleShareSpace(s.id, s.title)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors text-left"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isLive ? "bg-red-500/10" : "bg-primary/10"}`}>
                    <Radio className={`w-4 h-4 ${isLive ? "text-red-500" : "text-primary"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{s.title}</p>
                    <div className="flex items-center gap-1.5">
                      {isLive && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                      <p className="text-xs text-muted-foreground">
                        {isLive ? `Live • ${s.listener_count} listening` : "Scheduled"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          {tab === "markets" && markets.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No markets found</p>
          )}
          {tab === "spaces" && spaces.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No active spaces</p>
          )}
        </div>
      </div>
    </BottomSheet>
  );
};

export default ChatSharePicker;
