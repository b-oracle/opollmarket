import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getErrorMessage } from "../_shared/errors.ts";
import { requireAuthAndRateLimit } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireAuthAndRateLimit(req, { perMinute: 15 });
  if (!auth.ok) return auth.response;

  try {
    const { image_url } = await req.json();

    if (!image_url || typeof image_url !== "string") {
      return new Response(
        JSON.stringify({ error: "image_url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an image moderation system. Analyze the image for:
1. Nudity or sexually explicit content
2. Gore, graphic violence, or disturbing imagery
3. Hate symbols or extremist imagery
4. Drug paraphernalia or illegal substance imagery

Be reasonable — memes, news photos, crypto logos, sports images, and normal photos are FINE.
Only flag genuinely inappropriate, harmful, or NSFW content.`
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Moderate this image:" },
              { type: "image_url", image_url: { url: image_url } }
            ]
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "moderation_result",
              description: "Report image moderation result",
              parameters: {
                type: "object",
                properties: {
                  flagged: { type: "boolean", description: "True if image violates guidelines" },
                  category: { type: "string", enum: ["nsfw", "violence", "hate", "drugs", "safe"], description: "Category of violation or safe" },
                  reason: { type: "string", description: "Brief reason if flagged" }
                },
                required: ["flagged", "category", "reason"],
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
    let result = { flagged: false, category: "safe", reason: "" };
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
      JSON.stringify({ flagged: result.flagged, category: result.category || "safe", reason: result.reason || "" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("moderate-image error:", err);
    return new Response(
      JSON.stringify({ error: getErrorMessage(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
