import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ActiveBoost {
  market_id: string;
  tier: string;
  ends_at: string;
}

const tierRank: Record<string, number> = { flash: 1, standard: 2, whale: 3 };

const fetchBoosts = async (): Promise<ActiveBoost[]> => {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("market_boosts")
    .select("market_id, tier, ends_at")
    .eq("status", "active")
    .gte("ends_at", now);

  if (error || !data) return [];
  return data;
};

export const useActiveBoosts = () => {
  const { data: rawBoosts = [], isLoading: loading } = useQuery({
    queryKey: ["active-boosts"],
    queryFn: fetchBoosts,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const { boostedMarketIds, boostDetails } = useMemo(() => {
    const ids = new Set(rawBoosts.map((b) => b.market_id));
    const details = new Map<string, ActiveBoost>();
    rawBoosts.forEach((b) => {
      const existing = details.get(b.market_id);
      if (!existing || (tierRank[b.tier] || 0) > (tierRank[existing.tier] || 0)) {
        details.set(b.market_id, b);
      }
    });
    return { boostedMarketIds: ids, boostDetails: details };
  }, [rawBoosts]);

  return { boostedMarketIds, boostDetails, loading };
};
