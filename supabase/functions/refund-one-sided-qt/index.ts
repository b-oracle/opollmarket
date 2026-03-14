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

    // Fetch ALL bets with their round info in one go (paginated)
    let allBets: any[] = [];
    let page = 0;
    let hasMore = true;
    while (hasMore) {
      const { data } = await supabase
        .from("quick_bets")
        .select("id, user_id, amount, status, round_id")
        .in("status", ["won", "lost"])
        .order("created_at", { ascending: false })
        .range(page * 1000, (page + 1) * 1000 - 1);
      if (data && data.length > 0) {
        allBets = [...allBets, ...data];
        page++;
        if (data.length < 1000) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    // Group bets by round
    const roundBets = new Map<string, any[]>();
    for (const bet of allBets) {
      const arr = roundBets.get(bet.round_id) || [];
      arr.push(bet);
      roundBets.set(bet.round_id, arr);
    }

    // Find one-sided rounds (all won, no lost)
    const userRefunds: Record<string, number> = {};
    let totalRefunded = 0;

    for (const [roundId, bets] of roundBets.entries()) {
      const hasLosers = bets.some((b: any) => b.status === "lost");
      if (hasLosers) continue;

      const winners = bets.filter((b: any) => b.status === "won");
      if (winners.length === 0) continue;

      for (const bet of winners) {
        const amount = Number(bet.amount);
        const feeRefund = amount * platformFee;
        const bonus = amount * 0.005;
        const totalCredit = feeRefund + bonus;

        userRefunds[bet.user_id] = (userRefunds[bet.user_id] || 0) + totalCredit;
        totalRefunded += totalCredit;
      }
    }

    console.log(`Found ${Object.keys(userRefunds).length} users to refund, total: $${totalRefunded.toFixed(2)}`);

    // Credit each user and record transaction
    let totalUsers = 0;
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

      // Record transaction for accounting
      await supabase.from("transactions").insert({
        user_id: userId,
        type: "qt_one_sided_bonus",
        amount,
        status: "confirmed",
        side: "credit",
      });

      // Notify user
      await supabase.from("notifications").insert({
        user_id: userId,
        title: "QuickTrade Winning Bonus! 💰",
        message: `You've been credited $${amount.toFixed(2)} as a bonus for winning in one-sided rounds. Keep trading!`,
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
