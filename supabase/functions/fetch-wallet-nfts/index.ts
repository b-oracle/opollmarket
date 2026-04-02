import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CHAIN_MAP: Record<string, string> = {
  bsc: "0x38",
  eth: "0x1",
  polygon: "0x89",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const isServiceRole = token === serviceRoleKey;

    if (!isServiceRole) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { wallet_address } = await req.json();
    if (!wallet_address || typeof wallet_address !== "string") {
      return new Response(JSON.stringify({ error: "wallet_address is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
      return new Response(JSON.stringify({ error: "Invalid wallet address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const moralisKey = Deno.env.get("MORALIS_API_KEY");
    if (!moralisKey) {
      console.error("MORALIS_API_KEY not configured");
      return new Response(JSON.stringify({ error: "NFT service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch NFTs from multiple chains in parallel using Moralis
    const chains = ["bsc", "eth", "polygon"];
    const results = await Promise.allSettled(
      chains.map(async (chain) => {
        const chainHex = CHAIN_MAP[chain];
        const url = `https://deep-index.moralis.io/api/v2.2/${wallet_address}/nft?chain=${chainHex}&format=decimal&limit=50&normalizeMetadata=true`;
        const res = await fetch(url, {
          headers: {
            accept: "application/json",
            "X-API-Key": moralisKey,
          },
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error(`Moralis ${chain} error: ${res.status} ${errText}`);
          return [];
        }

        const data = await res.json();
        return (data.result || []).map((nft: any) => {
          let imageUrl =
            nft.normalized_metadata?.image ||
            nft.metadata?.image ||
            null;

          // Parse metadata string if needed
          if (!imageUrl && typeof nft.metadata === "string") {
            try {
              const parsed = JSON.parse(nft.metadata);
              imageUrl = parsed.image || parsed.image_url || null;
            } catch {
              // ignore parse errors
            }
          }

          // Convert IPFS URLs to gateway
          if (imageUrl?.startsWith("ipfs://")) {
            imageUrl = imageUrl.replace("ipfs://", "https://ipfs.io/ipfs/");
          }

          return {
            token_address: (nft.token_address || "").toLowerCase(),
            token_id: nft.token_id,
            name: nft.normalized_metadata?.name || nft.name || `#${nft.token_id}`,
            image_url: imageUrl,
            collection_name: nft.name || "Unknown Collection",
            blockchain: chain,
          };
        });
      })
    );

    const nfts = results.flatMap((r) =>
      r.status === "fulfilled" ? r.value : []
    );

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
