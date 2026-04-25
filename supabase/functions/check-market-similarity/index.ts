import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getErrorMessage } from "../_shared/errors.ts";

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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { title, description } = await req.json();

    if (!title || title.trim().length < 5) {
      return new Response(
        JSON.stringify({ error: "Title is required (min 5 chars)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch active and pending markets
    const { data: existingMarkets, error: dbError } = await supabase
      .from("markets")
      .select("id, title, description, category, status")
      .in("status", ["active", "pending"])
      .limit(200);

    if (dbError) {
      console.error("DB error:", dbError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch existing markets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!existingMarkets || existingMarkets.length === 0) {
      return new Response(
        JSON.stringify({ similar: false, matches: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build AI prompt
    const marketList = existingMarkets.map((m, i) =>
      `[${i + 1}] "${m.title}" (${m.category}, ${m.status})`
    ).join("\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You are a duplicate market detector for a prediction market platform. Compare the NEW market against the EXISTING markets and determine if any are semantically similar (asking essentially the same question, even if worded differently).

Return ONLY a JSON object with this exact structure:
{"similar": true/false, "match_indices": [1-indexed numbers of matching markets], "reason": "brief explanation"}

Be strict: markets about the same topic but asking different questions are NOT similar. Only flag truly duplicate/overlapping prediction questions.`
          },
          {
            role: "user",
            content: `NEW MARKET:
Title: "${title.trim()}"
Description: "${(description || "").trim()}"

EXISTING MARKETS:
${marketList}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_similarity",
              description: "Report whether the new market is similar to existing ones",
              parameters: {
                type: "object",
                properties: {
                  similar: { type: "boolean", description: "Whether a similar market exists" },
                  match_indices: {
                    type: "array",
                    items: { type: "integer" },
                    description: "1-indexed positions of similar markets from the list"
                  },
                  reason: { type: "string", description: "Brief explanation of why markets are similar or not" }
                },
                required: ["similar", "match_indices", "reason"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "report_similarity" } }
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again shortly" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      // On AI failure, allow creation (fail open)
      return new Response(
        JSON.stringify({ similar: false, matches: [], ai_error: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();

    // Extract tool call result
    let result = { similar: false, match_indices: [] as number[], reason: "" };
    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        result = JSON.parse(toolCall.function.arguments);
      }
    } catch (parseErr) {
      console.error("Failed to parse AI response:", parseErr);
      return new Response(
        JSON.stringify({ similar: false, matches: [], parse_error: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map indices back to actual markets
    const matches = (result.match_indices || [])
      .filter((idx: number) => idx >= 1 && idx <= existingMarkets.length)
      .map((idx: number) => {
        const m = existingMarkets[idx - 1];
        return { id: m.id, title: m.title, category: m.category, status: m.status };
      });

    return new Response(
      JSON.stringify({
        similar: result.similar && matches.length > 0,
        matches,
        reason: result.reason,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-market-similarity error:", err);
    return new Response(
      JSON.stringify({ error: getErrorMessage(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
