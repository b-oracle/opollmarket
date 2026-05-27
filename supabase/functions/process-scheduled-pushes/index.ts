import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCronSecret } from "../_shared/cronAuth.ts";
import { getErrorMessage } from "../_shared/errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronCheck = verifyCronSecret(req, { functionName: "process-scheduled-pushes", corsHeaders });
  if (!cronCheck.ok) return cronCheck.response!;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch all scheduled pushes that are due
    const { data: pendingPushes, error: fetchError } = await supabase
      .from("scheduled_aimtell_pushes")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(20);

    if (fetchError) {
      console.error("Error fetching scheduled pushes:", fetchError);
      throw fetchError;
    }

    if (!pendingPushes || pendingPushes.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let failed = 0;

    for (const push of pendingPushes) {
      try {
        // Call aimtell-push edge function
        const { error: invokeError } = await supabase.functions.invoke("aimtell-push", {
          headers: { "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "" },
          body: {
            title: push.title,
            body: push.body,
            url: push.url,
            segment_id: push.segment_id || undefined,
            broadcast_all: push.broadcast_all || false,
          },
        });

        if (invokeError) {
          throw invokeError;
        }

        // Mark as sent
        await supabase
          .from("scheduled_aimtell_pushes")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", push.id);

        processed++;
      } catch (err) {
        console.error(`Failed to send push ${push.id}:`, err);
        await supabase
          .from("scheduled_aimtell_pushes")
          .update({
            status: "failed",
            error_message: getErrorMessage(err),
          })
          .eq("id", push.id);
        failed++;
      }
    }

    console.log(`Processed ${processed} pushes, ${failed} failed`);

    return new Response(JSON.stringify({ processed, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("process-scheduled-pushes error:", err);
    return new Response(JSON.stringify({ error: getErrorMessage(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
