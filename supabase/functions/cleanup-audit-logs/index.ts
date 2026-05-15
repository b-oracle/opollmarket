import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getErrorMessage } from "../_shared/errors.ts";
import { verifyCronSecret } from "../_shared/cronAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronCheck = verifyCronSecret(req, { functionName: "cleanup-audit-logs", corsHeaders });
  if (!cronCheck.ok) return cronCheck.response!;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const { count, error } = await supabase
      .from("audit_logs")
      .delete()
      .lt("created_at", cutoff);

    if (error) throw error;

    console.log(`cleanup-audit-logs: deleted ${count ?? 0} entries older than 90 days`);

    return new Response(
      JSON.stringify({ deleted: count ?? 0, cutoff }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("cleanup-audit-logs error:", err);
    return new Response(
      JSON.stringify({ error: (getErrorMessage(err)) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
