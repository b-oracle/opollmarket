import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { replayDeposit } from "./replayDeposit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Super-admin only: replay a missed/stuck NOWPayments deposit webhook.
 *
 * This endpoint does NOT blindly credit the user. It fetches the real payment
 * status from NOWPayments, runs the same deviation classification as the live
 * webhook, and only auto-credits `normal` and bounded `overpayment` deposits.
 * Wrong-asset / partial / excessive overpayments are flagged for admin review
 * with no balance change.
 *
 * Pure logic lives in ./replayDeposit.ts so it can be exercised by tests
 * without hitting NOWPayments or the database.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: isSuper } = await admin.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
    if (!isSuper) return json({ error: "Forbidden: super_admin required" }, 403);

    const body = await req.json().catch(() => ({}));
    const {
      transaction_id, payment_id,
      manual_override, manual_reference, manual_note,
    } = body as {
      transaction_id?: string; payment_id?: string;
      manual_override?: boolean; manual_reference?: string; manual_note?: string;
    };

    const result = await replayDeposit(
      admin,
      fetch,
      Deno.env.get("NOWPAYMENTS_API_KEY"),
      {
        actorId: user.id,
        transactionId: transaction_id,
        paymentId: payment_id,
        manualOverride: manual_override === true,
        manualReference: manual_reference,
        manualNote: manual_note,
      },
      {
        payazaSecretKey: Deno.env.get("PAYAZA_SECRET_KEY"),
        payazaTenantId: Deno.env.get("PAYAZA_TENANT_ID"),
      },
    );
    return json(result.body, result.status);
  } catch (err) {
    console.error("replay-deposit-webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
