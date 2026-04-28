import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getErrorMessage } from "../_shared/errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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

    const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();
    if (userError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const senderId = authUser.id;
    const { recipientId, spaceId, emoji, amount } = await req.json();

    if (!recipientId || !spaceId || !emoji || !amount || amount <= 0) {
      return new Response(JSON.stringify({ error: "Missing or invalid parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (senderId === recipientId) {
      return new Response(JSON.stringify({ error: "Cannot gift yourself" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for the RPC call
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: result, error: rpcError } = await adminClient.rpc("send_space_gift", {
      _sender_id: senderId,
      _recipient_id: recipientId,
      _space_id: spaceId,
      _emoji: emoji,
      _amount: amount,
    });

    if (rpcError) {
      return new Response(JSON.stringify({ error: rpcError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!result?.success) {
      return new Response(JSON.stringify({ error: result?.error || "Gift failed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get sender name for notification
    const { data: senderProfile } = await adminClient
      .from("profiles")
      .select("display_name")
      .eq("id", senderId)
      .maybeSingle();

    const senderName = senderProfile?.display_name || "Someone";

    // Insert notification for recipient
    await adminClient.from("notifications").insert({
      user_id: recipientId,
      title: "Gift Received! 🎁",
      message: `${senderName} sent you ${emoji} ($${Number(amount).toFixed(2)})`,
      type: "gift",
      actor_id: senderId,
    });

    // Relay to Telegram
    try {
      await adminClient.functions.invoke("telegram-notify", {
        body: {
          user_id: recipientId,
          title: "Gift Received! 🎁",
          message: `${senderName} sent you ${emoji} ($${Number(amount).toFixed(2)})`,
          type: "gift",
          actor_id: senderId,
        },
      });
    } catch (_) { /* best-effort */ }

    return new Response(
      JSON.stringify({
        success: true,
        remaining_gift_balance: result.remaining_gift_balance,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (getErrorMessage(err)) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
