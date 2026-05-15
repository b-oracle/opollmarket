import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCronSecret } from "../_shared/cronAuth.ts";
import { getErrorMessage } from "../_shared/errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronCheck = verifyCronSecret(req, { functionName: "check-maintenance-schedule", corsHeaders });
  if (!cronCheck.ok) return cronCheck.response!;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date().toISOString();

    // Auto-enable: scheduled_start has passed, scheduled_end in future, currently disabled
    const { data: toEnable } = await supabase
      .from("feature_toggles")
      .select("id, feature_key, label")
      .eq("feature_key", "maintenance_mode")
      .eq("enabled", false)
      .not("scheduled_start", "is", null)
      .not("scheduled_end", "is", null)
      .lte("scheduled_start", now)
      .gte("scheduled_end", now);

    if (toEnable && toEnable.length > 0) {
      await supabase
        .from("feature_toggles")
        .update({ enabled: true, updated_at: now })
        .eq("feature_key", "maintenance_mode")
        .eq("enabled", false)
        .lte("scheduled_start", now)
        .gte("scheduled_end", now);

      console.log("Maintenance mode auto-enabled");
    }

    // Auto-disable: scheduled_end has passed, currently enabled
    const { data: toDisable } = await supabase
      .from("feature_toggles")
      .select("id, feature_key, label")
      .eq("feature_key", "maintenance_mode")
      .eq("enabled", true)
      .not("scheduled_end", "is", null)
      .lt("scheduled_end", now);

    if (toDisable && toDisable.length > 0) {
      await supabase
        .from("feature_toggles")
        .update({
          enabled: false,
          updated_at: now,
          scheduled_start: null,
          scheduled_end: null,
        })
        .eq("feature_key", "maintenance_mode")
        .eq("enabled", true)
        .lt("scheduled_end", now);

      console.log("Maintenance mode auto-disabled, schedule cleared");
    }

    return new Response(
      JSON.stringify({ enabled: toEnable?.length ?? 0, disabled: toDisable?.length ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-maintenance-schedule error:", err);
    return new Response(JSON.stringify({ error: (getErrorMessage(err)) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
