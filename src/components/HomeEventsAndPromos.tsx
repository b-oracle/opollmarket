import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, Sparkles, ArrowRight, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const HERO_ROTATE_MS = 6000;

type Banner = {
  id: string;
  kind: "hero" | "featured";
  title: string;
  subtitle: string | null;
  image_url: string | null;
  cta_text: string | null;
  target_type: "market" | "event";
  target_id: string;
};

type EventRow = {
  id: string;
  slug: string;
  title: string;
  image_url: string | null;
  members: Array<{
    market_id: string;
    display_label: string | null;
    color: string | null;
    sort_order: number;
    market: { id: string; title: string; yes_price: number; status: string } | null;
  }>;
};

const trackImpression = (id: string) => {
  // best-effort, fire-and-forget
  supabase.rpc as any;
  supabase
    .from("promo_banners" as any)
    .select("impressions")
    .eq("id", id)
    .maybeSingle()
    .then(({ data }: any) => {
      if (data) {
        supabase
          .from("promo_banners" as any)
          .update({ impressions: (data.impressions || 0) + 1 })
          .eq("id", id)
          .then(() => {});
      }
    });
};

const trackClick = (id: string) => {
  supabase
    .from("promo_banners" as any)
    .select("clicks")
    .eq("id", id)
    .maybeSingle()
    .then(({ data }: any) => {
      if (data) {
        supabase
          .from("promo_banners" as any)
          .update({ clicks: (data.clicks || 0) + 1 })
          .eq("id", id)
          .then(() => {});
      }
    });
};

