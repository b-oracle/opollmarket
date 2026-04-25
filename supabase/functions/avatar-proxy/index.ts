import { getErrorMessage } from "../_shared/errors.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple in-memory rate limiter: max 30 requests per IP per 60s window
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

// Periodically prune expired entries to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap) {
    if (now >= val.resetAt) rateLimitMap.delete(key);
  }
}, WINDOW_MS);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";

  if (isRateLimited(clientIp)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": "60",
      },
    });
  }

  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "Missing url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const buffer = await imgResponse.arrayBuffer();
    if (buffer.byteLength > 5 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "Image too large" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const base64 = btoa(
      new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
    );
    const dataUrl = `data:${contentType};base64,${base64}`;

    return new Response(JSON.stringify({ dataUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = getErrorMessage(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
