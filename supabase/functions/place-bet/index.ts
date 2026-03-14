import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: corsHeaders,
      });
    }

    // Validate user
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: corsHeaders,
      });
    }

    const userId = user.id;
    const { marketId, optionId, side, amount, price, shares } = await req.json();

    // Validate inputs
    if (!marketId || !side || !amount || !price || !shares) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: corsHeaders,
      });
    }
    if (amount <= 0 || shares <= 0 || price <= 0) {
      return new Response(JSON.stringify({ error: "Invalid amounts" }), {
        status: 400, headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate market is active and not expired
    const { data: marketCheck, error: marketCheckErr } = await supabase
      .from("markets")
      .select("status, end_date")
      .eq("id", marketId)
      .single();

    if (marketCheckErr || !marketCheck) {
      return new Response(JSON.stringify({ error: "Market not found" }), {
        status: 404, headers: corsHeaders,
      });
    }

    if (marketCheck.status !== "active") {
      return new Response(JSON.stringify({ error: "Market is no longer active" }), {
        status: 400, headers: corsHeaders,
      });
    }

    const today = new Date().toISOString().split("T")[0];
    if (marketCheck.end_date < today) {
      return new Response(JSON.stringify({ error: "Market has ended" }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Fetch commission settings
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
    const totalFees = adminAmount + creatorAmount;
    const totalCost = amount;

    // Check balance
    const { data: balData } = await supabase
      .from("balances")
      .select("amount, bonus_balance")
      .eq("user_id", userId)
      .eq("currency", "USDT")
      .single();

    const currentBalance = Number(balData?.amount || 0);
    const currentBonus = Number(balData?.bonus_balance || 0);

    // Bonus (referral) balance can ONLY be used to pay fees, not the bet itself
    const bonusForFees = Math.min(currentBonus, totalFees);
    const feesFromMain = totalFees - bonusForFees;
    const betAmount = amount - totalFees; // net amount going to pool
    const mainDeduct = betAmount + feesFromMain;
    const totalAvailable = currentBalance + currentBonus;

    if (totalAvailable < totalCost) {
      return new Response(JSON.stringify({ error: "Insufficient balance" }), {
        status: 400, headers: corsHeaders,
      });
    }

    if (currentBalance < mainDeduct) {
      return new Response(JSON.stringify({ error: "Insufficient main balance" }), {
        status: 400, headers: corsHeaders,
      });
    }

    const { error: balError } = await supabase
      .from("balances")
      .update({
        amount: currentBalance - mainDeduct,
        bonus_balance: currentBonus - bonusForFees,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("currency", "USDT");

    if (balError) {
      console.error("Balance deduct error:", balError);
      return new Response(JSON.stringify({ error: "Failed to deduct balance" }), {
        status: 500, headers: corsHeaders,
      });
    }

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
        // creator_wallet stores user ID
        const creatorId = market.creator_wallet;

        const { data: creatorBal } = await supabase
          .from("balances")
          .select("amount")
          .eq("user_id", creatorId)
          .eq("currency", "USDT")
          .single();

        if (creatorBal) {
          await supabase
            .from("balances")
            .update({ amount: Number(creatorBal.amount) + creatorAmount, updated_at: new Date().toISOString() })
            .eq("user_id", creatorId)
            .eq("currency", "USDT");
        } else {
          await supabase.from("balances").insert({
            user_id: creatorId,
            amount: creatorAmount,
            currency: "USDT",
          });
        }

        await supabase.from("transactions").insert({
          user_id: creatorId,
          type: "commission",
          amount: creatorAmount,
          market_id: marketId,
          option_id: optionId || null,
          side,
          status: "confirmed",
        });
      }
    }

    const poolAmount = amount - adminAmount - creatorAmount;

    // Insert position
    const { error: posError } = await supabase.from("positions").insert({
      user_id: userId,
      market_id: marketId,
      option_id: optionId || null,
      side,
      shares,
      avg_price: price / 100,
    });
    if (posError) {
      console.error("Position insert error:", posError);
      // Refund balance
      await supabase.from("balances").update({
        amount: currentBalance,
        bonus_balance: currentBonus,
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId).eq("currency", "USDT");
      return new Response(JSON.stringify({ error: "Failed to create position" }), {
        status: 500, headers: corsHeaders,
      });
    }

    // Insert transaction
    await supabase.from("transactions").insert({
      user_id: userId,
      type: "buy",
      amount: totalCost,
      market_id: marketId,
      option_id: optionId || null,
      side,
      shares,
      price: price / 100,
      status: "confirmed",
    });

    // Update market volume, participants & AMM prices
    const { data: mkt } = await supabase
      .from("markets")
      .select("volume, participants, yes_price, no_price, market_type, initial_liquidity")
      .eq("id", marketId)
      .single();

    if (mkt) {
      const isMulti = mkt.market_type === "multi" || mkt.market_type === "range";
      const updateFields: Record<string, any> = {
        volume: Number(mkt.volume) + poolAmount,
        participants: mkt.participants + 1,
      };

      if (!isMulti) {
        const currentYes = Number(mkt.yes_price);
        const totalLiq = Number(mkt.volume) + poolAmount + 100;
        const impact = Math.min(poolAmount / totalLiq, 0.15);

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

      await supabase.from("markets").update(updateFields).eq("id", marketId);

      // Multi-option: rebalance prices
      if (isMulti && optionId) {
        const { data: allOptions } = await supabase
          .from("market_options")
          .select("id, price")
          .eq("market_id", marketId);

        if (allOptions && allOptions.length > 0) {
          const totalLiq = Number(mkt.volume) + poolAmount + 100;
          const impact = Math.min(poolAmount / totalLiq, 0.15);
          const selectedOpt = allOptions.find((o: any) => o.id === optionId);

          if (selectedOpt) {
            const newSelectedPrice = Math.min(0.99, Number(selectedOpt.price) + impact);

            await supabase.from("market_options")
              .update({ price: Math.round(newSelectedPrice * 100) / 100 })
              .eq("id", optionId);

            const othersTotal = allOptions
              .filter((o: any) => o.id !== optionId)
              .reduce((sum: number, o: any) => sum + Number(o.price), 0);

            if (othersTotal > 0) {
              const remaining = Math.max(0.01, 1 - newSelectedPrice);
              const scaleFactor = remaining / othersTotal;
              for (const opt of allOptions.filter((o: any) => o.id !== optionId)) {
                const newPrice = Math.max(0.01, Math.round(Number(opt.price) * scaleFactor * 100) / 100);
                await supabase.from("market_options").update({ price: newPrice }).eq("id", opt.id);
              }
            }
          }
        }
      }
    }

    // --- Referral reward on first prediction ---
    const { count: posCount } = await supabase
      .from("positions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (posCount === 1 && referralRewardAmount > 0) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("referred_by")
        .eq("id", userId)
        .single();

      if (profile?.referred_by) {
        // Check idempotency
        const { count: existingReward } = await supabase
          .from("referral_rewards")
          .select("id", { count: "exact", head: true })
          .eq("referrer_id", profile.referred_by)
          .eq("referred_id", userId);

        if (!existingReward || existingReward === 0) {
          const { data: referrerBal } = await supabase
            .from("balances")
            .select("bonus_balance")
            .eq("user_id", profile.referred_by)
            .eq("currency", "USDT")
            .single();

          if (referrerBal) {
            await supabase.from("balances").update({
              bonus_balance: Number(referrerBal.bonus_balance) + referralRewardAmount,
              updated_at: new Date().toISOString(),
            }).eq("user_id", profile.referred_by).eq("currency", "USDT");
          }

          await supabase.from("referral_rewards").insert({
            referrer_id: profile.referred_by,
            referred_id: userId,
            amount: referralRewardAmount,
          });

          await supabase.from("notifications").insert({
            user_id: profile.referred_by,
            title: "Referral Reward! 🎉",
            message: `You earned $${referralRewardAmount} bonus for a successful referral!`,
            type: "referral",
          });
        }
      }
    }

    // Trigger limit order matching
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/match-limit-orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ market_id: marketId }),
      });
    } catch {
      // Non-critical
    }

    // Trigger copy-trade for followers
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/copy-trade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          trader_user_id: userId,
          market_id: marketId,
          option_id: optionId || null,
          side,
          amount,
          price,
          shares,
          trade_type: "prediction",
        }),
      });
    } catch {
      // Non-critical
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("place-bet error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
