import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

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
    if (!authHeader) {
      console.error("resolve-market: No Authorization header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    // Verify the caller
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      console.error("resolve-market: getClaims failed", claimsError?.message);
      // Fallback to getUser
      const { data: { user }, error: userError } = await userClient.auth.getUser();
      if (userError || !user) {
        console.error("resolve-market: getUser also failed", userError?.message);
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Use user from getUser fallback
      return await handleResolve(req, user.id, supabaseUrl, serviceRoleKey);
    }

    const userId = claimsData.claims.sub as string;
    return await handleResolve(req, userId, supabaseUrl, serviceRoleKey);
  } catch (err) {
    console.error("resolve-market: Unhandled error", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleResolve(
  req: Request,
  userId: string,
  supabaseUrl: string,
  serviceRoleKey: string,
) {
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Check admin or super_admin role
  const { data: isAdmin } = await adminClient.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  const { data: isSuperAdmin } = await adminClient.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin",
  });

  console.log("resolve-market: userId", userId, "isAdmin", isAdmin, "isSuperAdmin", isSuperAdmin);

  if (!isAdmin && !isSuperAdmin) {
    return new Response(JSON.stringify({ error: "Admin access required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { market_id, winning_side, winning_option_id } = await req.json();

  if (!market_id) {
    return new Response(JSON.stringify({ error: "market_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Atomically claim the market for resolution (row lock prevents concurrent double-resolve)
  const { data: claimResult } = await adminClient.rpc("claim_market_for_resolution", {
    _market_id: market_id,
  });

  if (!claimResult?.success) {
    return new Response(JSON.stringify({ error: claimResult?.error || "Cannot resolve market" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch market details after claiming the lock
  const { data: market, error: marketErr } = await adminClient
    .from("markets")
    .select("*")
    .eq("id", market_id)
    .single();

  if (marketErr || !market) {
    console.error("resolve-market: Market not found", marketErr?.message);
    return new Response(JSON.stringify({ error: "Market not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Update market status
  const updateData: Record<string, unknown> = {
    status: "resolved",
    resolved_side: winning_side || null,
    winning_option_id: winning_option_id || null,
  };

  if (market.market_type === "binary" && winning_side) {
    updateData.yes_price = winning_side === "yes" ? 1 : 0;
    updateData.no_price = winning_side === "no" ? 1 : 0;
  }

  await adminClient.from("markets").update(updateData).eq("id", market_id);

  // For multi-choice/range, update option prices
  if ((market.market_type === "multi" || market.market_type === "range") && winning_option_id) {
    await adminClient.from("market_options").update({ price: 0 }).eq("market_id", market_id);
    await adminClient.from("market_options").update({ price: 1 }).eq("id", winning_option_id);
  }

  // Find winning positions
  let winningPositions;
  if (market.market_type === "binary" && winning_side) {
    const { data } = await adminClient
      .from("positions")
      .select("*, insurance_tier, insurance_premium, insurance_claimed")
      .eq("market_id", market_id)
      .eq("side", winning_side)
      .gt("shares", 0);
    winningPositions = data || [];
  } else if ((market.market_type === "multi" || market.market_type === "range") && winning_option_id) {
    const { data } = await adminClient
      .from("positions")
      .select("*, insurance_tier, insurance_premium, insurance_claimed")
      .eq("market_id", market_id)
      .eq("option_id", winning_option_id)
      .gt("shares", 0);
    winningPositions = data || [];
  } else {
    winningPositions = [];
  }

  // Find losing positions to determine if market is one-sided
  let losingPositions;
  if (market.market_type === "binary" && winning_side) {
    const losingSide = winning_side === "yes" ? "no" : "yes";
    const { data } = await adminClient
      .from("positions")
      .select("*, insurance_tier, insurance_premium, insurance_claimed")
      .eq("market_id", market_id)
      .eq("side", losingSide)
      .gt("shares", 0);
    losingPositions = data || [];
  } else if (market.market_type === "multi" && winning_option_id) {
    const { data } = await adminClient
      .from("positions")
      .select("*, insurance_tier, insurance_premium, insurance_claimed")
      .eq("market_id", market_id)
      .neq("option_id", winning_option_id)
      .gt("shares", 0);
    losingPositions = data || [];
  } else {
    losingPositions = [];
  }

  const isOneSided = losingPositions.length === 0 || winningPositions.length === 0;

  // Get admin fee percent for one-sided winner refund
  let adminFeePercent = 2;
  if (isOneSided && winningPositions.length > 0) {
    const { data: feeSettings } = await adminClient
      .from("commission_settings")
      .select("admin_fee_percent")
      .limit(1)
      .single();
    adminFeePercent = feeSettings?.admin_fee_percent ?? 2;
  }

  // Pay out winners
  let totalPaidOut = 0;
  let payoutPerShare = 1; // default $1/share — hoisted so copy-trade logic can access it

  if (winningPositions.length === 0) {
    // ONE-SIDED: Everyone lost — platform profit, no refund
    console.log("resolve-market: One-sided loss — all positions lose, platform profit");
  } else if (isOneSided && losingPositions.length === 0) {
    // ONE-SIDED: Everyone won — return capital minus admin fee
    console.log("resolve-market: One-sided win — returning capital minus", adminFeePercent, "% admin fee");
    for (const pos of winningPositions) {
      const capital = pos.shares * pos.avg_price;
      const fee = capital * (adminFeePercent / 100);
      const payout = capital - fee;

      if (payout <= 0) continue;

      await adminClient.rpc("adjust_balance", { _user_id: pos.user_id, _delta: payout, _bonus_delta: 0, _insurance_delta: 0 });

      await adminClient.from("transactions").insert({
        user_id: pos.user_id,
        market_id: market_id,
        option_id: pos.option_id,
        type: "payout",
        amount: payout,
        side: pos.side,
        shares: pos.shares,
        price: pos.avg_price,
        status: "confirmed",
      });

      totalPaidOut += payout;
    }
  } else {
    // NORMAL: Two-sided market
    // For multi-option/range markets, use capital-first parimutuel model
    const totalWinnerShares = winningPositions.reduce((s, p) => s + p.shares, 0);

    let profitPerShare = 0;
    if ((market.market_type === "multi" || market.market_type === "range") && totalWinnerShares > 0) {
      const allPositions = [...winningPositions, ...losingPositions];
      const totalPool = allPositions.reduce((s, p) => s + p.shares * p.avg_price, 0);
      const winnersCapital = winningPositions.reduce((s, p) => s + p.shares * p.avg_price, 0);
      const loserPool = totalPool - winnersCapital;
      profitPerShare = loserPool / totalWinnerShares;
      payoutPerShare = totalPool / totalWinnerShares;
      console.log("resolve-market: capital-first parimutuel payout", { totalPool, winnersCapital, loserPool, profitPerShare, payoutPerShare });
    }

    for (const pos of winningPositions) {
      let payout: number;
      if (market.market_type === "multi" || market.market_type === "range") {
        const capital = pos.shares * pos.avg_price;
        payout = Math.round((capital + pos.shares * profitPerShare) * 100) / 100;
      } else {
        payout = Math.round(pos.shares * payoutPerShare * 100) / 100;
      }

      await adminClient.rpc("adjust_balance", { _user_id: pos.user_id, _delta: payout, _bonus_delta: 0, _insurance_delta: 0 });

      await adminClient.from("transactions").insert({
        user_id: pos.user_id,
        market_id: market_id,
        option_id: pos.option_id,
        type: "payout",
        amount: payout,
        side: pos.side,
        shares: pos.shares,
        price: payoutPerShare,
        status: "confirmed",
      });

      totalPaidOut += payout;
    }
  }

  // ── oSURE: Process insurance claims ──
  // For LOSERS: credit insurance_balance if insured
  for (const pos of losingPositions) {
    if (pos.insurance_tier && !pos.insurance_claimed) {
      const netWager = pos.shares * pos.avg_price;
      const claimAmount = Math.round(netWager * pos.insurance_tier * 100) / 100;

      if (claimAmount > 0) {
        await adminClient.rpc("adjust_balance", { _user_id: pos.user_id, _delta: 0, _bonus_delta: 0, _insurance_delta: claimAmount });

        // Update position as claimed
        await adminClient.from("positions").update({ insurance_claimed: true }).eq("id", pos.id);

        // Update insurance_claims record
        await adminClient.from("insurance_claims")
          .update({ status: "claimed", claim_amount: claimAmount, claimed_at: new Date().toISOString() })
          .eq("position_id", pos.id)
          .eq("user_id", pos.user_id);

        // Notify user
        await adminClient.from("notifications").insert({
          user_id: pos.user_id,
          title: "oSURE Claim Paid! 🛡️",
          message: `Your ${Math.round(pos.insurance_tier * 100)}% insurance claim of $${claimAmount.toFixed(2)} for "${market.title}" has been credited to your insurance balance.`,
          type: "info",
          market_id: market_id,
        });
      }
    }
  }

  // For WINNERS: forfeit insurance premium, unlock ONLY this market's insurance → main balance
  for (const pos of winningPositions) {
    if (pos.insurance_tier && !pos.insurance_claimed) {
      // Forfeit: mark claim as forfeited
      await adminClient.from("insurance_claims")
        .update({ status: "forfeited" })
        .eq("position_id", pos.id)
        .eq("user_id", pos.user_id);

      await adminClient.from("positions").update({ insurance_claimed: true }).eq("id", pos.id);
    }

    // Only unlock insurance balance for winners who HAD insurance on THIS market
    // Sum claimed amounts from this market's losing positions that were paid to this user's insurance_balance
    const { data: userClaims } = await adminClient
      .from("insurance_claims")
      .select("claim_amount")
      .eq("user_id", pos.user_id)
      .eq("market_id", market_id)
      .eq("status", "claimed");

    const thisMarketInsurance = (userClaims || []).reduce((s, c) => s + Number(c.claim_amount || 0), 0);
    // For winners who had insured positions on this market, their premium was forfeited above.
    // We don't unlock blanket insurance balance — only market-specific claimed amounts would have
    // been credited to insurance_balance for LOSERS, not winners. So skip blanket unlock.
    // The insurance_balance is only relevant for losers' claims on other active markets.
  }

  console.log("resolve-market: Success, winners:", winningPositions.length, "losers:", losingPositions.length, "one-sided:", isOneSided, "paid:", totalPaidOut);

  // ── Return initial liquidity to creator (minus exit fee) ──
  // Only refund if the liquidity was actually paid (verified), not admin-simulated
  if (market.initial_liquidity > 0 && market.liquidity_verified) {
    const creatorUserId = market.creator_wallet;

    // Get exit fee from commission_settings
    const { data: settings } = await adminClient
      .from("commission_settings")
      .select("liquidity_return_fee_percent")
      .limit(1)
      .single();

    const liquidityReturnFeePercent = Number((settings as any)?.liquidity_return_fee_percent) || 5;
    const feeAmount = market.initial_liquidity * (liquidityReturnFeePercent / 100);
    const liquidityRefund = market.initial_liquidity - feeAmount;

    if (liquidityRefund > 0) {
      await adminClient.rpc("adjust_balance", { _user_id: creatorUserId, _delta: liquidityRefund, _bonus_delta: 0, _insurance_delta: 0 });

      await adminClient.from("transactions").insert({
        user_id: creatorUserId,
        market_id: market_id,
        type: "refund",
        amount: liquidityRefund,
        side: "liquidity_return",
        status: "confirmed",
      });

      // Notify creator
      await adminClient.from("notifications").insert({
        user_id: creatorUserId,
        title: "Liquidity Returned 💰",
        message: `Your $${market.initial_liquidity.toFixed(2)} initial liquidity for "${market.title}" has been returned ($${liquidityRefund.toFixed(2)} after ${liquidityReturnFeePercent}% liquidity return fee).`,
        type: "refund",
        market_id: market_id,
      });

      console.log("resolve-market: Returned liquidity to creator:", liquidityRefund, "fee:", feeAmount);
    }
  }

  // Auto-post to official X account
  try {
    const outcomeLabel = winningSide === "yes" ? "Yes ✅" : winningSide === "no" ? "No ❌" : (winningOptionId ? winningSide : winningSide);
    await supabase.functions.invoke("twitter-auto-post", {
      body: {
        event_type: "market_resolved",
        variables: {
          title: market.title,
          market_id: marketId,
          outcome: outcomeLabel,
        },
      },
    });
  } catch (tweetErr) {
    console.warn("resolve-market: twitter auto-post failed (non-critical)", tweetErr);
  }


  // ── Process copy trade revenue share ──
  // Find all copy_trade_earnings for this market
  const { data: copyEarnings } = await adminClient
    .from("copy_trade_earnings")
    .select("*")
    .eq("market_id", market_id);

  if (copyEarnings && copyEarnings.length > 0) {
    // Get all positions for copiers on this market to determine profit
    for (const earning of copyEarnings) {
      // Find the copier's position(s) on this market
      const { data: copierPositions } = await adminClient
        .from("positions")
        .select("side, option_id, shares, avg_price")
        .eq("user_id", earning.copier_user_id)
        .eq("market_id", market_id);

      if (!copierPositions || copierPositions.length === 0) continue;

      let copierProfit = 0;
      for (const pos of copierPositions) {
        const isWinner =
          (market.market_type === "binary" && winning_side && pos.side === winning_side) ||
          ((market.market_type === "multi" || market.market_type === "range") && winning_option_id && pos.option_id === winning_option_id);

        if (isWinner) {
          copierProfit += pos.shares * (payoutPerShare - pos.avg_price);
        } else {
          copierProfit -= pos.shares * pos.avg_price;
        }
      }

      // Only charge commission if copier made a profit
      let commissionAmount = 0;
      if (copierProfit > 0) {
        commissionAmount = copierProfit * (earning.commission_percent / 100);

        // Deduct commission from copier's balance
        // Deduct commission from copier (atomic)
        await adminClient.rpc("adjust_balance", { _user_id: earning.copier_user_id, _delta: -commissionAmount, _bonus_delta: 0, _insurance_delta: 0 });

        // Credit commission to trader (atomic)
        await adminClient.rpc("adjust_balance", { _user_id: earning.trader_user_id, _delta: commissionAmount, _bonus_delta: 0, _insurance_delta: 0 });

        // Get copier's display name for the commission transaction
        const { data: copierProfile } = await adminClient
          .from("profiles")
          .select("display_name")
          .eq("id", earning.copier_user_id)
          .single();
        const copierName = copierProfile?.display_name || "A copier";

        // Record commission transaction for the trader (side stores copier name for transparency)
        await adminClient.from("transactions").insert({
          user_id: earning.trader_user_id,
          market_id,
          type: "commission",
          amount: commissionAmount,
          status: "confirmed",
          side: copierName,
        });

        // Notify trader about commission earned
        await adminClient.from("notifications").insert({
          user_id: earning.trader_user_id,
          title: "Copy Trade Commission! 💰",
          message: `You earned $${commissionAmount.toFixed(2)} commission from a copier's profit on "${market.title}"`,
          type: "info",
          market_id,
        });
      }

      // Update the copy_trade_earnings record with actual figures
      await adminClient
        .from("copy_trade_earnings")
        .update({
          copier_profit: copierProfit,
          commission_amount: commissionAmount,
        })
        .eq("id", earning.id);
    }

    console.log("resolve-market: Processed", copyEarnings.length, "copy trade earnings");
  }

  // --- Dispatch webhooks to API partners ---
  try {
    await fetch(`${supabaseUrl}/functions/v1/webhook-dispatch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        event_type: "market.resolved",
        market_id: marketId,
        payload: {
          market_id: marketId,
          title: market.title,
          resolved_side: winningSide,
          winning_option_id: winningOptionId || null,
          total_paid_out: totalPaidOut,
          winners: winningPositions.length,
        },
      }),
    });
  } catch (webhookErr) {
    console.warn("resolve-market: webhook dispatch failed (non-critical)", webhookErr);
  }

  return new Response(
    JSON.stringify({
      success: true,
      winners: winningPositions.length,
      total_paid_out: totalPaidOut,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
