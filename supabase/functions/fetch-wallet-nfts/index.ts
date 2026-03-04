import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { wallet_address } = await req.json();
    if (!wallet_address || typeof wallet_address !== "string") {
      return new Response(JSON.stringify({ error: "wallet_address is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
      return new Response(JSON.stringify({ error: "Invalid wallet address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const MORALIS_API_KEY = Deno.env.get("MORALIS_API_KEY");
    if (!MORALIS_API_KEY) {
      return new Response(JSON.stringify({ error: "Moralis API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch NFTs from Moralis
    const url = `${MORALIS_BASE}/${wallet_address}/nft?chain=bsc&format=decimal&media_items=true&limit=50`;
    const moralisRes = await fetch(url, {
      headers: {
        accept: "application/json",
        "X-API-Key": MORALIS_API_KEY,
      },
    });

    if (!moralisRes.ok) {
      const errBody = await moralisRes.text();
      console.error("Moralis API error:", moralisRes.status, errBody);
      return new Response(JSON.stringify({ error: "Failed to fetch NFTs" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const moralisData = await moralisRes.json();

    // Parse and return only relevant fields with image URLs
    const nfts = (moralisData.result || [])
      .map((nft: any) => {
        let imageUrl = null;
        let name = nft.name || `#${nft.token_id}`;

        // Try media_items first (from Moralis media_items param)
        if (nft.media?.media_collection?.medium?.url) {
          imageUrl = nft.media.media_collection.medium.url;
        }

        // Fallback: parse metadata
        if (!imageUrl && nft.normalized_metadata?.image) {
          imageUrl = nft.normalized_metadata.image;
        }

        if (!imageUrl && nft.metadata) {
          try {
            const meta = typeof nft.metadata === "string" ? JSON.parse(nft.metadata) : nft.metadata;
            imageUrl = meta.image || meta.image_url || null;
            if (!name || name === `#${nft.token_id}`) {
              name = meta.name || name;
            }
          } catch {
            // skip
          }
        }

        // Convert IPFS URLs to gateway
        if (imageUrl?.startsWith("ipfs://")) {
          imageUrl = imageUrl.replace("ipfs://", "https://ipfs.io/ipfs/");
        }

        return {
          token_address: nft.token_address,
          token_id: nft.token_id,
          name,
          image_url: imageUrl,
          collection_name: nft.name || "Unknown Collection",
        };
      })
      .filter((nft: any) => nft.image_url);

    return new Response(JSON.stringify({ nfts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
