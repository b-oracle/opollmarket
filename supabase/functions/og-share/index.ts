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
      // Redirect to homepage if no market id
      return new Response(null, {
        status: 302,
        headers: { Location: "https://opoll.org" },
      });
    }

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
        headers: { Location: `https://opoll.org/market/${marketId}` },
      });
    }

    const yesPercent = Math.round(market.yes_price * 100);
    const pageTitle = `${market.title} | OPoll Market`;
    const pageDesc = market.description || `YES ${yesPercent}% · NO ${100 - yesPercent}% · $${Number(market.volume).toLocaleString()} volume`;

    // Use market-specific image, fall back to OG image generator, then default
    const ogImageUrl = market.image_url
      ? market.image_url
      : `${supabaseUrl}/functions/v1/og-image?id=${marketId}`;

    // Build the redirect URL
    const redirectUrl = ref
      ? `https://opoll.org/market/${marketId}?ref=${ref}`
      : `https://opoll.org/market/${marketId}`;

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
  <meta property="og:url" content="${escapeHtml(redirectUrl)}" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@opollmarket" />
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(pageDesc)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />

  <!-- Redirect real users to the actual page -->
  <meta http-equiv="refresh" content="0;url=${escapeHtml(redirectUrl)}" />
  <link rel="canonical" href="${escapeHtml(redirectUrl)}" />
</head>
<body>
  <p>Redirecting to <a href="${escapeHtml(redirectUrl)}">OPoll Market</a>...</p>
  <script>window.location.replace(${JSON.stringify(redirectUrl)});</script>
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
