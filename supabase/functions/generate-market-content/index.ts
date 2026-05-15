import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

  // Per-user rate limit (cold-start in-memory) — protects against AI cost abuse.
  const rl = await requireAuthAndRateLimit(req, { perMinute: 10 });
  if (!rl.ok) return rl.response;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Please sign in to use AI generation" }), {
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
      return new Response(JSON.stringify({ error: "Please sign in to use AI generation" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { type, title, category, marketType, options } = await req.json();

    if (!type || !title?.trim()) {
      return new Response(JSON.stringify({ error: "type and title are required" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get AI generation cost from settings
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: settings } = await adminClient
      .from("commission_settings")
      .select("ai_generation_cost")
      .limit(1)
      .single();

    const cost = Number(settings?.ai_generation_cost ?? 0.5);

    // Check and deduct balance (bonus first, then main)
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
      return new Response(JSON.stringify({ error: `Insufficient balance for AI generation. You need $${cost} but have $${(bonus + main).toFixed(2)}.` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Atomic deduct: bonus first, then main (prevents TOCTOU double-spend).
    const bonusDeduct = Math.min(bonus, cost);
    const mainDeduct = cost - bonusDeduct;

    const { data: debitResult } = await adminClient.rpc("debit_balance_atomic", {
      _user_id: user.id,
      _main_deduct: mainDeduct,
      _bonus_deduct: bonusDeduct,
    });

    if (!debitResult?.success) {
      return new Response(JSON.stringify({ error: debitResult?.error || "Failed to deduct balance. Please try again." }), {
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
      side: type === "description" ? "ai_description" : type === "details" ? "ai_details" : "ai_image",
    });

    // Generate content based on type
    if (type === "description" || type === "details") {
      const systemPrompt = type === "description"
        ? `You are an expert prediction market creator. Generate a clear, concise description (2-4 sentences) for a prediction market based on the given question/title. The description should explain how the market resolves — what conditions make it YES vs NO. Be specific about data sources and edge cases. Do NOT use markdown formatting. Keep it under 400 characters.`
        : `You are an expert prediction market analyst. Generate detailed background information and context for a prediction market. Include:
- Key background facts and context
- Why this prediction matters
- Important factors that could influence the outcome
- Any relevant dates, thresholds, or criteria

Use markdown formatting (headers, bullet points, bold). Keep it between 200-800 characters. Be informative but concise.`;

      const userPrompt = type === "description"
        ? `Market Question: "${title.trim()}"${category ? `\nCategory: ${category}` : ""}${marketType ? `\nMarket Type: ${marketType}` : ""}${options?.length ? `\nOptions: ${options.join(", ")}` : ""}\n\nGenerate a description that explains how this market resolves.`
        : `Market Question: "${title.trim()}"${category ? `\nCategory: ${category}` : ""}${marketType ? `\nMarket Type: ${marketType}` : ""}${options?.length ? `\nOptions: ${options.join(", ")}` : ""}\n\nGenerate detailed background context and analysis for this prediction market.`;

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!aiResponse.ok) {
        // Refund on AI failure
        await adminClient
          .from("balances")
          .update({
            bonus_balance: bonus,
            amount: main,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id)
          .eq("currency", "USDT");

        if (aiResponse.status === 429) {
          return new Response(JSON.stringify({ error: "AI is temporarily busy — please wait a few seconds and try again" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (aiResponse.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ error: "AI generation failed. You have been refunded." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiData = await aiResponse.json();
      const content = aiData.choices?.[0]?.message?.content || "";

      return new Response(JSON.stringify({ content, cost }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "image") {
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-image-preview",
          messages: [
            {
              role: "user",
              content: `Generate a visually striking, professional cover image for a prediction market with the question: "${title.trim()}". ${category ? `Category: ${category}.` : ""} The image should be eye-catching, relevant to the topic, and suitable as a banner/cover image. Do NOT include any text in the image. Make it photorealistic and high quality. Use vibrant colors and strong composition.`,
            },
          ],
          modalities: ["image", "text"],
        }),
      });

      if (!aiResponse.ok) {
        // Refund on AI failure
        await adminClient
          .from("balances")
          .update({
            bonus_balance: bonus,
            amount: main,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id)
          .eq("currency", "USDT");

        if (aiResponse.status === 429) {
          return new Response(JSON.stringify({ error: "AI is temporarily busy — please wait a few seconds and try again" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (aiResponse.status === 402) {
          return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ error: "Image generation failed. You have been refunded." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiData = await aiResponse.json();
      const imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

      if (!imageUrl || !imageUrl.startsWith("data:image")) {
        // Refund
        await adminClient
          .from("balances")
          .update({
            bonus_balance: bonus,
            amount: main,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id)
          .eq("currency", "USDT");

        return new Response(JSON.stringify({ error: "No image was generated. You have been refunded." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Upload base64 image to storage
      const base64Data = imageUrl.split(",")[1];
      const mimeMatch = imageUrl.match(/data:(image\/\w+);/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
      const ext = mimeType.split("/")[1] || "png";
      const fileName = `ai-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

      const { error: uploadErr } = await adminClient.storage
        .from("market-images")
        .upload(fileName, binaryData, { contentType: mimeType });

      if (uploadErr) {
        console.error("Storage upload error:", uploadErr);
        // Refund
        await adminClient
          .from("balances")
          .update({
            bonus_balance: bonus,
            amount: main,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id)
          .eq("currency", "USDT");

        return new Response(JSON.stringify({ error: "Failed to save generated image. You have been refunded." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: urlData } = adminClient.storage.from("market-images").getPublicUrl(fileName);

      return new Response(JSON.stringify({ imageUrl: urlData.publicUrl, cost }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid type. Use description, details, or image." }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-market-content error:", err);
    return new Response(
      JSON.stringify({ error: getErrorMessage(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
