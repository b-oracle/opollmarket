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
        .from("limit_orders")
        .select("*")
        .eq("market_id", marketId)
        .eq("status", "pending")
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

/** Place a limit order — escrows balance */
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

      // Check balance
      const { data: balData } = await supabase
        .from("balances")
        .select("amount, bonus_balance")
        .eq("user_id", user.id)
        .eq("currency", "USDT")
        .single();

      const currentBalance = Number(balData?.amount || 0);
      const currentBonus = Number(balData?.bonus_balance || 0);
      const totalAvailable = currentBalance + currentBonus;

      if (totalAvailable < amount) throw new Error("Insufficient balance");

      // Deduct (escrow) — bonus first, then main
      const bonusDeduct = Math.min(currentBonus, amount);
      const mainDeduct = amount - bonusDeduct;

      const { error: balError } = await supabase
        .from("balances")
        .update({
          amount: currentBalance - mainDeduct,
          bonus_balance: currentBonus - bonusDeduct,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .eq("currency", "USDT");
      if (balError) throw balError;

      // Insert limit order
      const { error: orderError } = await supabase.from("limit_orders").insert({
        user_id: user.id,
        market_id: marketId,
        option_id: optionId || null,
        side,
        order_type: "limit",
        limit_price: limitPrice,
        amount,
        shares,
        status: "pending",
      });
      if (orderError) throw orderError;

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

/** Cancel a pending limit order — refunds escrowed balance */
export const useCancelLimitOrder = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (orderId: string) => {
      if (!user) throw new Error("Not authenticated");

      // Get order details
      const { data: order, error: fetchErr } = await supabase
        .from("limit_orders")
        .select("*")
        .eq("id", orderId)
        .eq("user_id", user.id)
        .eq("status", "pending")
        .single();

      if (fetchErr || !order) throw new Error("Order not found or already filled");

      // Cancel the order
      const { error: updateErr } = await supabase
        .from("limit_orders")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", orderId)
        .eq("user_id", user.id);
      if (updateErr) throw updateErr;

      // Refund balance
      const { data: balData } = await supabase
        .from("balances")
        .select("amount")
        .eq("user_id", user.id)
        .eq("currency", "USDT")
        .single();

      const currentBalance = Number(balData?.amount || 0);
      const { error: balErr } = await supabase
        .from("balances")
        .update({
          amount: currentBalance + Number(order.amount),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .eq("currency", "USDT");
      if (balErr) throw balErr;

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
