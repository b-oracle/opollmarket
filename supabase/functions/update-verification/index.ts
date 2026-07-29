import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RPCS = [
  "https://bsc-dataseed.binance.org",
  "https://bsc-dataseed1.defibit.io",
  "https://bsc-dataseed1.ninicoin.io",
];
const BALANCE_OF = "0x70a08231";

/** Direct on-chain balanceOf. Returns null when every RPC endpoint fails. */
async function balanceOf(contract: string, wallet: string): Promise<bigint | null> {
  const data = BALANCE_OF + wallet.slice(2).toLowerCase().padStart(64, "0");
  for (const rpc of RPCS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: contract, data }, "latest"],
        }),
      });
      const json = await res.json();
      if (json?.result && json.result !== "0x") return BigInt(json.result);
    } catch (_err) {
      // try next endpoint
    }
  }
  return null;
}


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
      .select("wallet_address, avatar_url")
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
      .select("min_token_balance, min_gold_token_balance, token_contract_address, token_decimals, nft_contract_address, min_nft_balance")
      .limit(1)
      .single();

    const minTokenBalance = Number(settings?.min_token_balance) || 10_000_000;
    const minGoldTokenBalance = Number(settings?.min_gold_token_balance) || 100_000_000;
    const tokenContractAddress = settings?.token_contract_address || "";
    const tokenDecimals = Number(settings?.token_decimals) || 18;
    const nftContractAddress = (settings?.nft_contract_address || "").toLowerCase();
    const minNftBalance = Number(settings?.min_nft_balance) || 1;

    let hasNft = false;
    let hasTokens = false;
    let hasGoldTokens = false;

    if (profile.wallet_address) {
      // Check NFT ownership in wallet
      if (nftContractAddress) {
        try {
          const { data: nftData } = await adminClient.functions.invoke("fetch-wallet-nfts", {
            body: { wallet_address: profile.wallet_address, nft_contract_address: nftContractAddress },
          });
          const nfts = nftData?.nfts || [];
          const matchingNfts = nfts.filter(
            (n: any) => n.token_address?.toLowerCase() === nftContractAddress
          );
          hasNft = matchingNfts.length >= minNftBalance;
        } catch (err) {
          console.error("NFT ownership check failed:", err);
        }
      }

      // Check token balance
      if (tokenContractAddress) {
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
          hasGoldTokens = balance >= minGoldTokenBalance;
        } catch (err) {
          console.error("Token balance check failed:", err);
        }
      }
    }

    // Determine verification level
    // NFT ownership alone grants blue tick; gold requires NFT + gold-tier token balance
    let level = "none";
    if (hasNft && hasGoldTokens) {
      level = "gold";
    } else if (hasNft || hasTokens) {
      level = "blue";
    }

    // Update profile
    await adminClient
      .from("profiles")
      .update({ verification_level: level })
      .eq("id", user.id);

    return new Response(
      JSON.stringify({ success: true, level, has_nft: hasNft, has_tokens: hasTokens }),
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
