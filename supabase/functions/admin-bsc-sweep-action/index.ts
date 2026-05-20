// Admin actions for the BSC sweep system.
// - trigger: kick the runner immediately (returns its result)
// - sweep_address: force-queue a single address+token
// - retry: reset a failed job back to queued (or to gas_funded if gas_tx exists)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SR);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
    const roleSet = new Set((roles || []).map((r: any) => r.role));
    if (!roleSet.has("admin") && !roleSet.has("super_admin")) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;

    if (action === "trigger") {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/bsc-sweep-runner`, {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ source: "admin-trigger", actor: userData.user.id }),
      });
      const result = await resp.json().catch(() => ({}));
      return json({ ok: resp.ok, runner: result });
    }

    if (action === "retry") {
      const jobId = body?.job_id as string;
      if (!jobId) return json({ error: "job_id required" }, 400);
      const { data: job } = await admin.from("bsc_sweep_jobs").select("*").eq("id", jobId).maybeSingle();
      if (!job) return json({ error: "job not found" }, 404);
      const nextStatus = job.gas_tx_hash ? "gas_funded" : "queued";
      const { error } = await admin.from("bsc_sweep_jobs").update({
        status: nextStatus,
        attempts: 0,
        last_error: null,
        next_attempt_at: new Date().toISOString(),
      }).eq("id", jobId);
      if (error) return json({ error: error.message }, 500);
      await admin.from("audit_logs").insert({
        actor_id: userData.user.id,
        action: "bsc_sweep_retry",
        target_id: jobId,
        target_type: "bsc_sweep_job",
        details: { previous_status: job.status, new_status: nextStatus },
      });
      return json({ ok: true, status: nextStatus });
    }

    if (action === "sweep_address") {
      const address = (body?.address as string || "").toLowerCase();
      const token = (body?.token as string || "USDT").toUpperCase();
      if (!/^0x[0-9a-f]{40}$/.test(address)) return json({ error: "invalid address" }, 400);
      const { data: addrRow } = await admin
        .from("bsc_deposit_addresses")
        .select("user_id, hd_index, address")
        .eq("address", address)
        .maybeSingle();
      if (!addrRow) return json({ error: "address not in deposit address pool" }, 404);

      const TOKEN_CONTRACTS: Record<string, string> = {
        USDT: "0x55d398326f99059ff775485246999027b3197955",
        USDC: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
      };
      const tokenContract = TOKEN_CONTRACTS[token];
      if (!tokenContract) return json({ error: "unsupported token" }, 400);

      const treasury = (Deno.env.get("BSC_TREASURY_ADDRESS") || "").toLowerCase();
      if (!treasury) return json({ error: "BSC_TREASURY_ADDRESS not configured" }, 500);

      // Skip if an active job already exists
      const { data: existing } = await admin
        .from("bsc_sweep_jobs")
        .select("id, status")
        .eq("address", address)
        .eq("token", token)
        .in("status", ["queued", "gas_funded", "swept"])
        .maybeSingle();
      if (existing) return json({ ok: true, already_queued: true, job_id: existing.id });

      const { data: inserted, error } = await admin.from("bsc_sweep_jobs").insert({
        user_id: addrRow.user_id,
        address,
        hd_index: addrRow.hd_index,
        token,
        token_contract: tokenContract,
        amount_wei: 0,
        amount_usd: 0,
        treasury_address: treasury,
        status: "queued",
      }).select("id").maybeSingle();
      if (error) return json({ error: error.message }, 500);

      await admin.from("audit_logs").insert({
        actor_id: userData.user.id,
        action: "bsc_sweep_manual_queue",
        target_id: inserted?.id ?? null,
        target_type: "bsc_sweep_job",
        details: { address, token },
      });

      return json({ ok: true, job_id: inserted?.id });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("admin-bsc-sweep-action error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
