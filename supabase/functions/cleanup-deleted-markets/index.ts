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

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Find soft-deleted markets older than 24 hours
    const { data: expiredMarkets, error: fetchErr } = await supabase
      .from("markets")
      .select("id, title")
      .eq("status", "deleted")
      .lt("updated_at", cutoff);

    if (fetchErr) throw fetchErr;

    if (!expiredMarkets || expiredMarkets.length === 0) {
      return new Response(
        JSON.stringify({ deleted: 0, message: "No expired soft-deleted markets" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ids = expiredMarkets.map((m) => m.id);

    // Delete related market_options first
    await supabase.from("market_options").delete().in("market_id", ids);

    // Hard-delete the markets
    const { error: delErr } = await supabase
      .from("markets")
      .delete()
      .in("id", ids);

    if (delErr) throw delErr;

    console.log(`cleanup-deleted-markets: permanently removed ${ids.length} markets`);

    return new Response(
      JSON.stringify({ deleted: ids.length, market_ids: ids }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("cleanup-deleted-markets error:", err);
    return new Response(
      JSON.stringify({ error: (err instanceof Error ? err.message : String(err)) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
