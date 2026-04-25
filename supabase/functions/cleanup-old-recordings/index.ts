import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Find spaces with recordings older than 30 days
    const { data: expired, error: fetchErr } = await supabase
      .from("spaces")
      .select("id, recording_url")
      .not("recording_url", "is", null)
      .lt("ended_at", cutoff);

    if (fetchErr) throw fetchErr;

    if (!expired || expired.length === 0) {
      return new Response(
        JSON.stringify({ deleted: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract storage paths from URLs
    const storagePaths = expired
      .map((s: any) => {
        try {
          const url = new URL(s.recording_url);
          const match = url.pathname.match(/\/space-recordings\/(.+)$/);
          return match ? match[1] : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as string[];

    // Delete files from storage
    if (storagePaths.length > 0) {
      await supabase.storage.from("space-recordings").remove(storagePaths);
    }

    // Clear recording_url on spaces
    const ids = expired.map((s: any) => s.id);
    await supabase
      .from("spaces")
      .update({ recording_url: null, is_recorded: false } as any)
      .in("id", ids);

    console.log(`cleanup-old-recordings: cleaned ${ids.length} recordings older than 30 days`);

    return new Response(
      JSON.stringify({ deleted: ids.length, cutoff }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("cleanup-old-recordings error:", err);
    return new Response(
      JSON.stringify({ error: (err instanceof Error ? err.message : String(err)) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
