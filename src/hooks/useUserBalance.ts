import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export const useUserBalance = () => {
  const { user } = useAuth();

  const { data: balance = 0, isLoading } = useQuery({
    queryKey: ["balance", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { data, error } = await supabase
        .from("balances")
        .select("amount")
        .eq("user_id", user.id)
        .eq("currency", "USDT")
        .single();
      if (error) return 0;
      return Number(data.amount);
    },
    enabled: !!user,
  });

  return { balance, isLoading, userId: user?.id };
};

export const usePlaceBet = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      marketId,
      optionId,
      side,
      amount,
      price,
      shares,
    }: {
      marketId: string;
      optionId?: string;
      side: string;
      amount: number;
      price: number;
      shares: number;
    }) => {
      if (!user) throw new Error("Not authenticated");

      // Check balance
      const { data: balData } = await supabase
        .from("balances")
        .select("amount")
        .eq("user_id", user.id)
        .eq("currency", "USDT")
        .single();

      const currentBalance = Number(balData?.amount || 0);
      const totalCost = amount * 1.02; // 2% fee
      if (currentBalance < totalCost) throw new Error("Insufficient balance");

      // Deduct balance
      const { error: balError } = await supabase
        .from("balances")
        .update({ amount: currentBalance - totalCost, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("currency", "USDT");
      if (balError) throw balError;

      // Insert position
      const { error: posError } = await supabase.from("positions").insert({
        user_id: user.id,
        market_id: marketId,
        option_id: optionId || null,
        side,
        shares,
        avg_price: price / 100,
      });
      if (posError) throw posError;

      // Insert transaction
      const { error: txError } = await supabase.from("transactions").insert({
        user_id: user.id,
        type: "buy",
        amount: totalCost,
        market_id: marketId,
        option_id: optionId || null,
        side,
        shares,
        price: price / 100,
        status: "confirmed",
      });
      if (txError) throw txError;

      // Update market volume & participants
      await supabase.rpc("has_role", { _user_id: user.id, _role: "user" }); // dummy call; we update via direct update
      // Actually update the market stats
      const { data: mkt } = await supabase
        .from("markets")
        .select("volume, participants")
        .eq("id", marketId)
        .single();
      if (mkt) {
        await supabase
          .from("markets")
          .update({
            volume: Number(mkt.volume) + amount,
            participants: mkt.participants + 1,
          })
          .eq("id", marketId);
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["markets"] });
    },
  });
};
