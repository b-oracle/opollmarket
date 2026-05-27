import { getErrorMessage } from "../_shared/errors.ts";
import { verifyInternalOrAdmin } from "../_shared/internalAuth.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await verifyInternalOrAdmin(req, { functionName: "aimtell-segments", corsHeaders });
  if (!auth.ok) return auth.response!;

  try {
    const AIMTELL_API_KEY = (Deno.env.get("AIMTELL_API_KEY") || "").trim().replace(/['"]/g, "");
    const AIMTELL_SITE_ID = (Deno.env.get("AIMTELL_SITE_ID") || "").trim().replace(/['"]/g, "");

    if (!AIMTELL_API_KEY) throw new Error("AIMTELL_API_KEY is not configured");
    if (!AIMTELL_SITE_ID || isNaN(Number(AIMTELL_SITE_ID))) throw new Error("AIMTELL_SITE_ID is not configured or invalid");

    console.log("Fetching segments for site:", AIMTELL_SITE_ID);

    const response = await fetch(`https://api.aimtell.com/prod/segments/${AIMTELL_SITE_ID}`, {
      method: "GET",
      headers: {
        "X-Authorization-Api-Key": AIMTELL_API_KEY,
        "Content-Type": "application/json",
      },
    });

    const raw = await response.text();
    console.log("Aimtell segments raw response:", raw.substring(0, 500));

    let data: unknown = raw;
    try { data = JSON.parse(raw); } catch { /* keep raw */ }

    if (!response.ok) {
      console.error("Aimtell segments error:", response.status, raw);
      return new Response(JSON.stringify({ error: "Failed to fetch segments", details: data }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize: Aimtell may return an object keyed by segment ID, or an array
    let segments: unknown[] = [];
    if (Array.isArray(data)) {
      segments = data;
    } else if (data && typeof data === "object" && !Array.isArray(data)) {
      // Could be { "123": { name: "...", ... }, "456": { ... } }
      // or { result: "success", data: [...] }
      const obj = data as Record<string, unknown>;
      if (Array.isArray(obj.data)) {
        segments = obj.data;
      } else if (Array.isArray(obj.segments)) {
        segments = obj.segments;
      } else {
        // Try treating keys as segment IDs
        segments = Object.entries(obj)
          .filter(([key]) => !["result", "message", "error"].includes(key))
          .map(([key, val]) => {
            if (val && typeof val === "object") {
              return { id: key, ...(val as Record<string, unknown>) };
            }
            return { id: key, name: String(val) };
          });
      }
    }

    console.log("Normalized segments count:", segments.length);

    return new Response(JSON.stringify({ segments }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("aimtell-segments error:", err);
    return new Response(JSON.stringify({ error: getErrorMessage(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
