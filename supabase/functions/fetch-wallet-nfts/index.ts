import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Ankr Advanced API – free tier, no API key required for basic queries
const ANKR_RPC = "https://rpc.ankr.com/multichain/?ankr_getNFTsByOwner=";

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

    // Use Ankr Advanced API (free, no key needed) to fetch NFTs across BSC, ETH, Polygon
    const ankrRes = await fetch("https://rpc.ankr.com/multichain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "ankr_getNFTsByOwner",
        params: {
          walletAddress: wallet_address,
          blockchain: ["bsc", "eth", "polygon"],
          pageSize: 50,
        },
        id: 1,
      }),
    });

    if (!ankrRes.ok) {
      const errBody = await ankrRes.text();
      console.error("Ankr API error:", ankrRes.status, errBody);
      return new Response(JSON.stringify({ error: "Failed to fetch NFTs" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ankrData = await ankrRes.json();

    if (ankrData.error) {
      console.error("Ankr RPC error:", JSON.stringify(ankrData.error));
      return new Response(JSON.stringify({ error: "Failed to fetch NFTs" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const assets = ankrData.result?.assets || [];

    const nfts = assets.map((nft: any) => {
      let imageUrl = nft.imageUrl || null;

      // Try metadata fallback
      if (!imageUrl && nft.traits?.image) {
        imageUrl = nft.traits.image;
      }

      // Convert IPFS URLs to gateway
      if (imageUrl?.startsWith("ipfs://")) {
        imageUrl = imageUrl.replace("ipfs://", "https://ipfs.io/ipfs/");
      }

      return {
        token_address: (nft.contractAddress || "").toLowerCase(),
        token_id: nft.tokenId,
        name: nft.name || `#${nft.tokenId}`,
        image_url: imageUrl,
        collection_name: nft.collectionName || "Unknown Collection",
        blockchain: nft.blockchain || "bsc",
      };
    });

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
