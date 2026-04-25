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
    const { content } = await req.json();

    if (!content || content.trim().length === 0) {
      return new Response(
        JSON.stringify({ flagged: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ flagged: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
            content: `You are a comment moderation system. Analyze the comment for:
1. Profanity or vulgar language
2. Hate speech, slurs, or discriminatory language
3. Sexual or NSFW content
4. Threats or glorification of violence
5. Spam or gibberish

Be reasonable — mild expressions, slang, and heated but civil debate are FINE.
Only flag genuinely offensive, harmful, or inappropriate content.`
          },
          {
            role: "user",
            content: `Moderate this comment: "${content.trim()}"`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "moderation_result",
              description: "Report comment moderation result",
              parameters: {
                type: "object",
                properties: {
                  flagged: { type: "boolean", description: "True if comment violates guidelines" },
                  reason: { type: "string", description: "Brief reason if flagged" }
                },
                required: ["flagged", "reason"],
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
        return new Response(JSON.stringify({ error: "Rate limited, try again shortly" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI gateway error:", aiResponse.status);
      return new Response(
        JSON.stringify({ flagged: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    let result = { flagged: false, reason: "" };
    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        result = JSON.parse(toolCall.function.arguments);
      }
    } catch {
      return new Response(
        JSON.stringify({ flagged: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ flagged: result.flagged, reason: result.reason || "" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("moderate-comment error:", err);
    return new Response(
      JSON.stringify({ error: getErrorMessage(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
