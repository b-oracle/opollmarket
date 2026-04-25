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

    // Delete story views for expired stories first
    const { data: expired } = await supabase
      .from("stories")
      .select("id, image_url")
      .lt("expires_at", new Date().toISOString());

    if (expired && expired.length > 0) {
      const expiredIds = expired.map((s: any) => s.id);

      // Delete views
      await supabase.from("story_views").delete().in("story_id", expiredIds);

      // Delete storage images
      const imagePaths = expired
        .filter((s: any) => s.image_url)
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

      if (imagePaths.length > 0) {
        await supabase.storage.from("social-media").remove(imagePaths);
      }

      // Delete stories
      const { count } = await supabase
        .from("stories")
        .delete()
        .in("id", expiredIds);

      return new Response(
        JSON.stringify({ deleted: count || expiredIds.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ deleted: 0 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("cleanup-expired-stories error:", err);
    return new Response(
      JSON.stringify({ error: (getErrorMessage(err)) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
