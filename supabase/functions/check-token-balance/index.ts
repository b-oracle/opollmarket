import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getErrorMessage } from "../_shared/errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BSC_RPC = "https://bsc-dataseed1.binance.org";

// ERC-20 function selectors
const BALANCE_OF_SELECTOR = "0x70a08231"; // balanceOf(address)
const DECIMALS_SELECTOR = "0x313ce567";   // decimals()

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

    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const isServiceRole = token === serviceRoleKey;

    if (!isServiceRole) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

    // Make both RPC calls in parallel: balanceOf + decimals
    const paddedAddress = wallet_address.slice(2).toLowerCase().padStart(64, "0");
    const balanceCallData = BALANCE_OF_SELECTOR + paddedAddress;

    const [balanceRes, decimalsRes] = await Promise.all([
      fetch(BSC_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", method: "eth_call",
          params: [{ to: token_contract_address, data: balanceCallData }, "latest"],
          id: 1,
        }),
      }),
      fetch(BSC_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", method: "eth_call",
          params: [{ to: token_contract_address, data: DECIMALS_SELECTOR }, "latest"],
          id: 2,
        }),
      }),
    ]);

    const [balanceData, decimalsData] = await Promise.all([
      balanceRes.json(),
      decimalsRes.json(),
    ]);

    if (balanceData.error) {
      console.error("BSC RPC balance error:", balanceData.error);
      return new Response(
        JSON.stringify({ error: "RPC call failed", detail: balanceData.error.message }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auto-detect decimals from on-chain, fall back to passed value or 18
    let decimals = Number(token_decimals) || 18;
    if (decimalsData.result && !decimalsData.error) {
      const onChainDecimals = Number(BigInt(decimalsData.result));
      if (onChainDecimals >= 0 && onChainDecimals <= 18) {
        decimals = onChainDecimals;
      }
    }

    const rawBalance = BigInt(balanceData.result || "0x0");
    const divisor = BigInt(10 ** decimals);
    const wholeUnits = rawBalance / divisor;
    const formatted = Number(wholeUnits);

    return new Response(
      JSON.stringify({
        balance: formatted,
        raw_balance: rawBalance.toString(),
        decimals,
        wallet_address,
        token_contract_address,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-token-balance error:", err);
    return new Response(
      JSON.stringify({ error: getErrorMessage(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
