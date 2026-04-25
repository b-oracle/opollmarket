import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getErrorMessage } from "../_shared/errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_CATEGORIES = [
  "Crypto", "Commodities", "Forex", "AI & Tech", "Science", "Economy",
  "Entertainment", "Sports", "Politics", "Twitter/X", "Other",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Please sign in to use AI market creation" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI generation is not available at the moment" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Please sign in to use AI market creation" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { prompt } = await req.json();
    if (!prompt?.trim()) {
      return new Response(JSON.stringify({ error: "A prompt is required" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Get AI cost
    const { data: settings } = await adminClient
      .from("commission_settings")
      .select("ai_generation_cost")
      .limit(1)
      .single();
    const cost = Number(settings?.ai_generation_cost ?? 0.5);

    // Check and deduct balance
    const { data: bal, error: balErr } = await adminClient
      .from("balances")
      .select("amount, bonus_balance")
      .eq("user_id", user.id)
      .eq("currency", "USDT")
      .single();

    if (balErr || !bal) {
      return new Response(JSON.stringify({ error: "Could not fetch balance" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bonus = Number(bal.bonus_balance ?? 0);
    const main = Number(bal.amount ?? 0);

    if (bonus + main < cost) {
      return new Response(JSON.stringify({ error: `Insufficient balance. You need $${cost} but have $${(bonus + main).toFixed(2)}.` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bonusDeduct = Math.min(bonus, cost);
    const mainDeduct = cost - bonusDeduct;

    const { error: updateErr } = await adminClient
      .from("balances")
      .update({
        bonus_balance: bonus - bonusDeduct,
        amount: main - mainDeduct,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("currency", "USDT");

    if (updateErr) {
      return new Response(JSON.stringify({ error: "Failed to deduct balance. Please try again." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Record transaction
    await adminClient.from("transactions").insert({
      user_id: user.id,
      type: "buy",
      amount: cost,
      status: "confirmed",
      side: "ai_market_creation",
    });

    // Call AI with tool calling for structured output
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an expert prediction market creator. Given a user prompt, extract all the fields needed to create a prediction market. Use the create_market tool to return structured data.

Rules:
- title: A clear yes/no question or prediction question (max 120 chars)
- description: 2-4 sentences explaining resolution criteria (max 400 chars, no markdown)
- details: Markdown background context (200-800 chars) with bullet points, bold, etc.
- category: Must be one of: ${VALID_CATEGORIES.join(", ")}
- marketType: "binary" for yes/no, "multi" for multiple choice, "range" for numeric ranges
- options: Required for multi/range markets (3-6 options). Leave empty for binary.
- endDate: ISO date string (YYYY-MM-DD). Infer from context. If ambiguous, pick a reasonable future date.
- autoResolve: true if the market can be automatically resolved (sports scores, price targets)
- autoResolveAsset: The asset ticker if it's a price-based auto-resolve (e.g., BTC, ETH, GOLD)
- autoResolveTargetPrice: Target price number if applicable
- autoResolveOperator: "at_or_above" or "at_or_below" if applicable
- sportType: "football", "basketball", "mma", "tennis", etc. if it's a sports market
- sportPredictedOutcome: e.g., "home_win", "away_win", "draw" for sports
- resolutionSource: Text describing how this market will be resolved

Today's date is ${new Date().toISOString().split("T")[0]}.`,
          },
          { role: "user", content: prompt.trim() },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_market",
              description: "Create a prediction market with all required fields",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Market question (max 120 chars)" },
                  description: { type: "string", description: "Resolution criteria (max 400 chars, no markdown)" },
                  details: { type: "string", description: "Background context in markdown (200-800 chars)" },
                  category: { type: "string", enum: VALID_CATEGORIES },
                  marketType: { type: "string", enum: ["binary", "multi", "range"] },
                  options: {
                    type: "array",
                    items: { type: "string" },
                    description: "Options for multi/range markets. Empty for binary.",
                  },
                  endDate: { type: "string", description: "ISO date YYYY-MM-DD" },
                  autoResolve: { type: "boolean" },
                  autoResolveAsset: { type: "string", description: "Asset ticker for price auto-resolve" },
                  autoResolveTargetPrice: { type: "number", description: "Target price for auto-resolve" },
                  autoResolveOperator: { type: "string", enum: ["at_or_above", "at_or_below"] },
                  sportType: { type: "string", description: "Sport type if applicable" },
                  sportPredictedOutcome: { type: "string", description: "Predicted sport outcome" },
                  resolutionSource: { type: "string", description: "How this market resolves" },
                },
                required: ["title", "description", "details", "category", "marketType", "endDate", "resolutionSource"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_market" } },
      }),
    });

    if (!aiResponse.ok) {
      // Refund
      await adminClient
        .from("balances")
        .update({ bonus_balance: bonus, amount: main, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("currency", "USDT");

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "AI is temporarily busy — please wait a few seconds and try again" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "AI generation failed. You have been refunded." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      // Refund
      await adminClient
        .from("balances")
        .update({ bonus_balance: bonus, amount: main, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("currency", "USDT");

      return new Response(JSON.stringify({ error: "AI could not generate market data. You have been refunded." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let marketData: Record<string, unknown>;
    try {
      marketData = JSON.parse(toolCall.function.arguments);
    } catch {
      await adminClient
        .from("balances")
        .update({ bonus_balance: bonus, amount: main, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("currency", "USDT");

      return new Response(JSON.stringify({ error: "AI returned invalid data. You have been refunded." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ market: marketData, cost }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-create-market error:", err);
    return new Response(
      JSON.stringify({ error: getErrorMessage(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
