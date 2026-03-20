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
    const AIMTELL_API_KEY = Deno.env.get("AIMTELL_API_KEY");
    const AIMTELL_SITE_ID = Deno.env.get("AIMTELL_SITE_ID");

    if (!AIMTELL_API_KEY) {
      throw new Error("AIMTELL_API_KEY is not configured");
    }
    if (!AIMTELL_SITE_ID) {
      throw new Error("AIMTELL_SITE_ID is not configured");
    }

    const { title, body, url, segment_id, subscriber_uids, alias, broadcast_all } = await req.json();

    if (!title) {
      return new Response(JSON.stringify({ error: "title is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Allow broadcast_all to skip targeting requirement
    if (!broadcast_all && !segment_id && !subscriber_uids && !alias) {
      return new Response(JSON.stringify({ error: "One of segment_id, subscriber_uids, alias, or broadcast_all is required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pushPayload: Record<string, unknown> = {
      idSite: Number(AIMTELL_SITE_ID),
      title,
      body: body || "",
      link: url || "https://opoll.org",
    };

    if (segment_id) pushPayload.segmentId = segment_id;
    if (subscriber_uids) pushPayload.subscriber_uids = subscriber_uids;
    if (alias) pushPayload.alias = alias;
    // For broadcast_all, we send without targeting — Aimtell sends to all site subscribers

    const response = await fetch("https://api.aimtell.com/prod/push", {
      method: "POST",
      headers: {
        "X-Authorization-Api-Key": AIMTELL_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pushPayload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Aimtell API error:", response.status, JSON.stringify(data));
      return new Response(JSON.stringify({ error: "Aimtell push failed", details: data }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Aimtell push sent:", JSON.stringify(data));

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("aimtell-push error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
