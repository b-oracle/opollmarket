import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getErrorMessage } from "../_shared/errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, description, options } = await req.json();

    if (!title || title.trim().length < 5) {
      return new Response(
        JSON.stringify({ error: "Title is required (min 5 chars)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      // Fail open if AI not configured
      return new Response(
        JSON.stringify({ flagged: false, reason: "" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const optionsText = options?.length
      ? `\nAnswer Options: ${options.join(", ")}`
      : "";

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
            content: `You are a content moderation system for a prediction market platform. Analyze the submitted market for:

1. **Profanity**: Any vulgar, obscene, or offensive language in the title, description, or options.
2. **Adult/NSFW content**: Sexual, nude, pornographic, or explicitly adult themes.
3. **Hate speech**: Racist, sexist, homophobic, or discriminatory language or themes.
4. **Violence**: Glorification of violence, gore, or harm to individuals.
5. **Illegal activity**: Markets about illegal activities (drug trafficking, etc).

Be reasonable — markets about politics, controversial topics, or edgy but legitimate prediction questions are FINE.
Only flag content that is genuinely inappropriate, offensive, or harmful.`
          },
          {
            role: "user",
            content: `Please moderate this prediction market submission:

Title: "${title.trim()}"
Description: "${(description || "").trim()}"${optionsText}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "moderation_result",
              description: "Report content moderation result",
              parameters: {
                type: "object",
                properties: {
                  flagged: {
                    type: "boolean",
                    description: "True if content violates guidelines"
                  },
                  categories: {
                    type: "array",
                    items: { type: "string", enum: ["profanity", "nsfw", "hate_speech", "violence", "illegal"] },
                    description: "Which categories were violated"
                  },
                  reason: {
                    type: "string",
                    description: "Brief explanation of why content was flagged or why it's acceptable"
                  }
                },
                required: ["flagged", "categories", "reason"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "moderation_result" } }
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
      console.error("AI gateway error:", aiResponse.status, await aiResponse.text());
      // Fail open on AI errors
      return new Response(
        JSON.stringify({ flagged: false, reason: "", ai_error: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();

    let result = { flagged: false, categories: [] as string[], reason: "" };
    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        result = JSON.parse(toolCall.function.arguments);
      }
    } catch (parseErr) {
      console.error("Failed to parse AI moderation response:", parseErr);
      return new Response(
        JSON.stringify({ flagged: false, reason: "", parse_error: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        flagged: result.flagged,
        categories: result.categories || [],
        reason: result.reason || "",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("moderate-market-content error:", err);
    return new Response(
      JSON.stringify({ error: getErrorMessage(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
