import { useQuery } from "@tanstack/react-query";
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
  trending: boolean;
  status: string;
  market_options: { id: string; label: string; price: number; sort_order: number }[];
}

const mapDbToMarket = (db: DbMarket): Market => ({
  id: db.id,
  title: db.title,
  description: db.description,
  category: db.category,
  marketType: db.market_type as Market["marketType"],
  yesPrice: Number(db.yes_price),
  noPrice: Number(db.no_price),
  volume: Number(db.volume),
  liquidity: Number(db.liquidity),
  participants: db.participants,
  endDate: db.end_date,
  creatorAddress: db.creator_wallet,
  creatorName: db.creator_name,
  imageUrl: db.image_url || "",
  trending: db.trending,
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
  return useQuery({
    queryKey: ["markets"],
    queryFn: async (): Promise<Market[]> => {
      const { data, error } = await supabase
        .from("markets")
        .select("*, market_options!market_options_market_id_fkey(*)")
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data as unknown as DbMarket[]).map(mapDbToMarket);
    },
    staleTime: 30_000,
  });
};

export const useMarket = (id: string | undefined) => {
  return useQuery({
    queryKey: ["market", id],
    queryFn: async (): Promise<Market | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("markets")
        .select("*, market_options!market_options_market_id_fkey(*)")
        .eq("id", id)
        .single();

      if (error) return null;
      return mapDbToMarket(data as unknown as DbMarket);
    },
    enabled: !!id,
  });
};
