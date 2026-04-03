import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Radio } from "lucide-react";

interface ChatLinkPreviewProps {
  url: string;
  onClick: () => void;
}

function parseLink(url: string): { type: "market" | "space"; id: string } | null {
  const marketMatch = url.match(/\/market\/([a-f0-9-]+)/i);
  if (marketMatch) return { type: "market", id: marketMatch[1] };
  const spaceMatch = url.match(/\/spaces\/([a-f0-9-]+)/i);
  if (spaceMatch) return { type: "space", id: spaceMatch[1] };
  return null;
}

const ChatLinkPreview = ({ url, onClick }: ChatLinkPreviewProps) => {
  const parsed = parseLink(url);

  const { data } = useQuery({
    queryKey: ["chat-link-preview", parsed?.type, parsed?.id],
    queryFn: async () => {
      if (!parsed) return null;
      if (parsed.type === "market") {
        const { data } = await supabase
          .from("markets")
          .select("id, title, category, yes_price, image_url, status")
          .eq("id", parsed.id)
          .maybeSingle();
        return data ? { type: "market" as const, ...data } : null;
      }
      const { data } = await supabase
        .from("spaces")
        .select("id, title, status, host_id, listener_count")
        .eq("id", parsed.id)
        .maybeSingle();
      return data ? { type: "space" as const, ...data } : null;
    },
    enabled: !!parsed,
    staleTime: 60_000,
  });

  if (!data) return null;

  if (data.type === "market") {
    return (
      <button
        onClick={onClick}
        className="w-full flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-3 text-left hover:bg-accent/50 transition-colors"
      >
        {data.image_url ? (
          <img src={data.image_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-primary">{data.category}</p>
          <p className="text-sm font-semibold text-foreground truncate">{data.title}</p>
          <p className="text-xs text-muted-foreground">
            {data.status === "resolved" ? "Resolved" : `Yes ${Math.round((data.yes_price ?? 0) * 100)}¢`}
          </p>
        </div>
      </button>
    );
  }

  const isLive = data.status === "live";
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-3 text-left hover:bg-accent/50 transition-colors"
    >
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${isLive ? "bg-red-500/10" : "bg-primary/10"}`}>
        <Radio className={`w-5 h-5 ${isLive ? "text-red-500" : "text-primary"}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {isLive && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
          <p className="text-xs font-medium text-primary">{isLive ? "Live Space" : "Space"}</p>
        </div>
        <p className="text-sm font-semibold text-foreground truncate">{data.title}</p>
        {isLive && (
          <p className="text-xs text-muted-foreground">{data.listener_count} listening</p>
        )}
      </div>
    </button>
  );
};

export default ChatLinkPreview;
