// Allocates / fetches the caller's permanent BEP20 deposit address.
// Uses an atomic reserve+finalize flow so two concurrent requests for the same
// user cannot collide on hd_index.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { mnemonicToAccount } from "https://esm.sh/viem@2.21.0/accounts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function deriveAddress(seed: string, index: number): string {
  const trimmed = seed.trim();
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(trimmed)) {
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

    // 1. Atomically reserve the slot (or return existing finalized address).
    const { data: reserved, error: resErr } = await admin
      .rpc("reserve_bsc_deposit_slot", { _user_id: user.id });
    if (resErr) throw resErr;
    const row = Array.isArray(reserved) ? reserved[0] : reserved;
    if (!row) throw new Error("reserve_bsc_deposit_slot returned no row");

    // Existing finalized address — return immediately.
    if (!row.is_new && row.address && !String(row.address).startsWith("pending:")) {
      return new Response(JSON.stringify({ address: row.address }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Derive and finalize.
    const address = deriveAddress(seed, Number(row.hd_index)).toLowerCase();
    const { data: finalized, error: finErr } = await admin.rpc("finalize_bsc_deposit_address", {
      _user_id: user.id,
      _hd_index: Number(row.hd_index),
      _address: address,
    });
    if (finErr) throw finErr;
    const finalAddr = Array.isArray(finalized) ? finalized[0]?.address : (finalized as any)?.address;

    return new Response(JSON.stringify({ address: finalAddr ?? address }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("get-bsc-deposit-address error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
