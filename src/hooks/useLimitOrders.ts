import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

interface LimitOrder {
  id: string;
  user_id: string;
  market_id: string;
  option_id: string | null;
  side: string;
  order_type: string;
  limit_price: number;
  amount: number;
  shares: number;
  status: string;
  created_at: string;
  updated_at: string;
}

/** Fetch pending limit orders for a market (public, for order book) */
export const useLimitOrders = (marketId?: string) => {
  return useQuery({
    queryKey: ["limit-orders", marketId],
    queryFn: async () => {
      if (!marketId) return [];
      const { data } = await supabase
        .from("public_orderbook" as any)
        .select("id, market_id, option_id, side, order_type, limit_price, amount, shares, status, created_at")
        .eq("market_id", marketId)
        .order("limit_price", { ascending: false });
      return (data || []) as LimitOrder[];
    },
    enabled: !!marketId,
    refetchInterval: 10000,
  });
};

/** Fetch current user's limit orders (all statuses) */
export const useUserLimitOrders = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user-limit-orders", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("limit_orders")
        .select("*, markets(title, yes_price, no_price)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return (data || []) as (LimitOrder & { markets: { title: string; yes_price: number; no_price: number } | null })[];
    },
    enabled: !!user,
  });
};

/** Place a limit order via edge function — escrows balance server-side */
export const usePlaceLimitOrder = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      marketId,
      optionId,
      side,
      amount,
      limitPrice,
      shares,
    }: {
      marketId: string;
      optionId?: string;
      side: string;
      amount: number;
      limitPrice: number;
      shares: number;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("place-limit-order", {
        body: { marketId, optionId, side, amount, limitPrice, shares },
      });

      if (error) {
        const msg = typeof data === "object" && data?.error ? data.error : error.message || "Failed to place limit order";
        throw new Error(msg);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["limit-orders"] });
      queryClient.invalidateQueries({ queryKey: ["user-limit-orders"] });
      toast.success("Limit order placed!");
    },
  });
};

/** Cancel a pending limit order via edge function — refunds server-side */
export const useCancelLimitOrder = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (orderId: string) => {
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("cancel-limit-order", {
        body: { orderId },
      });

      if (error) {
        const msg = typeof data === "object" && data?.error ? data.error : error.message || "Failed to cancel order";
        throw new Error(msg);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["limit-orders"] });
      queryClient.invalidateQueries({ queryKey: ["user-limit-orders"] });
      toast.success("Order cancelled, funds refunded!");
    },
  });
};
