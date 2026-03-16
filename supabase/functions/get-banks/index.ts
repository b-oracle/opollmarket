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
    const flutterwaveKey = Deno.env.get("FLUTTERWAVE_SECRET_KEY");
    if (!flutterwaveKey) {
      return new Response(
        JSON.stringify({ error: "Flutterwave not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const res = await fetch("https://api.flutterwave.com/v3/banks/NG", {
      headers: { Authorization: `Bearer ${flutterwaveKey}` },
    });

    const data = await res.json();

    if (data.status !== "success" || !Array.isArray(data.data)) {
      console.error("Flutterwave banks error:", data.message);
      return new Response(
        JSON.stringify({ error: "Failed to fetch banks" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return sorted bank list with code and name
    const banks = data.data
      .map((b: any) => ({ code: b.code, name: b.name }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    return new Response(
      JSON.stringify({ banks }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("get-banks error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
