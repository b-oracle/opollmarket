import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getErrorMessage } from "../_shared/errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_BOT_USER_ID = "00000000-0000-0000-0000-000000000001";

const CATEGORY_GUIDANCE: Record<string, string> = {
  withdrawal:
    "Ask for: transaction ID or reference, amount, date of request, payment method (bank/crypto), and any error message they see.",
  deposit:
    "Ask for: payment method used, reference/transaction number, exact amount sent, and the date.",
  quick_trade:
    "Ask for: the asset they were trading, the timeframe, what happened vs what they expected, and approximate time.",
  prediction:
    "Ask for: the market title/name, what they predicted, what the issue is (wrong resolution, missing payout, etc.).",
  account:
    "Ask for: what specifically changed or is wrong, any error messages, and what they were trying to do.",
  kyc: "Ask for: what tier they're applying for, what step they're stuck on, and any error messages.",
  copy_trade:
    "Ask for: whose trades they're copying, the specific issue, and any relevant transaction details.",
  technical:
    "Ask for: their device type, browser, steps to reproduce the bug, and any error messages or screenshots.",
  general: "Ask for a clear, detailed description of their issue.",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { ticket_id } = await req.json();
    if (!ticket_id) throw new Error("ticket_id required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch ticket
    const { data: ticket, error: tErr } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("id", ticket_id)
      .single();
    if (tErr || !ticket) throw new Error("Ticket not found");

    // Fetch conversation history
    const { data: msgs } = await supabase
      .from("support_messages")
      .select("content, is_staff, is_ai, created_at")
      .eq("ticket_id", ticket_id)
      .order("created_at", { ascending: true })
      .limit(30);

    const history = (msgs || []).map((m: any) => ({
      role: m.is_staff || m.is_ai ? "assistant" : "user",
      content: m.content || "(image attachment)",
    }));

    const categoryHint =
      CATEGORY_GUIDANCE[ticket.category] || CATEGORY_GUIDANCE.general;

    const systemPrompt = `You are OPoll AI, a friendly support assistant for Opoll Market, a prediction market and quick-trade platform.

Your role:
- Greet the user warmly and acknowledge their issue
- Ask targeted clarifying questions to understand the problem fully
- Provide helpful guidance based on common issues
- If the issue requires manual intervention (refunds, balance adjustments, account changes), tell the user that a staff member will review their ticket shortly

You CANNOT take any action. You cannot refund money, credit accounts, resolve markets, modify settings, or change anything. You are purely conversational.

Category: ${ticket.category || "general"}
Subject: ${ticket.subject || "Support request"}
Guidance for this category: ${categoryHint}

Keep responses concise (2-4 sentences max). Be empathetic and professional. Use simple language. Do not use markdown headers. You may use emoji sparingly.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "system", content: systemPrompt }, ...history],
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429 || response.status === 402) {
        return new Response(JSON.stringify({ error: "AI temporarily unavailable" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const aiData = await response.json();
    const aiContent =
      aiData.choices?.[0]?.message?.content || "A staff member will review your ticket shortly.";

    // Insert AI reply
    await supabase.from("support_messages").insert({
      ticket_id,
      user_id: AI_BOT_USER_ID,
      content: aiContent,
      is_staff: true,
      is_ai: true,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("support-ai-reply error:", e);
    return new Response(
      JSON.stringify({ error: getErrorMessage(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
