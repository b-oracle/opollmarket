import { getErrorMessage } from "../_shared/errors.ts";
import { requireAuthAndRateLimit } from "../_shared/auth.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const auth = await requireAuthAndRateLimit(req, { perMinute: 30 });
  if (!auth.ok) return auth.response;

  try {
    const clientId = Deno.env.get("JAMENDO_CLIENT_ID");
    if (!clientId) {
      return new Response(
        JSON.stringify({ error: "Jamendo API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const query = url.searchParams.get("query") || "";
    const genre = url.searchParams.get("genre") || "";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);

    const params = new URLSearchParams({
      client_id: clientId,
      format: "json",
      limit: String(limit),
      include: "musicinfo",
      audioformat: "mp32",
    });

    if (query) params.set("search", query);
    if (genre) params.set("tags", genre);
    if (!query && !genre) params.set("order", "popularity_total");

    const apiUrl = `https://api.jamendo.com/v3.0/tracks/?${params.toString()}`;
    const resp = await fetch(apiUrl);
    if (!resp.ok) {
      const text = await resp.text();
      console.error("Jamendo API error:", text);
      return new Response(
        JSON.stringify({ error: "Jamendo API error" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await resp.json();
    const tracks = (data.results || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      artist: t.artist_name,
      duration: t.duration,
      audioUrl: t.audio,
      previewUrl: t.audiodownload,
      imageUrl: t.image,
    }));

    return new Response(JSON.stringify({ tracks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("jamendo-search error:", err);
    return new Response(
      JSON.stringify({ error: (getErrorMessage(err)) || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
