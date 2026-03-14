import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Get platform fee rate
    const { data: settings } = await supabase
      .from("commission_settings")
      .select("quick_trade_fee_percent, admin_fee_percent, creator_fee_percent")
      .limit(1)
      .single();

    const platformFee = settings?.quick_trade_fee_percent != null
      ? Number(settings.quick_trade_fee_percent) / 100
      : settings
        ? (Number(settings.admin_fee_percent) + Number(settings.creator_fee_percent)) / 100
        : 0.05;

    // Find all resolved rounds
    const { data: rounds, error: roundsErr } = await supabase
      .from("quick_rounds")
      .select("id")
      .eq("status", "resolved")
      .not("result", "eq", "flat");

    if (roundsErr) throw roundsErr;
    if (!rounds || rounds.length === 0) {
      return new Response(JSON.stringify({ message: "No resolved rounds found", refunded: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalRefunded = 0;
    let totalUsers = 0;
    const userRefunds: Record<string, number> = {};

    for (const round of rounds) {
      // Get all bets for this round that are settled (won/lost)
      const { data: bets } = await supabase
        .from("quick_bets")
        .select("*")
        .eq("round_id", round.id)
        .in("status", ["won", "lost"]);

      if (!bets || bets.length === 0) continue;

      const losers = bets.filter((b: any) => b.status === "lost");
      const winners = bets.filter((b: any) => b.status === "won");

      // Only process one-sided rounds (no losers, all winners)
      if (losers.length > 0 || winners.length === 0) continue;

      for (const bet of winners) {
        const amount = Number(bet.amount);
        // They were charged: amount * (1 - platformFee) * multiplier
        // They should have gotten: amount * 1.005 * multiplier
        // Difference per unit = amount * (1 - (1 - platformFee)) + amount * 0.005
        //                      = amount * platformFee + amount * 0.005
        const feeRefund = amount * platformFee;
        const bonus = amount * 0.005;
        const totalCredit = feeRefund + bonus;

        userRefunds[bet.user_id] = (userRefunds[bet.user_id] || 0) + totalCredit;

        // Record as transaction for accounting
        await supabase.from("transactions").insert({
          user_id: bet.user_id,
          type: "qt_one_sided_bonus",
          amount: totalCredit,
          status: "confirmed",
          side: "credit",
        });
        totalRefunded += totalCredit;
      }
    }

    // Credit each user
    for (const [userId, amount] of Object.entries(userRefunds)) {
      const { data: bal } = await supabase
        .from("balances")
        .select("amount")
        .eq("user_id", userId)
        .eq("currency", "USDT")
        .single();

      if (bal) {
        await supabase
          .from("balances")
          .update({ amount: Number(bal.amount) + amount, updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("currency", "USDT");
      }

      // Notify user
      await supabase.from("notifications").insert({
        user_id: userId,
        title: "Quick Trade Bonus Credit 🎁",
        message: `You've been credited $${amount.toFixed(2)} as a one-sided market bonus refund. Thank you for trading!`,
        type: "payout",
      });

      totalUsers++;
    }

    console.log(`Refund complete: ${totalUsers} users, $${totalRefunded.toFixed(2)} total`);

    return new Response(JSON.stringify({
      success: true,
      totalUsers,
      totalRefunded: Number(totalRefunded.toFixed(2)),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("refund-one-sided-qt error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
