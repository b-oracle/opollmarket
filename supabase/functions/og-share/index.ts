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
    const ref = url.searchParams.get("ref") || "";

    if (!marketId) {
      return new Response(null, {
        status: 302,
        headers: { Location: "https://opoll.org" },
      });
    }

    // Detect if this is a bot/crawler that needs OG tags
    const ua = (req.headers.get("user-agent") || "").toLowerCase();
    const isCrawler = /bot|crawl|spider|slurp|facebookexternalhit|twitterbot|whatsapp|telegram|linkedinbot|discordbot|embedly|quora|pinterest|slack|vkshare|redditbot|applebot/i.test(ua);

    // Build the redirect URL
    const redirectUrl = ref
      ? `https://opoll.org/market/${marketId}?ref=${ref}`
      : `https://opoll.org/market/${marketId}`;

    // For real users (not crawlers), redirect immediately with 302
    if (!isCrawler) {
      return new Response(null, {
        status: 302,
        headers: { Location: redirectUrl },
      });
    }

    // For crawlers, serve the OG meta tags
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(supabaseUrl, serviceRoleKey);

    const { data: market } = await client
      .from("markets")
      .select("title, description, category, yes_price, no_price, volume, participants, status, image_url")
      .eq("id", marketId)
      .single();

    if (!market) {
      return new Response(null, {
        status: 302,
        headers: { Location: redirectUrl },
      });
    }

    const yesPercent = Math.round(market.yes_price * 100);
    const pageTitle = `${market.title} | OPoll Market`;
    const pageDesc = market.description || `YES ${yesPercent}% · NO ${100 - yesPercent}% · $${Number(market.volume).toLocaleString()} volume`;

    const ogImageUrl = `${supabaseUrl}/functions/v1/og-image?id=${marketId}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(pageDesc)}" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="OPOLL" />
  <meta property="og:title" content="${escapeHtml(pageTitle)}" />
  <meta property="og:description" content="${escapeHtml(pageDesc)}" />
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${escapeHtml(redirectUrl)}" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@opollmarket" />
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(pageDesc)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />

  <link rel="canonical" href="${escapeHtml(redirectUrl)}" />
  <meta http-equiv="refresh" content="0;url=${escapeHtml(redirectUrl)}" />
</head>
<body>
  <p>Redirecting to <a href="${escapeHtml(redirectUrl)}">OPoll Market</a>...</p>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    console.error("og-share error:", err);
    return new Response(null, {
      status: 302,
      headers: { Location: "https://opoll.org" },
    });
  }
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