const HomeEventsAndPromos = () => {
  const navigate = useNavigate();

  // -------- Banners ----------
  const { data: banners = [] } = useQuery({
    queryKey: ["promo-banners"],
    queryFn: async () => {
      const { data } = await supabase
        .from("promo_banners" as any)
        .select("id, kind, title, subtitle, image_url, cta_text, target_type, target_id, sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(20);
      return (data || []) as unknown as Banner[];
    },
    staleTime: 60_000,
  });

  const heroBanners = banners.filter((b) => b.kind === "hero");
  const featuredBanners = banners.filter((b) => b.kind === "featured");

  const [heroIdx, setHeroIdx] = useState(0);
  useEffect(() => {
    if (heroBanners.length <= 1) return;
    const t = setInterval(() => setHeroIdx((i) => (i + 1) % heroBanners.length), HERO_ROTATE_MS);
    return () => clearInterval(t);
  }, [heroBanners.length]);

  const trackedImpressions = useRef(new Set<string>());
  useEffect(() => {
    const current = heroBanners[heroIdx];
    if (current && !trackedImpressions.current.has(current.id)) {
      trackedImpressions.current.add(current.id);
      trackImpression(current.id);
    }
  }, [heroIdx, heroBanners]);
  useEffect(() => {
    featuredBanners.forEach((b) => {
      if (!trackedImpressions.current.has(b.id)) {
        trackedImpressions.current.add(b.id);
        trackImpression(b.id);
      }
    });
  }, [featuredBanners]);

  const goToBanner = (b: Banner) => {
    trackClick(b.id);
    if (b.target_type === "event") {
      // look up slug
      supabase
        .from("market_events" as any)
        .select("slug")
        .eq("id", b.target_id)
        .maybeSingle()
        .then(({ data }: any) => {
          if (data?.slug) navigate(`/event/${data.slug}`);
        });
    } else {
      navigate(`/market/${b.target_id}`);
    }
  };

  // -------- Events ----------
  const { data: events = [] } = useQuery({
    queryKey: ["home-events"],
    queryFn: async () => {
      const { data: ev } = await supabase
        .from("market_events" as any)
        .select("id, slug, title, image_url, status, end_date")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(8);
      const eventList = (ev || []) as any[];
      if (eventList.length === 0) return [] as EventRow[];

      const { data: mems } = await supabase
        .from("market_event_members" as any)
        .select(
          "event_id, market_id, display_label, color, sort_order, market:markets!inner(id, title, yes_price, status)"
        )
        .in(
          "event_id",
          eventList.map((e: any) => e.id)
        )
        .order("sort_order", { ascending: true });

      const byEvent = new Map<string, any[]>();
      (mems || []).forEach((m: any) => {
        if (!byEvent.has(m.event_id)) byEvent.set(m.event_id, []);
        byEvent.get(m.event_id)!.push(m);
      });

      return eventList.map((e: any) => ({
        id: e.id,
        slug: e.slug,
        title: e.title,
        image_url: e.image_url,
        members: byEvent.get(e.id) || [],
      })) as EventRow[];
    },
    staleTime: 60_000,
  });

  const hasHero = heroBanners.length > 0;
  const hasFeatured = featuredBanners.length > 0;
  const hasEvents = false; // events row disabled on home for cleaner layout

  if (!hasHero && !hasFeatured && !hasEvents) return null;

  return (
    <div className="space-y-6 mb-6">
      {/* HERO BANNER */}
      {hasHero && (
        <div className="relative rounded-2xl overflow-hidden border border-primary/20 aspect-[16/7] sm:aspect-[16/5]">
          <AnimatePresence mode="wait">
            {heroBanners.map((b, i) =>
              i === heroIdx ? (
                <motion.button
                  key={b.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6 }}
                  onClick={() => goToBanner(b)}
                  className="absolute inset-0 w-full h-full text-left"
                >
                  {b.image_url ? (
                    <img src={b.image_url} alt={b.title} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-primary/10 to-background" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Megaphone className="w-3 h-3 text-primary" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Featured</span>
                    </div>
                    <h2 className="text-lg sm:text-2xl font-bold leading-tight line-clamp-2">{b.title}</h2>
                    {b.subtitle && (
                      <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2">{b.subtitle}</p>
                    )}
                    <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      {b.cta_text || "View"} <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </motion.button>
              ) : null
            )}
          </AnimatePresence>
          {heroBanners.length > 1 && (
            <div className="absolute top-3 right-3 flex items-center gap-1">
              {heroBanners.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setHeroIdx(i)}
                  className={`rounded-full transition-all ${
                    i === heroIdx ? "w-4 h-1.5 bg-primary" : "w-1.5 h-1.5 bg-white/40"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* EVENTS ROW */}
      {hasEvents && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-primary" /> Event Groups
            </h3>
            <button
              onClick={() => navigate("/events")}
              className="text-xs text-primary font-semibold flex items-center gap-0.5 hover:underline"
            >
              See all <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 snap-x snap-mandatory scrollbar-hide">
            {events.map((ev) => {
              const topMembers = ev.members
                .filter((m) => m.market)
                .sort((a, b) => (b.market!.yes_price || 0) - (a.market!.yes_price || 0))
                .slice(0, 3);
              return (
                <motion.button
                  key={ev.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => navigate(`/event/${ev.slug}`)}
                  className="snap-start shrink-0 w-[280px] glass rounded-2xl overflow-hidden text-left border border-primary/15 hover:border-primary/40 transition-all active:scale-[0.98]"
                >
                  <div className="relative h-28 bg-secondary overflow-hidden">
                    {ev.image_url ? (
                      <img src={ev.image_url} alt={ev.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Layers className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-card/90 to-transparent" />
                    <div className="absolute top-2 left-2 glass rounded-full px-2 py-0.5 flex items-center gap-1">
                      <Layers className="w-3 h-3 text-primary" />
                      <span className="text-[10px] font-bold text-primary">{ev.members.length} outcomes</span>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <h4 className="text-sm font-bold leading-snug line-clamp-2">{ev.title}</h4>
                    <div className="space-y-1">
                      {topMembers.map((m) => (
                        <div key={m.market_id} className="flex items-center justify-between gap-2 text-[11px]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ background: m.color || "hsl(var(--primary))" }}
                            />
                            <span className="truncate text-muted-foreground">
                              {m.display_label || m.market!.title}
                            </span>
                          </div>
                          <span className="font-semibold tabular-nums shrink-0">
                            {Math.round((m.market!.yes_price || 0) * 100)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {/* FEATURED STRIP */}
      {hasFeatured && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" /> Featured Picks
          </h3>
          <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 snap-x snap-mandatory scrollbar-hide">
            {featuredBanners.map((b) => (
              <motion.button
                key={b.id}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => goToBanner(b)}
                className="snap-start shrink-0 w-[260px] rounded-2xl overflow-hidden border border-primary/20 text-left active:scale-[0.97] transition-all"
              >
                <div className="relative h-32 bg-secondary">
                  {b.image_url ? (
                    <img src={b.image_url} alt={b.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/20 to-background" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-card/95 to-transparent" />
                  <div className="absolute top-2 left-2 glass rounded-full px-2 py-0.5 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-primary" />
                    <span className="text-[10px] font-bold text-primary">Featured</span>
                  </div>
                </div>
                <div className="p-3 bg-card">
                  <p className="text-sm font-bold line-clamp-2">{b.title}</p>
                  {b.subtitle && (
                    <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{b.subtitle}</p>
                  )}
                  <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                    {b.cta_text || "View"} <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeEventsAndPromos;
