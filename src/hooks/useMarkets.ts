import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Market, MarketOption } from "@/data/markets";

interface DbMarket {
  id: string;
  title: string;
  description: string;
  category: string;
  market_type: string;
  yes_price: number;
  no_price: number;
  volume: number;
  liquidity: number;
  participants: number;
  end_date: string;
  creator_wallet: string;
  creator_name: string;
  image_url: string | null;
  video_url: string | null;
  details: string | null;
  trending: boolean;
  status: string;
  created_at: string;
  auto_resolve: boolean;
  auto_resolve_asset: string | null;
  auto_resolve_target_price: number | null;
  auto_resolve_operator: string | null;
  auto_resolve_deadline: string | null;
  sport_type: string | null;
  sport_match_id: string | null;
  sport_predicted_outcome: string | null;
  sport_league: string | null;
  market_options: { id: string; label: string; price: number; sort_order: number }[];
  polymarket_event_slug: string | null;
  twitter_metric_type: string | null;
  twitter_resource_id: string | null;
  twitter_current_count: number | null;
}

const mapDbToMarket = (db: DbMarket): Market => ({
  id: db.id,
  title: db.title,
  description: db.description,
  category: db.category,
  marketType: db.market_type as Market["marketType"],
  yesPrice: Number(db.yes_price),
  noPrice: Number(db.no_price),
  volume: Number(db.volume) + Number((db as any).simulated_volume || 0),
  liquidity: Number(db.liquidity),
  participants: db.participants + ((db as any).simulated_participants || 0),
  endDate: db.end_date,
  creatorAddress: db.creator_wallet,
  creatorName: db.creator_name,
  imageUrl: db.image_url || "",
  videoUrl: db.video_url || undefined,
  details: db.details || undefined,
  trending: db.trending,
  createdAt: db.created_at,
  autoResolve: db.auto_resolve,
  autoResolveAsset: db.auto_resolve_asset || undefined,
  autoResolveTargetPrice: db.auto_resolve_target_price ? Number(db.auto_resolve_target_price) : undefined,
  autoResolveOperator: db.auto_resolve_operator || undefined,
  autoResolveDeadline: db.auto_resolve_deadline || undefined,
  sportType: db.sport_type || undefined,
  sportMatchId: db.sport_match_id || undefined,
  sportPredictedOutcome: db.sport_predicted_outcome || undefined,
  sportLeague: db.sport_league || undefined,
  polymarketEventSlug: db.polymarket_event_slug || undefined,
  twitterMetricType: db.twitter_metric_type || undefined,
  twitterResourceId: db.twitter_resource_id || undefined,
  twitterCurrentCount: db.twitter_current_count ?? 0,
  status: db.status,
  options: db.market_options?.length
    ? db.market_options
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((o) => ({
          id: o.id,
          label: o.label,
          price: Number(o.price),
          sortOrder: o.sort_order,
        }))
    : undefined,
});

export const useMarkets = () => {
  const queryClient = useQueryClient();

  // Realtime: refresh market list when any market is updated
  useEffect(() => {
    const channel = supabase
      .channel("markets-list-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "markets" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["markets"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return useQuery({
    queryKey: ["markets"],
    queryFn: async (): Promise<Market[]> => {
      const { data, error } = await supabase
        .from("markets")
        .select("*, market_options!market_options_market_id_fkey(*)")
        .in("status", ["active", "ended"])
        .gt("participants", 0)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data as unknown as DbMarket[]).map(mapDbToMarket);
    },
    staleTime: 30_000,
    retry: 2,
    retryDelay: 1000,
  });
};

export const useMarket = (id: string | undefined) => {
  const queryClient = useQueryClient();

  // Realtime: refresh this market when it's updated
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`market-detail-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "markets", filter: `id=eq.${id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["market", id] });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "market_options", filter: `market_id=eq.${id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["market", id] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, queryClient]);

    return useQuery({
    queryKey: ["market", id],
    queryFn: async (): Promise<Market | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("markets")
        .select("*, market_options!market_options_market_id_fkey(*)")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error; // let react-query retry on network errors
      if (!data) return null;
      return mapDbToMarket(data as unknown as DbMarket);
    },
    enabled: !!id,
    retry: 3,
  });
};
