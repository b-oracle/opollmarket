import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ASSET_GECKO_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  BNB: "binancecoin",
  SOL: "solana",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  LINK: "chainlink",
};

async function fetchCryptoPrice(asset: string): Promise<number | null> {
  const geckoId = ASSET_GECKO_MAP[asset.toUpperCase()];
  if (!geckoId) return null;
  try {
    const resp = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data[geckoId]?.usd ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // 1. Find rounds that are past their deadline and still open/locked
    const deadline = new Date();
    const { data: rounds, error: fetchErr } = await supabase
      .from("quick_rounds")
      .select("*")
      .in("status", ["open", "locked"])
      .lte("locks_at", deadline.toISOString())
      .order("created_at", { ascending: true });

    if (fetchErr) throw fetchErr;
    if (!rounds || rounds.length === 0) {
      return new Response(JSON.stringify({ resolved: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get commission rate
    const { data: settings } = await supabase
      .from("commission_settings")
      .select("admin_fee_percent, creator_fee_percent")
      .limit(1)
      .single();
    const platformFee = settings
      ? (Number(settings.admin_fee_percent) + Number(settings.creator_fee_percent)) / 100
      : 0.05;

    let resolvedCount = 0;

    for (const round of rounds) {
      // Check if round end time has passed (created_at + duration_seconds)
      const endTime = new Date(
        new Date(round.created_at).getTime() + round.duration_seconds * 1000
      );
      if (deadline < endTime) {
        // Lock the round if not yet locked
        if (round.status === "open") {
          await supabase
            .from("quick_rounds")
            .update({ status: "locked" })
            .eq("id", round.id);
        }
        continue;
      }

      // Fetch closing price
      const closePrice = await fetchCryptoPrice(round.asset);
      if (closePrice == null) continue;

      const openPrice = Number(round.open_price);
      const result =
        closePrice > openPrice ? "up" : closePrice < openPrice ? "down" : "flat";

      // Update round
      await supabase
        .from("quick_rounds")
        .update({
          close_price: closePrice,
          result,
          status: "resolved",
          resolved_at: new Date().toISOString(),
        })
        .eq("id", round.id);

      // Fetch all bets for this round
      const { data: bets } = await supabase
        .from("quick_bets")
        .select("*")
        .eq("round_id", round.id)
        .eq("status", "pending");

      if (!bets || bets.length === 0) {
        resolvedCount++;
        continue;
      }

      if (result === "flat") {
        // Refund all bets
        for (const bet of bets) {
          await supabase
            .from("quick_bets")
            .update({ payout: bet.amount, status: "refunded" })
            .eq("id", bet.id);
          // Credit balance back
          const { data: bal } = await supabase
            .from("balances")
            .select("amount")
            .eq("user_id", bet.user_id)
            .eq("currency", "USDT")
            .single();
          if (bal) {
            await supabase
              .from("balances")
              .update({ amount: Number(bal.amount) + Number(bet.amount), updated_at: new Date().toISOString() })
              .eq("user_id", bet.user_id)
              .eq("currency", "USDT");
          }
        }
        resolvedCount++;
        continue;
      }

      const winners = bets.filter((b) => b.side === result);
      const losers = bets.filter((b) => b.side !== result);

      const totalWinPool = winners.reduce((s, b) => s + Number(b.amount), 0);
      const totalLosePool = losers.reduce((s, b) => s + Number(b.amount), 0);

      if (winners.length === 0) {
        // All losers — refund minus commission
        for (const bet of losers) {
          const refund = Number(bet.amount) * (1 - platformFee);
          await supabase
            .from("quick_bets")
            .update({ payout: refund, status: "lost" })
            .eq("id", bet.id);
          const { data: bal } = await supabase
            .from("balances")
            .select("amount")
            .eq("user_id", bet.user_id)
            .eq("currency", "USDT")
            .single();
          if (bal) {
            await supabase
              .from("balances")
              .update({ amount: Number(bal.amount) + refund, updated_at: new Date().toISOString() })
              .eq("user_id", bet.user_id)
              .eq("currency", "USDT");
          }
        }
      } else if (losers.length === 0) {
        // All winners — refund minus commission
        for (const bet of winners) {
          const refund = Number(bet.amount) * (1 - platformFee);
          await supabase
            .from("quick_bets")
            .update({ payout: refund, status: "won" })
            .eq("id", bet.id);
          const { data: bal } = await supabase
            .from("balances")
            .select("amount")
            .eq("user_id", bet.user_id)
            .eq("currency", "USDT")
            .single();
          if (bal) {
            await supabase
              .from("balances")
              .update({ amount: Number(bal.amount) + refund, updated_at: new Date().toISOString() })
              .eq("user_id", bet.user_id)
              .eq("currency", "USDT");
          }
        }
      } else {
        // Normal payout: winners get stake back + share of losers' pool minus fee
        const distributable = totalLosePool * (1 - platformFee);

        for (const bet of winners) {
          const share = Number(bet.amount) / totalWinPool;
          const payout = Number(bet.amount) + distributable * share;
          await supabase
            .from("quick_bets")
            .update({ payout, status: "won" })
            .eq("id", bet.id);
          const { data: bal } = await supabase
            .from("balances")
            .select("amount")
            .eq("user_id", bet.user_id)
            .eq("currency", "USDT")
            .single();
          if (bal) {
            await supabase
              .from("balances")
              .update({ amount: Number(bal.amount) + payout, updated_at: new Date().toISOString() })
              .eq("user_id", bet.user_id)
              .eq("currency", "USDT");
          }
          // Notify winner
          await supabase.from("notifications").insert({
            user_id: bet.user_id,
            title: "Quick Trade Won! 🎉",
            message: `You won $${payout.toFixed(2)} on ${round.asset} ${result.toUpperCase()} prediction!`,
            type: "payout",
          });
        }

        // Mark losers
        for (const bet of losers) {
          await supabase
            .from("quick_bets")
            .update({ payout: 0, status: "lost" })
            .eq("id", bet.id);
        }
      }

      resolvedCount++;
    }

    return new Response(JSON.stringify({ resolved: resolvedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("resolve-quick-round error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
