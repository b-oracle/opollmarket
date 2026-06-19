import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mnemonicToAccount } from "https://esm.sh/viem@2.21.0/accounts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const USDT_BSC_CONTRACT = "0x55d398326f99059ff775485246999027b3197955";

function deriveAddress(seed: string, index: number): string {
  const trimmed = seed.trim();
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error("BSC_DEPOSIT_MASTER_SEED must be a BIP39 mnemonic for multi-user derivation");
  }
  return mnemonicToAccount(trimmed, { addressIndex: index }).address.toLowerCase();
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

    const userId = user.id;
    const { amount, pay_currency } = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch dynamic limits
    const { data: limitsData } = await adminClient
      .from("commission_settings")
      .select("deposit_min_amount, deposit_max_amount")
      .limit(1)
      .single();
    const depositMin = Number(limitsData?.deposit_min_amount) || 1;
    const depositMax = Number(limitsData?.deposit_max_amount) || 50000;

    if (!amount || amount < depositMin || amount > depositMax) {
      return new Response(
        JSON.stringify({ error: `Amount must be between $${depositMin} and $${depositMax.toLocaleString()}` }),
        { status: 400, headers: corsHeaders }
      );
    }

    // --- Spam & block checks ---

    // Check if user is blocked
    const { data: profile } = await adminClient
      .from("profiles")
      .select("is_blocked")
      .eq("id", userId)
      .single();

    if (profile?.is_blocked) {
      return new Response(
        JSON.stringify({ error: "Your account has been restricted. Please contact support." }),
        { status: 403, headers: corsHeaders }
      );
    }

    // Check pending deposit spam (3+ pending = blocked until they expire/complete)
    const { count: pendingCount } = await adminClient
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("type", "deposit")
      .eq("status", "pending");

    if ((pendingCount ?? 0) >= 3) {
      return new Response(
        JSON.stringify({ error: "You have 3 pending deposits. Please wait for them to expire or be processed before creating new ones." }),
        { status: 429, headers: corsHeaders }
      );
    }

    if (pay_currency && String(pay_currency).toLowerCase() !== "usdtbsc") {
      return new Response(JSON.stringify({ error: "Only USDT on BSC is supported for crypto deposits" }), {
        status: 400, headers: corsHeaders,
      });
    }

    const seed = Deno.env.get("BSC_DEPOSIT_MASTER_SEED");
    if (!seed) {
      return new Response(JSON.stringify({ error: "BSC deposit service not configured" }), {
        status: 500, headers: corsHeaders,
      });
    }

    const { data: reserved, error: resErr } = await adminClient
      .rpc("reserve_bsc_deposit_slot", { _user_id: userId });
    if (resErr) throw resErr;
    const row = Array.isArray(reserved) ? reserved[0] : reserved;
    if (!row) throw new Error("reserve_bsc_deposit_slot returned no row");

    let payAddress = row.address as string | undefined;
    if (!payAddress || String(payAddress).startsWith("pending:")) {
      const derived = deriveAddress(seed, Number(row.hd_index));
      const { data: finalized, error: finErr } = await adminClient.rpc("finalize_bsc_deposit_address", {
        _user_id: userId,
        _hd_index: Number(row.hd_index),
        _address: derived,
      });
      if (finErr) throw finErr;
      payAddress = (Array.isArray(finalized) ? finalized[0]?.address : (finalized as any)?.address) ?? derived;
    }

    return new Response(
      JSON.stringify({
        payment_id: null,
        deposit_address: payAddress,
        pay_address: payAddress,
        pay_amount: amount,
        pay_currency: "usdtbsc",
        network: "BSC",
        token_contract: USDT_BSC_CONTRACT,
        payment_status: "address_assigned",
        instructions: "Send USDT on BSC (BEP20) to this permanent deposit address. It will auto-credit after 12 confirmations.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-deposit error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
