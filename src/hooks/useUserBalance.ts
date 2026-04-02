import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export const useUserBalance = () => {
  const { user } = useAuth();

  const { data: balanceData = { amount: 0, bonus: 0, insurance: 0, gift: 0, rewards: 0 }, isLoading } = useQuery({
    queryKey: ["balance", user?.id],
    queryFn: async () => {
      if (!user) return { amount: 0, bonus: 0, insurance: 0, gift: 0, rewards: 0 };
      const { data, error } = await supabase
        .from("balances")
        .select("amount, bonus_balance, insurance_balance, gift_balance, rewards_balance")
        .eq("user_id", user.id)
        .eq("currency", "USDT")
        .maybeSingle();
      if (error || !data) return { amount: 0, bonus: 0, insurance: 0, gift: 0, rewards: 0 };
      return {
        amount: Number(data.amount),
        bonus: Number(data.bonus_balance ?? 0),
        insurance: Number((data as any).insurance_balance ?? 0),
        gift: Number((data as any).gift_balance ?? 0),
        rewards: Number((data as any).rewards_balance ?? 0),
      };
    },
    enabled: !!user,
  });

  return {
    balance: balanceData.amount,
    bonusBalance: balanceData.bonus,
    insuranceBalance: balanceData.insurance,
    giftBalance: balanceData.gift,
    rewardsBalance: balanceData.rewards,
    totalBalance: balanceData.amount + balanceData.bonus,
    totalWithInsurance: balanceData.amount + balanceData.bonus + balanceData.insurance,
    isLoading,
    userId: user?.id,
  };
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
      insuranceTier,
    }: {
      marketId: string;
      optionId?: string;
      side: string;
      amount: number;
      price: number;
      shares: number;
      insuranceTier?: number;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("place-bet", {
        body: { marketId, optionId, side, amount, price, shares, insuranceTier },
      });

      if (error) {
        // Try to parse error message from response
        const msg = typeof data === "object" && data?.error ? data.error : error.message || "Failed to place bet";
        throw new Error(msg);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return { success: true };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["markets"] });
      queryClient.invalidateQueries({ queryKey: ["referral_rewards"] });
      queryClient.invalidateQueries({ queryKey: ["bonus_balance"] });
      queryClient.invalidateQueries({ queryKey: ["price-history"] });
      queryClient.invalidateQueries({ queryKey: ["orderbook-trades"] });
      queryClient.invalidateQueries({ queryKey: ["limit-orders"] });
    },
  });
};
