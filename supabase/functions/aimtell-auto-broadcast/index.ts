import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getErrorMessage } from "../_shared/errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Auto-broadcast edge function.
 * Called by DB triggers or other functions when events happen
 * (market_created, market_resolved, etc.)
 * Checks aimtell_auto_broadcast_settings for the event type,
 * applies template variables, and fires aimtell-push if enabled.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { event_type, variables } = await req.json() as {
      event_type: string;
      variables?: Record<string, string>;
    };

    if (!event_type) {
      return new Response(JSON.stringify({ error: "event_type is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Check if this event type has auto-broadcast enabled
    const { data: setting, error: settingError } = await supabase
      .from("aimtell_auto_broadcast_settings")
      .select("*")
      .eq("event_type", event_type)
      .eq("enabled", true)
      .maybeSingle();

    if (settingError) {
      console.error("Error fetching auto-broadcast setting:", settingError);
      throw settingError;
    }

    if (!setting) {
      return new Response(JSON.stringify({ skipped: true, reason: "Auto-broadcast not enabled for this event" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Apply template variables
    const vars = variables || {};
    const applyTemplate = (template: string) => {
      return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || `{{${key}}}`);
    };

    const title = applyTemplate(setting.title_template);
    const body = applyTemplate(setting.body_template);
    const url = applyTemplate(setting.url_template || "https://opoll.org");

    if (!setting.segment_id) {
      return new Response(JSON.stringify({
        skipped: true,
        reason: "Auto-broadcast requires a valid Aimtell segment_id",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fire the push via aimtell-push
    const { error: invokeError } = await supabase.functions.invoke("aimtell-push", {
      body: {
        title,
        body,
        url,
        segment_id: setting.segment_id,
      },
    });

    if (invokeError) {
      console.error("Auto-broadcast push failed:", invokeError);
      throw invokeError;
    }

    console.log(`Auto-broadcast sent for ${event_type}: "${title}"`);

    return new Response(JSON.stringify({ success: true, event_type, title }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("aimtell-auto-broadcast error:", err);
    return new Response(JSON.stringify({ error: getErrorMessage(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
