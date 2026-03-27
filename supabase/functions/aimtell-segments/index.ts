const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const AIMTELL_API_KEY = (Deno.env.get("AIMTELL_API_KEY") || "").trim().replace(/['"]/g, "");
    const AIMTELL_SITE_ID = (Deno.env.get("AIMTELL_SITE_ID") || "").trim().replace(/['"]/g, "");

    if (!AIMTELL_API_KEY) throw new Error("AIMTELL_API_KEY is not configured");
    if (!AIMTELL_SITE_ID || isNaN(Number(AIMTELL_SITE_ID))) throw new Error("AIMTELL_SITE_ID is not configured or invalid");

    const response = await fetch(`https://api.aimtell.com/prod/segments/${AIMTELL_SITE_ID}`, {
      method: "GET",
      headers: {
        "X-Authorization-Api-Key": AIMTELL_API_KEY,
        "Content-Type": "application/json",
      },
    });

    const raw = await response.text();
    let data: unknown = raw;
    try { data = JSON.parse(raw); } catch { /* keep raw */ }

    if (!response.ok) {
      console.error("Aimtell segments error:", response.status, raw);
      return new Response(JSON.stringify({ error: "Failed to fetch segments", details: data }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ segments: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("aimtell-segments error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
