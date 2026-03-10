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
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "Missing url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Basic URL validation
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return new Response(JSON.stringify({ error: "Invalid protocol" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the image server-side (no CORS restrictions)
    const imgResponse = await fetch(url, {
      headers: { "Accept": "image/*" },
      signal: AbortSignal.timeout(10000),
    });

    if (!imgResponse.ok) {
      return new Response(
        JSON.stringify({ error: `Upstream returned ${imgResponse.status}` }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const contentType = imgResponse.headers.get("content-type") || "image/png";

    // Limit to 5MB to prevent abuse
    const buffer = await imgResponse.arrayBuffer();
    if (buffer.byteLength > 5 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "Image too large" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert to base64 data URL
    const base64 = btoa(
      new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
    );
    const dataUrl = `data:${contentType};base64,${base64}`;

    return new Response(JSON.stringify({ dataUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
