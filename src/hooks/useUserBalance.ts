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

      // Update market volume, participants & AMM prices
      const { data: mkt } = await supabase
        .from("markets")
        .select("volume, participants, yes_price, no_price, market_type")
        .eq("id", marketId)
        .single();
      if (mkt) {
        // Simple AMM price impact: shift price based on bet side and amount relative to liquidity
        const isMulti = mkt.market_type === "multi" || mkt.market_type === "range";
        let updateFields: Record<string, any> = {
          volume: Number(mkt.volume) + poolAmount,
          participants: mkt.participants + 1,
        };

        if (!isMulti) {
          // Binary market: adjust yes_price/no_price
          const currentYes = Number(mkt.yes_price);
          const currentNo = Number(mkt.no_price);
          const totalLiq = Number(mkt.volume) + poolAmount + 100; // avoid division by zero
          const impact = Math.min(poolAmount / totalLiq, 0.15); // cap impact at 15%

          let newYes: number;
          if (side === "yes") {
            newYes = Math.min(0.99, currentYes + impact);
          } else {
            newYes = Math.max(0.01, currentYes - impact);
          }
          const newNo = Math.round((1 - newYes) * 100) / 100;
          newYes = Math.round(newYes * 100) / 100;

          updateFields.yes_price = newYes;
          updateFields.no_price = newNo;
        }

        await supabase
          .from("markets")
          .update(updateFields)
          .eq("id", marketId);

        // Multi-option: update the selected option's price and rebalance others
        if (isMulti && optionId) {
          const { data: allOptions } = await supabase
            .from("market_options")
            .select("id, price")
            .eq("market_id", marketId);

          if (allOptions && allOptions.length > 0) {
            const totalLiq = Number(mkt.volume) + poolAmount + 100;
            const impact = Math.min(poolAmount / totalLiq, 0.15);

            const selectedOpt = allOptions.find((o) => o.id === optionId);
            if (selectedOpt) {
              const newSelectedPrice = Math.min(0.99, Number(selectedOpt.price) + impact);
              const othersTotal = allOptions
                .filter((o) => o.id !== optionId)
                .reduce((sum, o) => sum + Number(o.price), 0);

              // Update selected option
              await supabase
                .from("market_options")
                .update({ price: Math.round(newSelectedPrice * 100) / 100 })
                .eq("id", optionId);

              // Rebalance other options proportionally so all sum to ~1.0
              if (othersTotal > 0) {
                const remaining = Math.max(0.01, 1 - newSelectedPrice);
                const scaleFactor = remaining / othersTotal;
                for (const opt of allOptions.filter((o) => o.id !== optionId)) {
                  const newPrice = Math.max(0.01, Math.round(Number(opt.price) * scaleFactor * 100) / 100);
                  await supabase
                    .from("market_options")
                    .update({ price: newPrice })
                    .eq("id", opt.id);
                }
              }
            }
          }
        }
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
      queryClient.invalidateQueries({ queryKey: ["price-history"] });
      queryClient.invalidateQueries({ queryKey: ["orderbook-trades"] });
    },
  });
};
