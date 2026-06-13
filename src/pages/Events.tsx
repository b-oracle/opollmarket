import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Layers, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import SEOHead from "@/components/SEOHead";
import { motion } from "framer-motion";

const Events = () => {
  const navigate = useNavigate();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["events-page"],
    queryFn: async () => {
      const { data: ev } = await supabase
        .from("market_events" as any)
        .select("id, slug, title, description, image_url, category, end_date, status, volume")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      const list = (ev || []) as any[];
      if (list.length === 0) return [];
      const { data: mems } = await supabase
        .from("market_event_members" as any)
        .select(
          "event_id, market_id, display_label, color, sort_order, market:markets!inner(id, title, yes_price)"
        )
        .in("event_id", list.map((e: any) => e.id))
        .order("sort_order", { ascending: true });
      const byEvent = new Map<string, any[]>();
      (mems || []).forEach((m: any) => {
        if (!byEvent.has(m.event_id)) byEvent.set(m.event_id, []);
        byEvent.get(m.event_id)!.push(m);
      });
      return list.map((e: any) => ({ ...e, members: byEvent.get(e.id) || [] }));
    },
  });

  return (
    <div className="min-h-dvh bg-background pb-24">
      <SEOHead title="Event Groups" description="Explore grouped prediction markets" />
      <TopBar />
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">Event Groups</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Grouped markets — bet on individual outcomes while seeing the whole event at a glance.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">No event groups yet</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {events.map((ev: any) => {
              const top = (ev.members as any[])
                .filter((m) => m.market)
                .sort((a, b) => (b.market.yes_price || 0) - (a.market.yes_price || 0))
                .slice(0, 4);
              return (
                <motion.button
                  key={ev.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => navigate(`/event/${ev.slug}`)}
                  className="glass rounded-2xl overflow-hidden border border-border hover:border-primary/40 transition-all text-left active:scale-[0.98]"
                >
                  <div className="relative h-32 bg-secondary">
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
                      <span className="text-[10px] font-bold text-primary">
                        {ev.members.length} outcomes
                      </span>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <h3 className="text-sm font-bold leading-snug line-clamp-2">{ev.title}</h3>
                    <div className="space-y-1">
                      {top.map((m: any) => (
                        <div key={m.market_id} className="flex items-center justify-between gap-2 text-[11px]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ background: m.color || "hsl(var(--primary))" }}
                            />
                            <span className="truncate text-muted-foreground">
                              {m.display_label || m.market.title}
                            </span>
                          </div>
                          <span className="font-semibold tabular-nums">
                            {Math.round((m.market.yes_price || 0) * 100)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
};

export default Events;
