import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

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
    const url = new URL(req.url);
    const marketId = url.searchParams.get("id");

    if (!marketId) {
      return new Response("Missing market id", { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(supabaseUrl, serviceRoleKey);

    const { data: market } = await client
      .from("markets")
      .select("title, description, category, yes_price, no_price, volume, participants, status, market_type, image_url")
      .eq("id", marketId)
      .single();

    if (!market) {
      return new Response("Market not found", { status: 404, headers: corsHeaders });
    }

    // If market has an uploaded image, redirect to it (most common case)
    if (market.image_url) {
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: market.image_url, "Cache-Control": "public, max-age=600" },
      });
    }

    // Fallback: generate SVG (works for most crawlers except Twitter)
    const yesPercent = Math.round(market.yes_price * 100);
    const statusColor = market.status === "active" ? "#22c55e" : market.status === "resolved" ? "#3b82f6" : "#eab308";
    const statusLabel = market.status.charAt(0).toUpperCase() + market.status.slice(1);

    const escSvg = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0a0a0a"/>
          <stop offset="100%" stop-color="#1a1a2e"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#bg)"/>
      <text x="60" y="80" font-family="Arial,sans-serif" font-size="32" font-weight="bold" fill="#22c55e">OPOLL</text>
      <text x="175" y="80" font-family="Arial,sans-serif" font-size="16" fill="#888">Social Prediction Market</text>
      <rect x="1020" y="50" width="120" height="36" rx="18" fill="${statusColor}" opacity="0.2"/>
      <text x="1080" y="74" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="${statusColor}" text-anchor="middle">${escSvg(statusLabel)}</text>
      <rect x="60" y="110" width="${market.category.length * 12 + 24}" height="30" rx="15" fill="#333"/>
      <text x="72" y="130" font-family="Arial,sans-serif" font-size="13" fill="#aaa">${escSvg(market.category)}</text>
      <text x="60" y="200" font-family="Arial,sans-serif" font-size="40" font-weight="bold" fill="#fff">${escSvg(market.title.length > 40 ? market.title.slice(0, 40) + "..." : market.title)}</text>
      <text x="60" y="250" font-family="Arial,sans-serif" font-size="18" fill="#999">${escSvg(market.description.length > 80 ? market.description.slice(0, 80) + "..." : market.description)}</text>
      <rect x="60" y="320" width="1080" height="16" rx="8" fill="#333"/>
      <rect x="60" y="320" width="${(yesPercent / 100) * 1080}" height="16" rx="8" fill="#22c55e"/>
      <text x="60" y="370" font-family="Arial,sans-serif" font-size="28" font-weight="bold" fill="#22c55e">YES ${yesPercent}%</text>
      <text x="300" y="370" font-family="Arial,sans-serif" font-size="28" font-weight="bold" fill="#ef4444">NO ${100 - yesPercent}%</text>
      <text x="60" y="520" font-family="Arial,sans-serif" font-size="16" fill="#666">Volume</text>
      <text x="60" y="550" font-family="Arial,sans-serif" font-size="24" font-weight="bold" fill="#fff">$${Number(market.volume).toLocaleString()}</text>
      <text x="300" y="520" font-family="Arial,sans-serif" font-size="16" fill="#666">Traders</text>
      <text x="300" y="550" font-family="Arial,sans-serif" font-size="24" font-weight="bold" fill="#fff">${market.participants}</text>
      <rect x="800" y="500" width="340" height="60" rx="16" fill="#22c55e"/>
      <text x="970" y="538" font-family="Arial,sans-serif" font-size="20" font-weight="bold" fill="#000" text-anchor="middle">Predict Now</text>
    </svg>`;

    return new Response(svg, {
      headers: {
        ...corsHeaders,
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=600",
      },
    });
  } catch (err) {
    console.error("og-image error:", err);
    return new Response("Error generating OG image", {
      status: 500,
      headers: corsHeaders,
    });
  }
});
