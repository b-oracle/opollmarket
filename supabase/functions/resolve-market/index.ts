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

  // Fetch market
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

  if (market.status === "resolved") {
    return new Response(JSON.stringify({ error: "Market already resolved" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Prevent re-resolution: if a market was previously resolved (has payout history), block it
  if (market.resolved_side || market.winning_option_id) {
    console.error("resolve-market: Market has prior resolution data", { resolved_side: market.resolved_side, winning_option_id: market.winning_option_id });
    return new Response(JSON.stringify({ error: "Market was previously resolved. Clear resolution data before re-resolving." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Check for existing payout transactions (catches edge cases where status was reset)
  const { count: existingPayouts } = await adminClient
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("market_id", market_id)
    .in("type", ["payout", "refund"]);

  if (existingPayouts && existingPayouts > 0) {
    console.error("resolve-market: Market already has payout/refund transactions", { count: existingPayouts });
    return new Response(JSON.stringify({ error: `Market already has ${existingPayouts} payout/refund transactions. Cannot re-resolve to avoid duplicate payments.` }), {
      status: 400,
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

  // For multi-choice, update option prices
  if (market.market_type === "multi" && winning_option_id) {
    await adminClient.from("market_options").update({ price: 0 }).eq("market_id", market_id);
    await adminClient.from("market_options").update({ price: 1 }).eq("id", winning_option_id);
  }

  // Find winning positions
  let winningPositions;
  if (market.market_type === "binary" && winning_side) {
    const { data } = await adminClient
      .from("positions")
      .select("*")
      .eq("market_id", market_id)
      .eq("side", winning_side)
      .gt("shares", 0);
    winningPositions = data || [];
  } else if (market.market_type === "multi" && winning_option_id) {
    const { data } = await adminClient
      .from("positions")
      .select("*")
      .eq("market_id", market_id)
      .eq("option_id", winning_option_id)
      .gt("shares", 0);
    winningPositions = data || [];
  } else {
    winningPositions = [];
  }

  // Pay out winners
  let totalPaidOut = 0;
  for (const pos of winningPositions) {
    const payout = pos.shares;

    const { data: balance } = await adminClient
      .from("balances")
      .select("amount")
      .eq("user_id", pos.user_id)
      .single();

    if (balance) {
      await adminClient
        .from("balances")
        .update({ amount: balance.amount + payout, updated_at: new Date().toISOString() })
        .eq("user_id", pos.user_id);
    }

    await adminClient.from("transactions").insert({
      user_id: pos.user_id,
      market_id: market_id,
      option_id: pos.option_id,
      type: "payout",
      amount: payout,
      side: pos.side,
      shares: pos.shares,
      price: 1,
      status: "confirmed",
    });

    totalPaidOut += payout;
  }

  console.log("resolve-market: Success, winners:", winningPositions.length, "paid:", totalPaidOut);

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
          (market.market_type === "multi" && winning_option_id && pos.option_id === winning_option_id);

        if (isWinner) {
          // Profit = payout (shares * $1) minus cost (shares * avg_price)
          copierProfit += pos.shares * (1 - pos.avg_price);
        } else {
          // Loss = -(shares * avg_price)
          copierProfit -= pos.shares * pos.avg_price;
        }
      }

      // Only charge commission if copier made a profit
      let commissionAmount = 0;
      if (copierProfit > 0) {
        commissionAmount = copierProfit * (earning.commission_percent / 100);

        // Deduct commission from copier's balance
        const { data: copierBal } = await adminClient
          .from("balances")
          .select("amount")
          .eq("user_id", earning.copier_user_id)
          .single();

        if (copierBal) {
          await adminClient
            .from("balances")
            .update({ amount: Math.max(0, copierBal.amount - commissionAmount), updated_at: new Date().toISOString() })
            .eq("user_id", earning.copier_user_id);
        }

        // Credit commission to trader's balance
        const { data: traderBal } = await adminClient
          .from("balances")
          .select("amount")
          .eq("user_id", earning.trader_user_id)
          .single();

        if (traderBal) {
          await adminClient
            .from("balances")
            .update({ amount: traderBal.amount + commissionAmount, updated_at: new Date().toISOString() })
            .eq("user_id", earning.trader_user_id);
        }

        // Record commission transaction for the trader
        await adminClient.from("transactions").insert({
          user_id: earning.trader_user_id,
          market_id,
          type: "commission",
          amount: commissionAmount,
          status: "confirmed",
          side: "yes",
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

  return new Response(
    JSON.stringify({
      success: true,
      winners: winningPositions.length,
      total_paid_out: totalPaidOut,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
