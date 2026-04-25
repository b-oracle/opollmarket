import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getErrorMessage } from "../_shared/errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // Find status updates with images older than 90 days
    const { data: expired, error: fetchErr } = await supabase
      .from("status_updates")
      .select("id, image_url")
      .not("image_url", "is", null)
      .lt("created_at", cutoff)
      .limit(500);

    if (fetchErr) throw fetchErr;

    if (!expired || expired.length === 0) {
      return new Response(
        JSON.stringify({ deleted: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract storage paths
    const storagePaths = expired
      .map((s: any) => {
        try {
          const url = new URL(s.image_url);
          const match = url.pathname.match(/\/social-media\/(.+)$/);
          return match ? match[1] : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as string[];

    // Delete files from storage
    if (storagePaths.length > 0) {
      await supabase.storage.from("social-media").remove(storagePaths);
    }

    // Clear image_url on status updates
    const ids = expired.map((s: any) => s.id);
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      await supabase
        .from("status_updates")
        .update({ image_url: null } as any)
        .in("id", batch);
    }

    console.log(`cleanup-old-social-media: cleaned ${ids.length} images older than 90 days`);

    return new Response(
      JSON.stringify({ deleted: ids.length, cutoff }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("cleanup-old-social-media error:", err);
    return new Response(
      JSON.stringify({ error: (getErrorMessage(err)) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
