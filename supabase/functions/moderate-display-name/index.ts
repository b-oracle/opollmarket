import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getErrorMessage } from "../_shared/errors.ts";
import { requireAuthAndRateLimit } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Fast local check for obvious profanity before burning AI credits
const BLOCKED_PATTERNS = [
  /\bn[i1!]gg[aer3]/i, /\bf[u@]ck/i, /\bsh[i1!]t/i, /\bc[u@]nt/i,
  /\bd[i1!]ck/i, /\bp[u@]ssy/i, /\bass\b/i, /\bwh[o0]re/i,
  /\bfagg?[o0]t/i, /\bretard/i, /\bkill\s?(your|ur)self/i,
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireAuthAndRateLimit(req, { perMinute: 20 });
  if (!auth.ok) return auth.response;

  try {
    const { name } = await req.json();

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return new Response(
        JSON.stringify({ flagged: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const trimmed = name.trim();

    // Quick local regex check
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(trimmed)) {
        return new Response(
          JSON.stringify({ flagged: true, reason: "Display name contains inappropriate language" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // AI check for subtle/creative profanity
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
            content: `You are a username moderation system. Check if this display name contains:
1. Profanity, slurs, or vulgar language (including leetspeak/creative spelling)
2. Hate speech or discriminatory terms
3. Sexual or NSFW references
4. Impersonation of admins/staff (e.g. "admin", "moderator", "support")

Normal names, crypto terms, memes, numbers are FINE. Only flag genuinely offensive names.`
          },
          {
            role: "user",
            content: `Check this display name: "${trimmed}"`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "moderation_result",
              description: "Report name moderation result",
              parameters: {
                type: "object",
                properties: {
                  flagged: { type: "boolean", description: "True if name violates guidelines" },
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
      // Fail open on AI errors
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
    console.error("moderate-display-name error:", err);
    return new Response(
      JSON.stringify({ error: getErrorMessage(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
