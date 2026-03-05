import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BSC_RPC = "https://bsc-dataseed1.binance.org";

// ERC-20 balanceOf(address) selector
const BALANCE_OF_SELECTOR = "0x70a08231";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { wallet_address, token_contract_address, token_decimals = 18 } = await req.json();

    if (!wallet_address || !token_contract_address) {
      return new Response(
        JSON.stringify({ error: "wallet_address and token_contract_address are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate addresses
    const addrRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!addrRegex.test(wallet_address) || !addrRegex.test(token_contract_address)) {
      return new Response(
        JSON.stringify({ error: "Invalid address format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Encode balanceOf call: selector + address padded to 32 bytes
    const paddedAddress = wallet_address.slice(2).toLowerCase().padStart(64, "0");
    const callData = BALANCE_OF_SELECTOR + paddedAddress;

    // Query BSC RPC
    const rpcResponse = await fetch(BSC_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [
          { to: token_contract_address, data: callData },
          "latest",
        ],
        id: 1,
      }),
    });

    const rpcData = await rpcResponse.json();

    if (rpcData.error) {
      console.error("BSC RPC error:", rpcData.error);
      return new Response(
        JSON.stringify({ error: "RPC call failed", detail: rpcData.error.message }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the hex result — raw balance in smallest unit
    const rawHex = rpcData.result;
    const rawBalance = BigInt(rawHex || "0x0");

    // Use configurable decimals
    const decimals = Math.min(Math.max(Number(token_decimals) || 18, 0), 18);
    const divisor = BigInt(10 ** decimals);
    const wholeUnits = rawBalance / divisor;
    const formatted = Number(wholeUnits);

    return new Response(
      JSON.stringify({
        balance: formatted,
        raw_balance: rawBalance.toString(),
        wallet_address,
        token_contract_address,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-token-balance error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
