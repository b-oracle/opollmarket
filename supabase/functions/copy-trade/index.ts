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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { trader_user_id, market_id, option_id, side, amount, price, shares, trade_type } = await req.json();

    if (!trader_user_id || !trade_type) {
      return new Response(JSON.stringify({ error: "Missing params" }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Find followers with auto_copy enabled for this trader
    const copyField = trade_type === "quick_trade" ? "copy_quick_trades" : "copy_predictions";

    const { data: copiers, error: copierErr } = await supabase
      .from("copy_settings")
      .select("user_id, max_amount")
      .eq("target_user_id", trader_user_id)
      .eq("auto_copy", true)
      .eq(copyField, true);

    if (copierErr || !copiers || copiers.length === 0) {
      return new Response(JSON.stringify({ copied: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get trader name for notifications
    const { data: traderProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", trader_user_id)
      .single();
    const traderName = traderProfile?.display_name || "A trader";

    // Get market title if applicable
    let marketTitle = "";
    if (market_id) {
      const { data: market } = await supabase
        .from("markets")
        .select("title")
        .eq("id", market_id)
        .single();
      marketTitle = market?.title || "";
    }

    let queuedCount = 0;

    for (const copier of copiers) {
      try {
        const maxAmount = Number(copier.max_amount || 10);
        const copyAmount = Math.min(amount, maxAmount);

        if (copyAmount <= 0) continue;

        // Queue a pending copy trade instead of executing immediately
        const copyShares = shares ? (copyAmount / amount) * shares : null;

        await supabase.from("pending_copy_trades").insert({
          user_id: copier.user_id,
          trader_user_id,
          trade_type,
          market_id: market_id || null,
          option_id: option_id || null,
          side: side || null,
          amount: copyAmount,
          price: price || null,
          shares: copyShares ? Math.max(0.01, Number(copyShares.toFixed(2))) : null,
          status: "pending",
        });

        // Notify the copier to approve the trade
        const tradeDesc = trade_type === "quick_trade"
          ? `$${copyAmount.toFixed(2)} on ${(side || "").toUpperCase()} in Quick Trade`
          : `$${copyAmount.toFixed(2)} on ${(side || "").toUpperCase()}${marketTitle ? ` — "${marketTitle}"` : ""}`;

        await supabase.from("notifications").insert({
          user_id: copier.user_id,
          title: "Copy Trade Pending ⏳",
          message: `${traderName} placed a trade: ${tradeDesc}. Approve within 2 min or it expires.`,
          type: "copy_trade",
          market_id: market_id || null,
        });

        queuedCount++;
      } catch (err) {
        console.error(`Failed to queue copy trade for ${copier.user_id}:`, err);
      }
    }

    return new Response(JSON.stringify({ queued: queuedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("copy-trade error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: corsHeaders,
    });
  }
});
