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

      // Fetch commission settings
      const { data: commData } = await supabase
        .from("commission_settings")
        .select("admin_fee_percent, creator_fee_percent")
        .limit(1)
        .single();

      const adminFeePercent = Number(commData?.admin_fee_percent ?? 2) / 100;
      const creatorFeePercent = Number(commData?.creator_fee_percent ?? 3) / 100;

      const adminAmount = amount * adminFeePercent;
      const creatorAmount = amount * creatorFeePercent;
      const totalCost = amount; // full amount deducted from user

      // Check balance
      const { data: balData } = await supabase
        .from("balances")
        .select("amount")
        .eq("user_id", user.id)
        .eq("currency", "USDT")
        .single();

      const currentBalance = Number(balData?.amount || 0);
      if (currentBalance < totalCost) throw new Error("Insufficient balance");

      // Deduct balance from user
      const { error: balError } = await supabase
        .from("balances")
        .update({ amount: currentBalance - totalCost, updated_at: new Date().toISOString() })
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

        // Record admin commission transaction
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
          // Find creator's user_id via profiles
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
              // Create balance row for creator
              await supabase.from("balances").insert({
                user_id: creatorProfile.id,
                amount: creatorAmount,
                currency: "USDT",
              });
            }

            // Record creator commission transaction
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

      // Pool amount (what actually goes into the market)
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

      // Insert transaction for the bet
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
