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

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);

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

    // Thresholds
    const { data: settings } = await adminClient
      .from("commission_settings")
      .select("min_token_balance, min_gold_token_balance, token_contract_address, token_decimals, nft_contract_address, min_nft_balance")
      .limit(1)
      .single();

    const minTokenBalance = BigInt(Math.trunc(Number(settings?.min_token_balance) || 10_000_000));
    const minGoldTokenBalance = BigInt(Math.trunc(Number(settings?.min_gold_token_balance) || 100_000_000));
    const tokenContractAddress = settings?.token_contract_address || "";
    const tokenDecimals = Number(settings?.token_decimals) || 18;
    const nftContractAddress = settings?.nft_contract_address || "";
    const minNftBalance = BigInt(Math.trunc(Number(settings?.min_nft_balance) || 1));
    const unit = 10n ** BigInt(tokenDecimals);

    // Profiles with a wallet
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, wallet_address, verification_level")
      .not("wallet_address", "is", null)
      .neq("wallet_address", "")
      .limit(5000);

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ success: true, updated: 0, checked: 0, message: "No profiles with wallets" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let updated = 0;
    let skipped = 0;
    const results: Array<{ id: string; level: string }> = [];

    const checkOne = async (profile: any) => {
      const wallet: string = (profile.wallet_address || "").trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        skipped++;
        return;
      }

      const [nftRaw, tokenRaw] = await Promise.all([
        nftContractAddress ? balanceOf(nftContractAddress, wallet) : Promise.resolve(0n),
        tokenContractAddress ? balanceOf(tokenContractAddress, wallet) : Promise.resolve(0n),
      ]);

      // Never demote on RPC failure — leave the existing level untouched.
      if (nftRaw === null || tokenRaw === null) {
        skipped++;
        return;
      }

      const nftCount = nftRaw;
      const tokenWhole = tokenRaw / unit;

      const hasNft = nftCount >= minNftBalance;
      const hasTokens = tokenWhole >= minTokenBalance;
      const hasGoldTokens = tokenWhole >= minGoldTokenBalance;

      let level = "none";
      if (hasNft && hasGoldTokens) level = "gold";
      else if (hasNft || hasTokens) level = "blue";

      if (level !== profile.verification_level) {
        await adminClient.from("profiles").update({ verification_level: level }).eq("id", profile.id);
        updated++;
        results.push({ id: profile.id, level });
      }
    };

    // Bounded concurrency
    const CONCURRENCY = 10;
    for (let i = 0; i < profiles.length; i += CONCURRENCY) {
      await Promise.all(profiles.slice(i, i + CONCURRENCY).map(checkOne));
    }

    console.log(
      `Verification sweep: ${profiles.length} wallets checked, ${updated} changed, ${skipped} skipped`
    );

    return new Response(
      JSON.stringify({ success: true, checked: profiles.length, updated, skipped, results }),
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
