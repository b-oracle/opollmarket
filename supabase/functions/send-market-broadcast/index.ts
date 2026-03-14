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
    const { broadcast_id, market_id } = await req.json();

    if (!broadcast_id || !market_id) {
      return new Response(JSON.stringify({ error: "broadcast_id and market_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get market title
    const { data: market } = await supabase
      .from("markets")
      .select("title")
      .eq("id", market_id)
      .single();

    const marketTitle = market?.title || "a market";

    // Get all user IDs from profiles
    const { data: users, error: usersError } = await supabase
      .from("profiles")
      .select("id");

    if (usersError || !users || users.length === 0) {
      console.error("Failed to fetch users:", usersError);
      return new Response(JSON.stringify({ error: "No users found" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Batch insert notifications for all users
    const BATCH_SIZE = 500;
    const notifications = users.map((u) => ({
      user_id: u.id,
      title: "📢 Market Alert",
      message: `Check out this market: "${marketTitle}"`,
      type: "broadcast",
      market_id,
    }));

    for (let i = 0; i < notifications.length; i += BATCH_SIZE) {
      const batch = notifications.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await supabase
        .from("notifications")
        .insert(batch);

      if (insertError) {
        console.error(`Batch ${i} insert error:`, insertError);
      }
    }

    // Update broadcast status to sent
    await supabase
      .from("market_broadcasts")
      .update({ status: "sent" })
      .eq("id", broadcast_id);

    console.log(`Broadcast sent to ${users.length} users for market ${market_id}`);

    return new Response(
      JSON.stringify({ success: true, recipients: users.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-market-broadcast error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
