import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface PendingCopyTrade {
  id: string;
  user_id: string;
  trader_user_id: string;
  trade_type: string;
  market_id: string | null;
  option_id: string | null;
  side: string | null;
  amount: number;
  price: number | null;
  shares: number | null;
  status: string;
  expires_at: string;
  created_at: string;
  trader_name?: string;
  market_title?: string;
}

export const usePendingCopyTrades = () => {
  const { user } = useAuth();
  const [trades, setTrades] = useState<PendingCopyTrade[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTrades = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("pending_copy_trades" as any)
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (!data) { setTrades([]); return; }

    // Enrich with trader names and market titles
    const enriched: PendingCopyTrade[] = [];
    for (const row of data as any[]) {
      let trader_name = "A trader";
      let market_title = "";

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", row.trader_user_id)
        .single();
      if (profile?.display_name) trader_name = profile.display_name;

      if (row.market_id) {
        const { data: market } = await supabase
          .from("markets")
          .select("title")
          .eq("id", row.market_id)
          .single();
        if (market?.title) market_title = market.title;
      }

      enriched.push({ ...row, trader_name, market_title });
    }

    // Filter out expired client-side
    const now = new Date();
    setTrades(enriched.filter(t => new Date(t.expires_at) > now));
  }, [user]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("pending-copy-trades")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pending_copy_trades", filter: `user_id=eq.${user.id}` },
        () => { fetchTrades(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchTrades]);

  const respondToTrade = useCallback(async (tradeId: string, action: "accept" | "reject") => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("approve-copy-trade", {
        body: { pending_trade_id: tradeId, action },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(action === "accept" ? "Trade copied successfully! 📋" : "Copy trade rejected");
      setTrades(prev => prev.filter(t => t.id !== tradeId));
    } catch (err: any) {
      toast.error(err.message || "Failed to process trade");
    } finally {
      setLoading(false);
    }
  }, [user]);

  return { trades, loading, respondToTrade, refetch: fetchTrades };
};
