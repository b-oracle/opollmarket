import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);
    const ct = resp.headers.get("content-type") || "image/jpeg";
    return `data:${ct};base64,${b64}`;
  } catch {
    return null;
  }
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3); // max 3 lines
}

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

    const yesPercent = Math.round(market.yes_price * 100);
    const noPercent = 100 - yesPercent;
    const statusColor = market.status === "active" ? "#22c55e" : market.status === "resolved" ? "#3b82f6" : "#eab308";
    const statusLabel = market.status.charAt(0).toUpperCase() + market.status.slice(1);

    // Try to fetch and embed market image as base64
    let imageElement = "";
    if (market.image_url) {
      const b64 = await fetchImageAsBase64(market.image_url);
      if (b64) {
        // Full-bleed background image with dark overlay
        imageElement = `
          <image href="${b64}" x="0" y="0" width="1200" height="630" preserveAspectRatio="xMidYMid slice"/>
          <rect x="0" y="0" width="1200" height="630" fill="url(#imgOverlay)"/>`;
      }
    }

    const titleLines = wrapText(market.title, 45);
    const titleSvg = titleLines
      .map((line, i) => `<text x="60" y="${380 + i * 52}" font-family="Arial,Helvetica,sans-serif" font-size="42" font-weight="bold" fill="#fff" filter="url(#textShadow)">${esc(line)}</text>`)
      .join("\n      ");

    const barWidth = (yesPercent / 100) * 500;

    const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <defs>
        <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0a0a0a"/>
          <stop offset="100%" stop-color="#1a1a2e"/>
        </linearGradient>
        <linearGradient id="imgOverlay" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#000" stop-opacity="0.25"/>
          <stop offset="40%" stop-color="#000" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#000" stop-opacity="0.85"/>
        </linearGradient>
        <filter id="textShadow">
          <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000" flood-opacity="0.7"/>
        </filter>
      </defs>

      <!-- Background -->
      <rect width="1200" height="630" fill="url(#bgGrad)"/>
      ${imageElement}

      <!-- Category pill -->
      <rect x="50" y="40" width="${market.category.length * 13 + 30}" height="36" rx="18" fill="rgba(255,255,255,0.15)"/>
      <text x="65" y="64" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="600" fill="#fff" filter="url(#textShadow)">${esc(market.category)}</text>

      <!-- Status badge -->
      <rect x="1030" y="40" width="120" height="36" rx="18" fill="${statusColor}" opacity="0.25"/>
      <text x="1090" y="64" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="bold" fill="${statusColor}" text-anchor="middle">${esc(statusLabel)}</text>

      <!-- Chance ring (top right) -->
      <circle cx="1100" cy="160" r="55" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="8"/>
      <circle cx="1100" cy="160" r="55" fill="none" stroke="#22c55e" stroke-width="8"
        stroke-dasharray="${(yesPercent / 100) * 345.6} 345.6"
        transform="rotate(-90 1100 160)"/>
      <text x="1100" y="155" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="bold" fill="#fff" text-anchor="middle">${yesPercent}%</text>
      <text x="1100" y="180" font-family="Arial,Helvetica,sans-serif" font-size="13" fill="#22c55e" text-anchor="middle">YES</text>

      <!-- Title -->
      ${titleSvg}

      <!-- Progress bar -->
      <rect x="60" y="${380 + titleLines.length * 52 + 15}" width="500" height="12" rx="6" fill="rgba(255,255,255,0.15)"/>
      <rect x="60" y="${380 + titleLines.length * 52 + 15}" width="${barWidth}" height="12" rx="6" fill="#22c55e"/>

      <!-- YES / NO badges -->
      <rect x="60" y="${380 + titleLines.length * 52 + 42}" width="100" height="36" rx="18" fill="#22c55e"/>
      <text x="110" y="${380 + titleLines.length * 52 + 66}" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="bold" fill="#000" text-anchor="middle">YES ${yesPercent}%</text>

      <rect x="175" y="${380 + titleLines.length * 52 + 42}" width="100" height="36" rx="18" fill="#ef4444"/>
      <text x="225" y="${380 + titleLines.length * 52 + 66}" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="bold" fill="#fff" text-anchor="middle">NO ${noPercent}%</text>

      <!-- Volume & Traders -->
      <text x="60" y="598" font-family="Arial,Helvetica,sans-serif" font-size="14" fill="rgba(255,255,255,0.5)">Volume</text>
      <text x="60" y="620" font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="bold" fill="#fff">$${Number(market.volume).toLocaleString()}</text>
      <text x="250" y="598" font-family="Arial,Helvetica,sans-serif" font-size="14" fill="rgba(255,255,255,0.5)">Traders</text>
      <text x="250" y="620" font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="bold" fill="#fff">${market.participants}</text>

      <!-- Branding -->
      <text x="1140" y="615" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="bold" fill="#22c55e" text-anchor="end">OPollmarket</text>
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
