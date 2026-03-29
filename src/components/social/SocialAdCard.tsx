import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Megaphone, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef } from "react";
import YouTubeEmbed, { isYouTubeUrl } from "@/components/YouTubeEmbed";

interface SocialAdCardProps {
  ad: {
    id: string;
    market_id: string;
    headline?: string | null;
    video_url?: string | null;
    impressions: number;
    clicks: number;
  };
  market?: {
    id: string;
    title: string;
    image_url?: string | null;
    yes_price: number;
    no_price: number;
    status?: string;
  } | null;
  index?: number;
}

const SocialAdCard = ({ ad, market, index = 0 }: SocialAdCardProps) => {
  const navigate = useNavigate();
  const impressionTracked = useRef(false);

  // Track impression once on mount
  useEffect(() => {
    if (impressionTracked.current) return;
    impressionTracked.current = true;
    supabase
      .from("social_ads")
      .update({ impressions: ad.impressions + 1 })
      .eq("id", ad.id)
      .then(() => {});
  }, [ad.id]);

  const handleClick = () => {
    // Track click
    supabase
      .from("social_ads")
      .update({ clicks: ad.clicks + 1 })
      .eq("id", ad.id)
      .then(() => {});
    if (market) navigate(`/market/${market.id}`);
  };

  const hasVideo = ad.video_url && isYouTubeUrl(ad.video_url);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="glass rounded-xl p-3 space-y-2 border border-primary/10"
    >
      {/* Sponsored badge */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Megaphone className="w-3 h-3" />
        <span className="font-semibold uppercase tracking-wider">Sponsored</span>
      </div>

      {/* Headline */}
      {ad.headline && (
        <p className="text-sm font-medium">{ad.headline}</p>
      )}

      {/* YouTube video */}
      {hasVideo && (
        <div className="rounded-lg overflow-hidden aspect-video">
          <YouTubeEmbed url={ad.video_url!} className="w-full h-full rounded-lg" />
        </div>
      )}

      {/* Market preview card */}
      {market && (
        <div
          onClick={handleClick}
          className="rounded-lg border border-border overflow-hidden cursor-pointer hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2 p-2">
            {market.image_url && !hasVideo && (
              <img src={market.image_url} alt="" className="w-12 h-12 rounded object-cover shrink-0" loading="lazy" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold line-clamp-2">{market.title}</p>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                <span className="text-emerald-500">Yes {Math.round(market.yes_price * 100)}¢</span>
                <span className="text-rose-500">No {Math.round(market.no_price * 100)}¢</span>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={handleClick}
        className="w-full py-2 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center justify-center gap-1.5"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        View Market
      </button>
    </motion.div>
  );
};

export default SocialAdCard;
