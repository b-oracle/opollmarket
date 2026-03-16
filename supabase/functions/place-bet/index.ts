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
    const { marketId, optionId, side, amount, price, shares, insuranceTier } = await req.json();

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
      .select("status, end_date, creator_wallet")
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
      .select("prediction_fee_percent, admin_fee_percent, creator_fee_percent, creator_fee_blue_percent, creator_fee_gold_percent, referrer_commission_percent, referral_reward_amount, bc400_pool_percent, osure_enabled, osure_25_premium, osure_50_premium, osure_100_premium")
      .limit(1)
      .single();

    // Single flat prediction fee
    const predictionFeePercent = Number(commData?.prediction_fee_percent ?? 10) / 100;
    const totalFees = amount * predictionFeePercent;

    // Internal splits (these are % of the fee amount, must sum to 100)
    const referrerSplit = Number(commData?.referrer_commission_percent ?? 0) / 100;
    const bc400Split = Number((commData as any)?.bc400_pool_percent ?? 0) / 100;

    // Determine creator split based on verification level
    let creatorSplit = 0;
    let creatorId: string | null = null;
    if (marketCheck.creator_wallet) {
      const { data: creatorProfile } = await supabase
        .from("profiles")
        .select("id, verification_level")
        .eq("id", marketCheck.creator_wallet)
        .single();

      if (creatorProfile) {
        creatorId = creatorProfile.id;
        const level = creatorProfile.verification_level || "none";
        if (level === "gold") {
          creatorSplit = Number(commData?.creator_fee_gold_percent ?? 30) / 100;
        } else if (level === "blue") {
          creatorSplit = Number(commData?.creator_fee_blue_percent ?? 30) / 100;
        } else {
          creatorSplit = Number(commData?.creator_fee_percent ?? 30) / 100;
        }
      }
    }

    // Look up trader's referrer for per-trade commission
    let referrerId: string | null = null;
    if (referrerSplit > 0) {
      const { data: traderProfile } = await supabase
        .from("profiles")
        .select("referred_by")
        .eq("id", userId)
        .single();
      referrerId = traderProfile?.referred_by || null;
    }

    // Calculate actual amounts from fee splits
    // Admin keeps the remainder after splits — no separate adminAmount needed
    // Round to 2 decimals and enforce $0.01 minimum to avoid $0.00 spam
    const creatorAmountRaw = totalFees * creatorSplit;
    const creatorAmount = creatorAmountRaw >= 0.01 ? Math.round(creatorAmountRaw * 100) / 100 : 0;
    const referrerAmountRaw = referrerId ? totalFees * referrerSplit : 0;
    const referrerAmount = referrerAmountRaw >= 0.01 ? Math.round(referrerAmountRaw * 100) / 100 : 0;
    const bc400AmountRaw = totalFees * bc400Split;
    const bc400Amount = bc400AmountRaw >= 0.01 ? Math.round(bc400AmountRaw * 100) / 100 : 0;
    const netAmount = amount - totalFees;
    const totalCost = amount;
    // Recalculate shares server-side based on net amount (amount minus fee)
    const actualShares = netAmount / (price / 100);

    // ── oSURE Insurance ──
    let insurancePremium = 0;
    let normalizedTier: number | null = null;
    const osureEnabled = (commData as any)?.osure_enabled !== false;

    if (insuranceTier && osureEnabled && [25, 50, 100].includes(insuranceTier)) {
      normalizedTier = insuranceTier / 100; // 0.25, 0.50, 1.00
      let premiumPercent = 0;
      if (insuranceTier === 25) premiumPercent = Number((commData as any)?.osure_25_premium ?? 10);
      else if (insuranceTier === 50) premiumPercent = Number((commData as any)?.osure_50_premium ?? 20);
      else if (insuranceTier === 100) premiumPercent = Number((commData as any)?.osure_100_premium ?? 30);
      insurancePremium = Math.round(amount * (premiumPercent / 100) * 100) / 100;
    }

    // Check balance
    const { data: balData } = await supabase
      .from("balances")
      .select("amount, bonus_balance, insurance_balance")
      .eq("user_id", userId)
      .eq("currency", "USDT")
      .single();

    const currentBalance = Number(balData?.amount || 0);
    const currentBonus = Number(balData?.bonus_balance || 0);
    const currentInsurance = Number(balData?.insurance_balance || 0);

    // Bonus (referral) balance can ONLY be used to pay fees, not the bet itself
    const bonusForFees = Math.min(currentBonus, totalFees);
    const feesFromMain = totalFees - bonusForFees;
    const mainDeduct = netAmount + feesFromMain + insurancePremium;
    const totalAvailable = currentBalance + currentBonus;

    if (totalAvailable < totalCost + insurancePremium) {
      return new Response(JSON.stringify({ error: "Insufficient balance" }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Atomic debit with row-level lock to prevent race conditions
    const { data: debitResult } = await supabase.rpc("debit_balance_atomic", {
      _user_id: userId,
      _main_deduct: mainDeduct,
      _bonus_deduct: bonusForFees,
    });

    if (!debitResult?.success) {
      return new Response(JSON.stringify({ error: debitResult?.error || "Insufficient balance" }), {
        status: 400, headers: corsHeaders,
      });
    }

    // --- Credit entire total fee to admin pool reserve ---
    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1)
      .single();

    const adminCreditTotal = totalFees + insurancePremium;
    if (adminRole && adminCreditTotal > 0) {
      await supabase.rpc("adjust_balance", { _user_id: adminRole.user_id, _delta: adminCreditTotal });

      await supabase.from("transactions").insert({
        user_id: adminRole.user_id,
        type: "commission",
        amount: adminCreditTotal,
        market_id: marketId,
        option_id: optionId || null,
        side,
        status: "confirmed",
      });
    }

    // --- Queue commissions for 48-hour deferred release ---
    const releasesAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    // Track inserted commission IDs for rollback on position failure
    const insertedCommissionIds: string[] = [];

    // Creator commission (queued)
    if (creatorId && creatorAmount > 0) {
      const { data: creatorComm } = await supabase.from("pending_commissions").insert({
        user_id: creatorId,
        market_id: marketId,
        amount: creatorAmount,
        type: "creator",
        status: "pending",
        releases_at: releasesAt,
      }).select("id").single();
      if (creatorComm) insertedCommissionIds.push(creatorComm.id);

      await supabase.from("notifications").insert({
        user_id: creatorId,
        title: "Creator Commission Earned! 🎉",
        message: `You earned $${creatorAmount.toFixed(2)} creator commission — it will be credited in 48 hours.`,
        type: "info",
        market_id: marketId,
      });
    }

    // Referrer commission (queued)
    if (referrerId && referrerAmount > 0) {
      const { data: refComm } = await supabase.from("pending_commissions").insert({
        user_id: referrerId,
        market_id: marketId,
        amount: referrerAmount,
        type: "referral",
        status: "pending",
        releases_at: releasesAt,
      }).select("id").single();
      if (refComm) insertedCommissionIds.push(refComm.id);

      await supabase.from("notifications").insert({
        user_id: referrerId,
        title: "Referral Commission Earned! 💰",
        message: `You earned $${referrerAmount.toFixed(2)} referral commission — it will be credited in 48 hours.`,
        type: "referral",
        market_id: marketId,
      });
    }

    // BC400 pool (queued)
    if (bc400Amount > 0) {
      const { data: bc400Comm } = await supabase.from("pending_commissions").insert({
        user_id: adminRole?.user_id || "00000000-0000-0000-0000-000000000000",
        market_id: marketId,
        amount: bc400Amount,
        type: "bc400",
        status: "pending",
        releases_at: releasesAt,
      }).select("id").single();
      if (bc400Comm) insertedCommissionIds.push(bc400Comm.id);
    }

    const poolAmount = netAmount;

    // Insert position with server-calculated shares (+ insurance data)
    const positionInsert: Record<string, unknown> = {
      user_id: userId,
      market_id: marketId,
      option_id: optionId || null,
      side,
      shares: actualShares,
      avg_price: price / 100,
    };
    if (normalizedTier !== null) {
      positionInsert.insurance_tier = normalizedTier;
      positionInsert.insurance_premium = insurancePremium;
    }

    const { data: insertedPos, error: posError } = await supabase.from("positions").insert(positionInsert).select("id").single();
    if (posError || !insertedPos) {
      console.error("Position insert error:", posError);
      // Refund user balance atomically
      await supabase.rpc("adjust_balance", { _user_id: userId, _delta: mainDeduct, _bonus_delta: bonusForFees });

      // Reverse admin fee credit to prevent phantom revenue
      if (adminRole && adminCreditTotal > 0) {
        await supabase.rpc("adjust_balance", { _user_id: adminRole.user_id, _delta: -adminCreditTotal });
      }

      // Delete pending commissions that were just inserted for this trade (by ID)
      if (insertedCommissionIds.length > 0) {
        await supabase
          .from("pending_commissions")
          .delete()
          .in("id", insertedCommissionIds);
      }

      return new Response(JSON.stringify({ error: "Failed to create position" }), {
        status: 500, headers: corsHeaders,
      });
    }

    // Insert insurance_claims record if insured
    if (normalizedTier !== null && insertedPos) {
      const claimAmount = netAmount * normalizedTier;
      await supabase.from("insurance_claims").insert({
        user_id: userId,
        position_id: insertedPos.id,
        market_id: marketId,
        tier: normalizedTier,
        premium_paid: insurancePremium,
        claim_amount: claimAmount,
        status: "pending",
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
      shares: actualShares,
      price: price / 100,
      status: "confirmed",
    });

    // Update market volume, participants & AMM prices
    const { data: mkt } = await supabase
      .from("markets")
      .select("volume, liquidity, participants, yes_price, no_price, market_type, initial_liquidity")
      .eq("id", marketId)
      .single();

    if (mkt) {
      const isMulti = mkt.market_type === "multi" || mkt.market_type === "range";
      const newVolume = Number(mkt.volume) + amount;
      const newLiquidity = Number(mkt.liquidity || 0) + poolAmount;

      // Count distinct participants instead of blindly incrementing
      const { count: distinctParticipants } = await supabase
        .from("positions")
        .select("user_id", { count: "exact", head: true })
        .eq("market_id", marketId)
        .gt("shares", 0);

      const updateFields: Record<string, any> = {
        volume: newVolume,
        liquidity: newLiquidity,
        participants: distinctParticipants ?? (mkt.participants + 1),
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

    // Referral reward on first prediction is handled by the
    // handle_referral_reward database trigger — no duplicate logic needed.

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
          amount: netAmount,
          price,
          shares: actualShares,
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
