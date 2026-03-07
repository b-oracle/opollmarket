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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller is admin
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check super_admin role (only super_admin can resolve)
    const { data: isSuperAdmin } = await adminClient.rpc("has_role", {
      _user_id: user.id,
      _role: "super_admin",
    });
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Super Admin access required" }), {
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
      const payout = pos.shares; // Each share resolves at $1

      // Credit balance
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

      // Record payout transaction
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

    return new Response(
      JSON.stringify({
        success: true,
        winners: winningPositions.length,
        total_paid_out: totalPaidOut,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
