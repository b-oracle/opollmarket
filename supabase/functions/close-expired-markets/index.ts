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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find all active markets whose end_date has passed (including today)
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const { data: expiredMarkets, error: fetchError } = await supabase
      .from("markets")
      .select("id, title, creator_wallet")
      .eq("status", "active")
      .lte("end_date", today);

    if (fetchError) {
      console.error("Fetch error:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    if (!expiredMarkets || expiredMarkets.length === 0) {
      return new Response(
        JSON.stringify({ message: "No expired markets found", closed: 0 }),
        { headers: corsHeaders }
      );
    }

    console.log(`Found ${expiredMarkets.length} expired market(s) to close`);

    let closed = 0;

    for (const market of expiredMarkets) {
      // Update status to 'ended'
      const { error: updateError } = await supabase
        .from("markets")
        .update({
          status: "ended",
          updated_at: new Date().toISOString(),
        })
        .eq("id", market.id)
        .eq("status", "active"); // prevent race conditions

      if (updateError) {
        console.error(`Failed to close market ${market.id}:`, updateError);
        continue;
      }

      // Notify the creator
      await supabase.from("notifications").insert({
        user_id: market.creator_wallet,
        title: "Market Ended ⏰",
        message: `Your market "${market.title}" has ended and is now awaiting resolution.`,
        type: "info",
        market_id: market.id,
      });

      // Notify all participants
      const { data: participants } = await supabase
        .from("positions")
        .select("user_id")
        .eq("market_id", market.id)
        .gt("shares", 0);

      if (participants && participants.length > 0) {
        const uniqueUserIds = [...new Set(participants.map((p) => p.user_id))];
        const notifications = uniqueUserIds
          .filter((uid) => uid !== market.creator_wallet) // don't double-notify creator
          .map((uid) => ({
            user_id: uid,
            title: "Market Ended ⏰",
            message: `A market you predicted on has ended: "${market.title}". Awaiting resolution.`,
            type: "info",
            market_id: market.id,
          }));

        if (notifications.length > 0) {
          await supabase.from("notifications").insert(notifications);
        }
      }

      closed++;
      console.log(`Closed market: ${market.id} — ${market.title}`);
    }

    return new Response(
      JSON.stringify({ message: `Closed ${closed} expired market(s)`, closed }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
