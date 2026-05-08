import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createStatelessReadClient } from "@/lib/statelessSupabase";
import type { Market } from "@/data/markets";

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
  is_hidden: boolean;
  resolved_side: string | null;
  winning_option_id: string | null;
  stream_url: string | null;
  is_streaming: boolean;
}

const withTimeout = async <T>(operation: () => Promise<T>, ms: number, timeoutMessage: string): Promise<T> => {
  return Promise.race([
    operation(),
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), ms);
    }),
  ]);
};

const isTimeoutError = (error: unknown) =>
  error instanceof Error && error.message.toLowerCase().includes("timeout");

const publicReadClient = createStatelessReadClient();

export const mapDbToMarket = (db: DbMarket): Market => ({
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
  isHidden: db.is_hidden,
  resolvedSide: db.resolved_side || undefined,
  winningOptionId: db.winning_option_id || undefined,
  streamUrl: db.stream_url || undefined,
  isStreaming: db.is_streaming ?? false,
  isCryptoRound: (db as any).is_crypto_round ?? false,
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

const fetchMarkets = async (client: typeof supabase) => {
  return withTimeout(
    async () =>
      await client
        .from("markets")
        .select(SELECT_COLS)
        .in("status", ["active", "ended"])
        .eq("is_hidden", false)
        .or("participants.gt.0,is_crypto_round.eq.true")
        .order("created_at", { ascending: false })
        .limit(100),
    8_000,
    "markets query timeout"
  );
};

const fetchMarketDetail = async (client: typeof supabase, id: string) => {
  return withTimeout(
    async () =>
      await client
        .from("markets")
        .select("*, market_options!market_options_market_id_fkey(*)")
        .eq("id", id)
        .maybeSingle(),
    8_000,
    "market detail query timeout"
  );
};

const SELECT_COLS = "id,title,description,category,market_type,yes_price,no_price,volume,liquidity,participants,end_date,creator_wallet,creator_name,image_url,video_url,details,trending,status,created_at,auto_resolve,auto_resolve_asset,auto_resolve_target_price,auto_resolve_operator,auto_resolve_deadline,sport_type,sport_match_id,sport_predicted_outcome,sport_league,polymarket_event_slug,twitter_metric_type,twitter_resource_id,twitter_current_count,simulated_volume,simulated_participants,is_hidden,resolved_side,winning_option_id,stream_url,is_streaming,is_crypto_round, market_options!market_options_market_id_fkey(id,label,price,sort_order)";

const fetchCreatorMarkets = async (client: typeof supabase, userId: string) => {
  return withTimeout(
    async () =>
      await client
        .from("markets")
        .select(SELECT_COLS)
        .eq("creator_wallet", userId)
        .in("status", ["active", "ended"])
        .eq("participants", 0)
        .order("created_at", { ascending: false })
        .limit(20),
    8_000,
    "creator markets query timeout"
  );
};

export const useMarkets = () => {
  const queryClient = useQueryClient();

  const shouldRetry = (failureCount: number, error: unknown) => {
    if (isTimeoutError(error)) return false;
    return failureCount < 2;
  };

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
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ["markets"],
    queryFn: async (): Promise<Market[]> => {
      console.log("[useMarkets] queryFn called");
      try {
        const { data, error } = await fetchMarkets(supabase);
        if (error) throw error;
        const publicMarkets = (data as unknown as DbMarket[]).map(mapDbToMarket);

        // Also fetch creator's own 0-participant markets so they can see them
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          try {
            const { data: creatorData } = await fetchCreatorMarkets(supabase, session.user.id);
            if (creatorData && creatorData.length > 0) {
              const existingIds = new Set(publicMarkets.map((m) => m.id));
              const creatorOnly = (creatorData as unknown as DbMarket[])
                .map(mapDbToMarket)
                .filter((m) => !existingIds.has(m.id));
              return [...creatorOnly, ...publicMarkets];
            }
          } catch {
            // Non-critical — just return public markets
          }
        }

        return publicMarkets;
      } catch (primaryError) {
        if (!isTimeoutError(primaryError)) {
          console.error("[useMarkets] primary client error:", primaryError);
          throw primaryError;
        }

        console.warn("[useMarkets] primary client timeout, retrying with stateless public client");
        const { data: fallbackData, error: fallbackError } = await fetchMarkets(publicReadClient as typeof supabase);
        if (fallbackError) {
          console.error("[useMarkets] fallback client error:", fallbackError);
          throw fallbackError;
        }

        return (fallbackData as unknown as DbMarket[]).map(mapDbToMarket);
      }
    },
    staleTime: 30_000,
    retry: shouldRetry,
    retryDelay: 1000,
  });
};

export const useMarket = (id: string | undefined) => {
  const queryClient = useQueryClient();

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
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  return useQuery({
    queryKey: ["market", id],
    queryFn: async (): Promise<Market | null> => {
      if (!id) return null;
      console.log("[useMarket] queryFn called for id:", id);

      try {
        const { data, error } = await fetchMarketDetail(supabase, id);
        if (error) throw error;
        if (!data) return null;
        return mapDbToMarket(data as unknown as DbMarket);
      } catch (primaryError) {
        if (!isTimeoutError(primaryError)) {
          console.error("[useMarket] primary client error:", primaryError);
          throw primaryError;
        }

        console.warn("[useMarket] primary client timeout, retrying with stateless public client", id);
        const { data: fallbackData, error: fallbackError } = await fetchMarketDetail(publicReadClient as typeof supabase, id);

        if (fallbackError) {
          console.error("[useMarket] fallback client error:", fallbackError);
          throw fallbackError;
        }
        if (!fallbackData) return null;

        return mapDbToMarket(fallbackData as unknown as DbMarket);
      }
    },
    enabled: !!id,
    retry: (failureCount, error) => {
      if (isTimeoutError(error)) return false;
      return failureCount < 3;
    },
  });
};
