// Allocates / fetches the caller's permanent BEP20 deposit address.
// Derives address via HD path m/44'/60'/0'/0/{index} from BSC_DEPOSIT_MASTER_SEED.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { mnemonicToAccount, HDKey, privateKeyToAccount } from "https://esm.sh/viem@2.21.0/accounts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function deriveAddress(seed: string, index: number): string {
  const trimmed = seed.trim();
  // hex seed (32 bytes) → treat as raw private key for index 0; otherwise mnemonic
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(trimmed)) {
    // Single key mode: index encoded into a derivation by hashing — not ideal.
    // We REQUIRE a mnemonic in production for multi-user. Throw to surface misconfig.
    throw new Error("BSC_DEPOSIT_MASTER_SEED must be a BIP39 mnemonic for multi-user derivation");
  }
  const account = mnemonicToAccount(trimmed, { addressIndex: index });
  return account.address;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const seed = Deno.env.get("BSC_DEPOSIT_MASTER_SEED");
    if (!seed) throw new Error("BSC_DEPOSIT_MASTER_SEED not configured");

    const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
    const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SR);

    // Fast path: existing row
    const { data: existing } = await admin
      .from("bsc_deposit_addresses")
      .select("address, hd_index")
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ address: existing.address }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Allocate next index atomically
    const { data: idxData, error: idxErr } = await admin.rpc("allocate_bsc_deposit_index", { _user_id: user.id });
    if (idxErr) throw idxErr;
    const hdIndex = Number(idxData);
    const address = deriveAddress(seed, hdIndex);

    const { data: row, error: regErr } = await admin.rpc("register_bsc_deposit_address", {
      _user_id: user.id, _hd_index: hdIndex, _address: address,
    });
    if (regErr) throw regErr;

    const addr = Array.isArray(row) ? row[0]?.address : (row as any)?.address;
    return new Response(JSON.stringify({ address: addr ?? address }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("get-bsc-deposit-address error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
