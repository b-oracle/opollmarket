import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ActiveBoost {
  market_id: string;
  tier: string;
  ends_at: string;
}

export const useActiveBoosts = () => {
  const [boostedMarketIds, setBoostedMarketIds] = useState<Set<string>>(new Set());
  const [boostDetails, setBoostDetails] = useState<Map<string, ActiveBoost>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchBoosts = async () => {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("market_boosts")
      .select("market_id, tier, ends_at")
      .eq("status", "active")
      .gte("ends_at", now);

    if (!error && data) {
      const ids = new Set(data.map((b) => b.market_id));
      const details = new Map<string, ActiveBoost>();
      // Keep highest tier per market
      const tierRank: Record<string, number> = { flash: 1, standard: 2, whale: 3 };
      data.forEach((b) => {
        const existing = details.get(b.market_id);
        if (!existing || (tierRank[b.tier] || 0) > (tierRank[existing.tier] || 0)) {
          details.set(b.market_id, b);
        }
      });
      setBoostedMarketIds(ids);
      setBoostDetails(details);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBoosts();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("market_boosts_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "market_boosts" },
        () => fetchBoosts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { boostedMarketIds, boostDetails, loading };
};
