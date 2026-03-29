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
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get revenue share settings
    const { data: settings } = await adminClient
      .from("commission_settings")
      .select("blue_revenue_share_percent, gold_revenue_share_percent, creator_fee_percent")
      .limit(1)
      .single();

    if (!settings) {
      return new Response(JSON.stringify({ error: "Settings not found" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bluePercent = Number(settings.blue_revenue_share_percent) || 0;
    const goldPercent = Number(settings.gold_revenue_share_percent) || 0;
    const creatorFeePercent = Number(settings.creator_fee_percent) || 3;

    if (bluePercent <= 0 && goldPercent <= 0) {
      return new Response(
        JSON.stringify({ message: "Revenue sharing disabled (both tiers at 0%)", distributed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find resolved markets from the last 24h that haven't been distributed yet
    // We check for markets resolved recently whose creator is verified
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: resolvedMarkets } = await adminClient
      .from("markets")
      .select("id, creator_wallet, volume")
      .eq("status", "resolved")
      .gte("updated_at", cutoff);

    if (!resolvedMarkets || resolvedMarkets.length === 0) {
      return new Response(
        JSON.stringify({ message: "No recently resolved markets", distributed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalDistributed = 0;
    let shareRecords = 0;

    for (const market of resolvedMarkets) {
      // Check if already distributed for this market
      const { count } = await adminClient
        .from("revenue_shares")
        .select("id", { count: "exact", head: true })
        .eq("market_id", market.id);

      if ((count || 0) > 0) continue; // Already distributed

      // Get creator's verification level
      const { data: creatorProfile } = await adminClient
        .from("profiles")
        .select("id, verification_level")
        .eq("id", market.creator_wallet)
        .single();

      if (!creatorProfile) continue;

      const level = creatorProfile.verification_level;
      if (level !== "blue" && level !== "gold") continue;

      const sharePercent = level === "gold" ? goldPercent : bluePercent;
      if (sharePercent <= 0) continue;

      // Calculate creator fee earned from this market's volume
      // Creator fee = volume * (creator_fee_percent / 100)
      const creatorFeeEarned = (market.volume || 0) * (creatorFeePercent / 100);
      // Revenue share = percentage of the creator fee
      const shareAmount = creatorFeeEarned * (sharePercent / 100);

      if (shareAmount <= 0) continue;

      // Record the revenue share
      await adminClient.from("revenue_shares").insert({
        user_id: creatorProfile.id,
        market_id: market.id,
        amount: Number(shareAmount.toFixed(2)),
        verification_tier: level,
        share_percent: sharePercent,
      });

      // Credit to user's bonus balance
      await adminClient
        .from("balances")
        .update({
          bonus_balance: adminClient.rpc ? undefined : undefined, // We need raw SQL for increment
        })
        .eq("user_id", creatorProfile.id);

      // Use RPC-style increment via raw update
      const { data: currentBalance } = await adminClient
        .from("balances")
        .select("bonus_balance")
        .eq("user_id", creatorProfile.id)
        .eq("currency", "USDT")
        .single();

      if (currentBalance) {
        const newBonus = Number(currentBalance.bonus_balance || 0) + shareAmount;
        await adminClient
          .from("balances")
          .update({ bonus_balance: newBonus, updated_at: new Date().toISOString() })
          .eq("user_id", creatorProfile.id)
          .eq("currency", "USDT");
      }

      // Notify the user
      await adminClient.from("notifications").insert({
        user_id: creatorProfile.id,
        title: "Revenue Share Bonus Earned! 💰",
        message: `You earned a $${shareAmount.toFixed(2)} revenue share bonus (${sharePercent}%) from your market as a ${level === "gold" ? "Gold" : "Blue"} verified creator. This is an additional reward on top of your standard creator fee.`,
        type: "referral",
        market_id: market.id,
      });

      totalDistributed += shareAmount;
      shareRecords++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        distributed: Number(totalDistributed.toFixed(2)),
        markets_processed: shareRecords,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("distribute-revenue-shares error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
