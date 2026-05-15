import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { verifyCronSecret } from "../_shared/cronAuth.ts";
import { getErrorMessage } from "../_shared/errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-cron-secret",
};

const GAMMA_API = "https://gamma-api.polymarket.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronCheck = verifyCronSecret(req, { functionName: "check-poly-resolve", corsHeaders });
  if (!cronCheck.ok) return cronCheck.response!;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Find all active markets with a polymarket_id
    const { data: markets, error: marketsErr } = await adminClient
      .from("markets")
      .select("id, polymarket_id, market_type, title")
      .not("polymarket_id", "is", null)
      .eq("status", "active");

    if (marketsErr || !markets || markets.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active Polymarket-linked markets", resolved: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalResolved = 0;
    let totalPaidOut = 0;
    const errors: string[] = [];

    for (const localMarket of markets) {
      try {
        // Fetch from Polymarket Gamma API
        const resp = await fetch(`${GAMMA_API}/markets/${localMarket.polymarket_id}`);
        if (!resp.ok) {
          if (resp.status === 404) continue; // Market not found on Polymarket
          errors.push(`API error for ${localMarket.polymarket_id}: ${resp.status}`);
          continue;
        }

        const polyMarket = await resp.json();

        // Check if resolved
        if (!polyMarket.closed && polyMarket.active !== false) continue;

        // Determine winning side from outcome prices
        // Polymarket: outcomePrices = ["0.95", "0.05"] where index 0 = Yes, index 1 = No
        // If price ≈ 1, that side won
        let winningSide: string | null = null;

        if (polyMarket.outcomePrices && Array.isArray(polyMarket.outcomePrices)) {
          const yesPrice = parseFloat(polyMarket.outcomePrices[0] || "0");
          const noPrice = parseFloat(polyMarket.outcomePrices[1] || "0");
          if (yesPrice >= 0.95) winningSide = "yes";
          else if (noPrice >= 0.95) winningSide = "no";
        }

        // Also check resolved field
        if (!winningSide && polyMarket.resolved) {
          if (polyMarket.resolution === "Yes" || polyMarket.resolution === "yes") winningSide = "yes";
          else if (polyMarket.resolution === "No" || polyMarket.resolution === "no") winningSide = "no";
        }

        if (!winningSide) {
          // Market is closed but we can't determine winner — skip for now
          continue;
        }

        // ─── Resolve the local market (same logic as resolve-market) ───

        // Update market status
        await adminClient.from("markets").update({
          status: "resolved",
          resolved_side: winningSide,
          yes_price: winningSide === "yes" ? 1 : 0,
          no_price: winningSide === "no" ? 1 : 0,
        }).eq("id", localMarket.id);

        // Find winning positions
        const { data: winningPositions } = await adminClient
          .from("positions")
          .select("*")
          .eq("market_id", localMarket.id)
          .eq("side", winningSide)
          .gt("shares", 0);

        // Pay out winners
        let marketPaidOut = 0;
        for (const pos of winningPositions || []) {
          const payout = pos.shares; // Each share resolves at $1

          await adminClient.rpc("adjust_balance", { _user_id: pos.user_id, _delta: payout, _bonus_delta: 0, _insurance_delta: 0 });

          await adminClient.from("transactions").insert({
            user_id: pos.user_id,
            market_id: localMarket.id,
            type: "payout",
            amount: payout,
            side: pos.side,
            shares: pos.shares,
            price: 1,
            status: "confirmed",
          });

          marketPaidOut += payout;
        }

        // Send notifications to participants
        const { data: allPositions } = await adminClient
          .from("positions")
          .select("user_id, side")
          .eq("market_id", localMarket.id)
          .gt("shares", 0);

        const notifiedUserIds = new Set<string>();
        for (const pos of allPositions || []) {
          if (notifiedUserIds.has(pos.user_id)) continue;
          notifiedUserIds.add(pos.user_id);

          const isWinner = pos.side === winningSide;
          await adminClient.from("notifications").insert({
            user_id: pos.user_id,
            title: isWinner ? "You Won! 🎉" : "Market Resolved",
            message: `"${localMarket.title}" resolved ${winningSide.toUpperCase()}.${isWinner ? " Your payout has been credited." : ""}`,
            type: isWinner ? "payout" : "resolution",
            market_id: localMarket.id,
          });
        }

        totalResolved++;
        totalPaidOut += marketPaidOut;
      } catch (err) {
        const message = getErrorMessage(err);
        errors.push(`Error resolving ${localMarket.id}: ${message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked: markets.length,
        resolved: totalResolved,
        total_paid_out: totalPaidOut,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = getErrorMessage(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
