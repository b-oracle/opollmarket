import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_BOOST_TIERS: Record<string, { durationHours: number; price: number; rank: number }> = {
  flash: { durationHours: 12, price: 20, rank: 1 },
  standard: { durationHours: 24, price: 50, rank: 2 },
  whale: { durationHours: 168, price: 150, rank: 3 },
};
let DEFAULT_BROADCAST_PRICE = 5;
let SOCIAL_AD_PRICE = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const { market_id, boost_tier, include_broadcast, include_social_ad, ad_headline, ad_video_url } = await req.json();

    if (!market_id) {
      return new Response(JSON.stringify({ error: "market_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load dynamic pricing
    const BOOST_TIERS = { ...DEFAULT_BOOST_TIERS };
    let BROADCAST_PRICE = DEFAULT_BROADCAST_PRICE;
    try {
      const { data: cs } = await adminClient
        .from("commission_settings")
        .select("boost_flash_price, boost_standard_price, boost_whale_price, broadcast_price, social_ad_price")
        .limit(1)
        .single();
      if (cs) {
        BOOST_TIERS.flash = { ...BOOST_TIERS.flash, price: Number(cs.boost_flash_price) || 20 };
        BOOST_TIERS.standard = { ...BOOST_TIERS.standard, price: Number(cs.boost_standard_price) || 50 };
        BOOST_TIERS.whale = { ...BOOST_TIERS.whale, price: Number(cs.boost_whale_price) || 150 };
        if (cs.broadcast_price != null) BROADCAST_PRICE = Number(cs.broadcast_price);
        if (cs.social_ad_price != null) SOCIAL_AD_PRICE = Number(cs.social_ad_price);
      }
    } catch { /* use defaults */ }

    // Calculate total cost
    const tierConfig = boost_tier ? BOOST_TIERS[boost_tier] : null;
    if (boost_tier && !tierConfig) {
      return new Response(JSON.stringify({ error: "Invalid boost tier" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const boostCost = tierConfig?.price || 0;
    const broadcastCost = include_broadcast ? BROADCAST_PRICE : 0;
    const socialAdCost = include_social_ad ? SOCIAL_AD_PRICE : 0;
    const totalCost = boostCost + broadcastCost + socialAdCost;

    if (totalCost <= 0) {
      return new Response(JSON.stringify({ error: "No items selected" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user balance
    const { data: bal } = await adminClient
      .from("balances")
      .select("amount, bonus_balance")
      .eq("user_id", userId)
      .eq("currency", "USDT")
      .maybeSingle();

    if (!bal) {
      return new Response(JSON.stringify({ error: "No balance record found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mainBalance = Number(bal.amount);
    const bonusBalance = Number(bal.bonus_balance);

    // Bonus balance covers fees first (boost/broadcast are service fees)
    const bonusDeduct = Math.min(bonusBalance, totalCost);
    const mainDeduct = totalCost - bonusDeduct;

    if (mainDeduct > mainBalance) {
      return new Response(JSON.stringify({
        error: `Insufficient balance. You need $${totalCost.toFixed(2)} but have $${(mainBalance + bonusBalance).toFixed(2)}.`,
        required: totalCost,
        available_main: mainBalance,
        available_bonus: bonusBalance,
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check existing active boost if boosting
    let existingBoost: { tier: string; ends_at: string } | null = null;
    if (tierConfig) {
      const now = new Date();
      const { data: existingBoosts } = await adminClient
        .from("market_boosts")
        .select("id, tier, ends_at")
        .eq("market_id", market_id)
        .eq("status", "active")
        .gte("ends_at", now.toISOString())
        .order("ends_at", { ascending: false })
        .limit(1);

      if (existingBoosts?.[0]) {
        const existingRank = BOOST_TIERS[existingBoosts[0].tier]?.rank || 0;
        if (tierConfig.rank < existingRank) {
          return new Response(JSON.stringify({
            error: `This market already has an active ${existingBoosts[0].tier} boost. Select same or higher tier to extend.`,
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        existingBoost = existingBoosts[0];
      }
    }

    // Atomically debit balance
    const { data: debitResult } = await adminClient.rpc("debit_balance_atomic", {
      _user_id: userId,
      _main_deduct: mainDeduct,
      _bonus_deduct: bonusDeduct,
    });

    if (!debitResult?.success) {
      return new Response(JSON.stringify({ error: debitResult?.error || "Failed to debit balance" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bonusRatio = totalCost > 0 ? bonusDeduct / totalCost : 0;

    const result: Record<string, unknown> = {
      success: true,
      total_charged: totalCost,
      bonus_used: bonusDeduct,
      main_used: mainDeduct,
    };

    // Create boost record
    if (tierConfig) {
      const baseTime = existingBoost ? new Date(existingBoost.ends_at) : new Date();
      const endsAt = new Date(baseTime.getTime() + tierConfig.durationHours * 60 * 60 * 1000);

      const { data: boost, error: boostErr } = await adminClient
        .from("market_boosts")
        .insert({
          market_id,
          tier: boost_tier,
          amount: tierConfig.price,
          payer_wallet: userId,
          ends_at: endsAt.toISOString(),
          status: "active",
        })
        .select("id")
        .single();

      if (boostErr) {
        // Refund on failure
        await adminClient.rpc("adjust_balance", {
          _user_id: userId,
          _delta: mainDeduct,
          _bonus_delta: bonusDeduct,
        });
        return new Response(JSON.stringify({ error: "Failed to create boost record" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Log transaction
      await adminClient.from("transactions").insert({
        user_id: userId,
        type: "buy",
        amount: tierConfig.price,
        bonus_amount: tierConfig.price * bonusRatio,
        market_id,
        status: "confirmed",
        side: `boost_${boost_tier}`,
      });

      result.boost_id = boost.id;
      result.extending = !!existingBoost;
      result.new_ends_at = endsAt.toISOString();
    }

    // Create broadcast record & send
    if (include_broadcast) {
      const { data: broadcast, error: bcErr } = await adminClient
        .from("market_broadcasts")
        .insert({
          market_id,
          user_id: userId,
          tier: "alert",
          amount: BROADCAST_PRICE,
          status: "active",
        })
        .select("id")
        .single();

      if (!bcErr && broadcast) {
        // Log transaction
        await adminClient.from("transactions").insert({
          user_id: userId,
          type: "buy",
          amount: BROADCAST_PRICE,
          bonus_amount: BROADCAST_PRICE * bonusRatio,
          market_id,
          status: "confirmed",
          side: "broadcast_alert",
        });

        // Trigger broadcast sending
        try {
          await adminClient.functions.invoke("send-market-broadcast", {
            headers: { "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "" },
            body: { broadcast_id: broadcast.id, market_id },
          });
          await adminClient
            .from("market_broadcasts")
            .update({ status: "sent" })
            .eq("id", broadcast.id);
        } catch (e) {
          console.error("Broadcast send failed:", e);
        }

        result.broadcast_id = broadcast.id;
      }
    }

    // Create social ad record
    if (include_social_ad) {
      const adEndsAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h duration
      const { data: adRecord, error: adErr } = await adminClient
        .from("social_ads")
        .insert({
          market_id,
          user_id: userId,
          headline: ad_headline || null,
          video_url: ad_video_url || null,
          amount: SOCIAL_AD_PRICE,
          status: "active",
          ends_at: adEndsAt.toISOString(),
        })
        .select("id")
        .single();

      if (!adErr && adRecord) {
        // Log transaction
        await adminClient.from("transactions").insert({
          user_id: userId,
          type: "buy",
          amount: SOCIAL_AD_PRICE,
          bonus_amount: SOCIAL_AD_PRICE * bonusRatio,
          market_id,
          status: "confirmed",
          side: "social_ad",
        });
        result.social_ad_id = adRecord.id;
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("pay-promotion-balance error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
