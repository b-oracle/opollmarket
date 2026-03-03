import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export const useUserBalance = () => {
  const { user } = useAuth();

  const { data: balanceData = { amount: 0, bonus: 0 }, isLoading } = useQuery({
    queryKey: ["balance", user?.id],
    queryFn: async () => {
      if (!user) return { amount: 0, bonus: 0 };
      const { data, error } = await supabase
        .from("balances")
        .select("amount, bonus_balance")
        .eq("user_id", user.id)
        .eq("currency", "USDT")
        .single();
      if (error) return { amount: 0, bonus: 0 };
      return { amount: Number(data.amount), bonus: Number(data.bonus_balance ?? 0) };
    },
    enabled: !!user,
  });

  return {
    balance: balanceData.amount,
    bonusBalance: balanceData.bonus,
    totalBalance: balanceData.amount + balanceData.bonus,
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
    }: {
      marketId: string;
      optionId?: string;
      side: string;
      amount: number;
      price: number;
      shares: number;
    }) => {
      if (!user) throw new Error("Not authenticated");

      // Fetch commission settings (includes referral_reward_amount)
      const { data: commData } = await supabase
        .from("commission_settings")
        .select("admin_fee_percent, creator_fee_percent, referral_reward_amount")
        .limit(1)
        .single();

      const adminFeePercent = Number(commData?.admin_fee_percent ?? 2) / 100;
      const creatorFeePercent = Number(commData?.creator_fee_percent ?? 3) / 100;
      const referralRewardAmount = Number(commData?.referral_reward_amount ?? 5);

      const adminAmount = amount * adminFeePercent;
      const creatorAmount = amount * creatorFeePercent;
      const totalCost = amount;

      // Check balance (amount + bonus_balance)
      const { data: balData } = await supabase
        .from("balances")
        .select("amount, bonus_balance")
        .eq("user_id", user.id)
        .eq("currency", "USDT")
        .single();

      const currentBalance = Number(balData?.amount || 0);
      const currentBonus = Number(balData?.bonus_balance || 0);
      const totalAvailable = currentBalance + currentBonus;

      if (totalAvailable < totalCost) throw new Error("Insufficient balance");

      // Deduct from bonus first, then main balance
      let bonusDeduct = Math.min(currentBonus, totalCost);
      let mainDeduct = totalCost - bonusDeduct;

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

      // --- Credit admin commission ---
      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin")
        .limit(1)
        .single();

      if (adminRole && adminAmount > 0) {
        const { data: adminBal } = await supabase
          .from("balances")
          .select("amount")
          .eq("user_id", adminRole.user_id)
          .eq("currency", "USDT")
          .single();

        if (adminBal) {
          await supabase
            .from("balances")
            .update({ amount: Number(adminBal.amount) + adminAmount, updated_at: new Date().toISOString() })
            .eq("user_id", adminRole.user_id)
            .eq("currency", "USDT");
        }

        await supabase.from("transactions").insert({
          user_id: adminRole.user_id,
          type: "commission",
          amount: adminAmount,
          market_id: marketId,
          option_id: optionId || null,
          side,
          status: "confirmed",
        });
      }

      // --- Credit creator commission ---
      if (creatorAmount > 0) {
        const { data: market } = await supabase
          .from("markets")
          .select("creator_wallet")
          .eq("id", marketId)
          .single();

        if (market?.creator_wallet) {
          const { data: creatorProfile } = await supabase
            .from("profiles")
            .select("id")
            .eq("wallet_address", market.creator_wallet)
            .limit(1)
            .single();

          if (creatorProfile) {
            const { data: creatorBal } = await supabase
              .from("balances")
              .select("amount")
              .eq("user_id", creatorProfile.id)
              .eq("currency", "USDT")
              .single();

            if (creatorBal) {
              await supabase
                .from("balances")
                .update({ amount: Number(creatorBal.amount) + creatorAmount, updated_at: new Date().toISOString() })
                .eq("user_id", creatorProfile.id)
                .eq("currency", "USDT");
            } else {
              await supabase.from("balances").insert({
                user_id: creatorProfile.id,
                amount: creatorAmount,
                currency: "USDT",
              });
            }

            await supabase.from("transactions").insert({
              user_id: creatorProfile.id,
              type: "commission",
              amount: creatorAmount,
              market_id: marketId,
              option_id: optionId || null,
              side,
              status: "confirmed",
            });
          }
        }
      }

      const poolAmount = amount - adminAmount - creatorAmount;

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
      const { data: mkt } = await supabase
        .from("markets")
        .select("volume, participants")
        .eq("id", marketId)
        .single();
      if (mkt) {
        await supabase
          .from("markets")
          .update({
            volume: Number(mkt.volume) + poolAmount,
            participants: mkt.participants + 1,
          })
          .eq("id", marketId);
      }

      // --- Referral reward: check if this is user's first prediction ---
      const { count: posCount } = await supabase
        .from("positions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      if (posCount === 1) {
        // First prediction! Check if user was referred
        const { data: profile } = await supabase
          .from("profiles")
          .select("referred_by")
          .eq("id", user.id)
          .single();

        if (profile?.referred_by && referralRewardAmount > 0) {
          // Credit referrer's bonus_balance
          const { data: referrerBal } = await supabase
            .from("balances")
            .select("bonus_balance")
            .eq("user_id", profile.referred_by)
            .eq("currency", "USDT")
            .single();

          if (referrerBal) {
            await supabase
              .from("balances")
              .update({
                bonus_balance: Number(referrerBal.bonus_balance) + referralRewardAmount,
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", profile.referred_by)
              .eq("currency", "USDT");
          }

          // Record referral reward
          await supabase.from("referral_rewards").insert({
            referrer_id: profile.referred_by,
            referred_id: user.id,
            amount: referralRewardAmount,
          });
        }
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["markets"] });
      queryClient.invalidateQueries({ queryKey: ["referral_rewards"] });
      queryClient.invalidateQueries({ queryKey: ["bonus_balance"] });
    },
  });
};
