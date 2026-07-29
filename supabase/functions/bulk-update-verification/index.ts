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
    // Verify caller is admin (or the service role, for cron sweeps)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bearer = authHeader.replace("Bearer ", "").trim();
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isServiceRole = bearer === serviceRoleKey;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey
    );

    if (!isServiceRole) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check admin role
      const { data: roleData } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "super_admin"]);

      if (!roleData || roleData.length === 0) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }


    // Get commission settings
    const { data: settings } = await adminClient
      .from("commission_settings")
      .select("min_token_balance, min_gold_token_balance, token_contract_address, token_decimals, nft_contract_address, min_nft_balance")
      .limit(1)
      .single();

    const minTokenBalance = Number(settings?.min_token_balance) || 10_000_000;
    const minGoldTokenBalance = Number(settings?.min_gold_token_balance) || 100_000_000;
    const tokenContractAddress = settings?.token_contract_address || "";
    const tokenDecimals = Number(settings?.token_decimals) || 18;
    const nftContractAddress = (settings?.nft_contract_address || "").toLowerCase();
    const minNftBalance = Number(settings?.min_nft_balance) || 1;

    // Get all profiles with wallet addresses
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, wallet_address, avatar_url")
      .not("wallet_address", "is", null)
      .neq("wallet_address", "");

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ success: true, updated: 0, message: "No profiles with wallets" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let updated = 0;
    const results: Array<{ id: string; level: string }> = [];

    for (const profile of profiles) {
      let hasNft = false;
      let hasTokens = false;

      // Check NFT
      if (nftContractAddress && profile.wallet_address) {
        try {
          const { data: nftData } = await adminClient.functions.invoke("fetch-wallet-nfts", {
            body: { wallet_address: profile.wallet_address, nft_contract_address: nftContractAddress },
          });
          const nfts = nftData?.nfts || [];
          const matching = nfts.filter(
            (n: any) => n.token_address?.toLowerCase() === nftContractAddress
          );
          hasNft = matching.length >= minNftBalance;
        } catch (err) {
          console.error(`NFT check failed for ${profile.id}:`, err);
        }
      }

      // Check tokens
      let tokenBalance = 0;
      if (tokenContractAddress && profile.wallet_address) {
        try {
          const { data: tokenData } = await adminClient.functions.invoke("check-token-balance", {
            body: {
              wallet_address: profile.wallet_address,
              token_contract_address: tokenContractAddress,
              token_decimals: tokenDecimals,
            },
          });
          tokenBalance = Number(tokenData?.balance) || 0;
          hasTokens = tokenBalance >= minTokenBalance;
        } catch (err) {
          console.error(`Token check failed for ${profile.id}:`, err);
        }
      }

      const hasGoldTokens = tokenBalance >= minGoldTokenBalance;

      let level = "none";
      if (hasNft && hasGoldTokens) level = "gold";
      else if (hasNft || hasTokens) level = "blue";

      await adminClient
        .from("profiles")
        .update({ verification_level: level })
        .eq("id", profile.id);

      results.push({ id: profile.id, level });
      updated++;
    }

    return new Response(
      JSON.stringify({ success: true, updated, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("bulk-update-verification error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
