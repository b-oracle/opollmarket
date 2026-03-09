import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
        status: 401, headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: corsHeaders,
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get user profile
    const { data: profile } = await adminClient
      .from("profiles")
      .select("avatar_url, wallet_address")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404, headers: corsHeaders,
      });
    }

    // Get commission settings for thresholds
    const { data: settings } = await adminClient
      .from("commission_settings")
      .select("min_token_balance, token_contract_address, token_decimals, nft_contract_address")
      .limit(1)
      .single();

    const minTokenBalance = Number(settings?.min_token_balance) || 10_000_000;
    const tokenContractAddress = settings?.token_contract_address || "";
    const tokenDecimals = Number(settings?.token_decimals) || 18;

    // Check NFT avatar (external URL = NFT)
    const hasNftAvatar = !!profile.avatar_url && !profile.avatar_url.includes("/storage/v1/");

    // Check token balance if wallet is connected
    let hasTokens = false;
    if (profile.wallet_address && tokenContractAddress) {
      try {
        const { data: tokenData } = await adminClient.functions.invoke("check-token-balance", {
          body: {
            wallet_address: profile.wallet_address,
            token_contract_address: tokenContractAddress,
            token_decimals: tokenDecimals,
          },
        });
        const balance = Number(tokenData?.balance) || 0;
        hasTokens = balance >= minTokenBalance;
      } catch (err) {
        console.error("Token balance check failed:", err);
      }
    }

    // Determine verification level
    let level = "none";
    if (hasNftAvatar && hasTokens) {
      level = "gold";
    } else if (hasNftAvatar || hasTokens) {
      level = "blue";
    }

    // Update profile
    await adminClient
      .from("profiles")
      .update({ verification_level: level })
      .eq("id", user.id);

    return new Response(
      JSON.stringify({ success: true, level, has_nft: hasNftAvatar, has_tokens: hasTokens }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("update-verification error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
