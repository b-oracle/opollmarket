import { ExternalLink } from "lucide-react";

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

interface StoryContentRendererProps {
  content: string;
  variant: "overlay" | "caption";
}

const StoryContentRenderer = ({ content, variant }: StoryContentRendererProps) => {
  const parts = content.split(URL_REGEX);
  const textParts: string[] = [];
  const urls: string[] = [];

  parts.forEach((part) => {
    if (URL_REGEX.test(part)) {
      urls.push(part);
    } else {
      textParts.push(part);
    }
    // Reset regex lastIndex
    URL_REGEX.lastIndex = 0;
  });

  const combinedText = textParts.join("").trim();

  const isOverlay = variant === "overlay";

  const handleLinkClick = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const formatUrl = (url: string) => {
    try {
      const u = new URL(url);
      const host = u.hostname.replace("www.", "");
      const path = u.pathname + u.search;
      const display = path.length > 20 ? host : host + path;
      return display.length > 30 ? display.slice(0, 28) + "…" : display;
    } catch {
      return url.length > 30 ? url.slice(0, 28) + "…" : url;
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {combinedText && (
        <p
          className={
            isOverlay
              ? "text-white text-center text-lg font-bold max-w-sm break-words"
              : "text-foreground text-sm font-semibold text-center leading-relaxed break-words"
          }
          style={isOverlay ? { textShadow: "0 2px 8px rgba(0,0,0,0.7)" } : undefined}
        >
          {combinedText}
        </p>
      )}

      {urls.map((url, i) => (
        <button
          key={i}
          onClick={(e) => handleLinkClick(e, url)}
          className="relative z-20 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-white/15 backdrop-blur-md border border-white/20 hover:bg-white/25 active:scale-95 transition-all max-w-[280px] w-full"
        >
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
            <ExternalLink className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[10px] text-white/50 font-medium">Open Link</p>
            <p className="text-xs text-white font-semibold truncate">{formatUrl(url)}</p>
          </div>
          <span className="text-white/40 text-xs shrink-0">↗</span>
        </button>
      ))}
    </div>
  );
};

export default StoryContentRenderer;
