import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

    const { type, market_title, market_category, user_hint, caption, market_id } = await req.json();

    if (!type || !["caption", "image"].includes(type)) {
      return new Response(JSON.stringify({ error: "type must be 'caption' or 'image'" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Get cost
    const { data: settings } = await adminClient
      .from("commission_settings")
      .select("ai_generation_cost")
      .limit(1)
      .single();

    const cost = Number(settings?.ai_generation_cost ?? 0.5);

    // Check and deduct balance atomically
    // First check available balance
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

    // Atomic debit
    const { data: debitResult } = await adminClient.rpc("debit_balance_atomic", {
      _user_id: user.id,
      _main_deduct: mainDeduct,
      _bonus_deduct: bonusDeduct,
    });

    if (!debitResult?.success) {
      return new Response(JSON.stringify({ error: debitResult?.error || "Failed to deduct balance" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const refund = async () => {
      await adminClient.rpc("adjust_balance", { _user_id: user.id, _delta: mainDeduct, _bonus_delta: bonusDeduct });
    };

    // Record transaction
    await adminClient.from("transactions").insert({
      user_id: user.id,
      type: "buy",
      amount: cost,
      status: "confirmed",
      side: type === "caption" ? "ai_social_caption" : "ai_social_image",
    });

    // ─── CAPTION GENERATION ───
    if (type === "caption") {
      const topic = market_title || user_hint || "";
      if (!topic.trim()) {
        await refund();
        return new Response(JSON.stringify({ error: "Provide a market or some text to generate a caption from" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

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
              content:
                "You are a witty social media writer for a prediction market platform. Generate a short, engaging post caption (max 280 characters). Be bold, opinionated, and conversational. Use emojis sparingly. Do NOT use hashtags. Do NOT use quotes around the output.",
            },
            {
              role: "user",
              content: `Write a social post caption about: "${topic.trim()}"${market_category ? ` (Category: ${market_category})` : ""}${user_hint ? `\nUser's draft: "${user_hint.trim()}"` : ""}`,
            },
          ],
        }),
      });

      if (!aiResponse.ok) {
        await refund();
        const errMsg = aiResponse.status === 429 ? "AI is temporarily busy — please wait a few seconds and try again" : aiResponse.status === 402 ? "AI credits exhausted" : "Caption generation failed. You have been refunded.";
        return new Response(JSON.stringify({ error: errMsg }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiData = await aiResponse.json();
      const content = (aiData.choices?.[0]?.message?.content || "").slice(0, 280);

      return new Response(JSON.stringify({ content, cost }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── IMAGE GENERATION ───
    if (type === "image") {
      const prompt = caption || market_title || "";
      if (!prompt.trim()) {
        await refund();
        return new Response(JSON.stringify({ error: "Provide caption text to generate an image from" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

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
              content: `Generate a visually striking, professional social media post image about: "${prompt.trim()}". The image should be eye-catching, relevant to the topic, and suitable as a social post image. Do NOT include any text in the image. Make it photorealistic and high quality. Use vibrant colors and strong composition.`,
            },
          ],
          modalities: ["image", "text"],
        }),
      });

      if (!aiResponse.ok) {
        await refund();
        const errMsg = aiResponse.status === 429 ? "AI is temporarily busy — please wait a few seconds and try again" : aiResponse.status === 402 ? "AI credits exhausted" : "Image generation failed. You have been refunded.";
        return new Response(JSON.stringify({ error: errMsg }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiData = await aiResponse.json();
      const imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

      if (!imageUrl || !imageUrl.startsWith("data:image")) {
        await refund();
        return new Response(JSON.stringify({ error: "No image was generated. You have been refunded." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Upload to social-media bucket
      const base64Data = imageUrl.split(",")[1];
      const mimeMatch = imageUrl.match(/data:(image\/\w+);/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
      const ext = mimeType.split("/")[1] || "png";
      const fileName = `${user.id}/ai-social-${Date.now()}.${ext}`;

      const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

      const { error: uploadErr } = await adminClient.storage
        .from("social-media")
        .upload(fileName, binaryData, { contentType: mimeType, upsert: true });

      if (uploadErr) {
        console.error("Storage upload error:", uploadErr);
        await refund();
        return new Response(JSON.stringify({ error: "Failed to save image. You have been refunded." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: urlData } = adminClient.storage.from("social-media").getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      // If market_id provided, also update the market image
      if (market_id) {
        await adminClient
          .from("markets")
          .update({ image_url: publicUrl, updated_at: new Date().toISOString() })
          .eq("id", market_id)
          .eq("creator_wallet", user.id);
      }

      return new Response(JSON.stringify({ imageUrl: publicUrl, cost }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid type" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-social-content error:", err);
    return new Response(
      JSON.stringify({ error: getErrorMessage(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
