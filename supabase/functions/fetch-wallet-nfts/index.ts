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

const BSC_RPC = "https://bsc-dataseed1.binance.org";
const BALANCE_OF_SELECTOR = "0x70a08231"; // balanceOf(address)

/**
 * Direct BSC RPC fallback: checks ERC-721/1155 balanceOf on a specific contract.
 * Returns a synthetic NFT entry if balance > 0.
 */
async function checkNftViaRpc(
  walletAddress: string,
  nftContractAddress: string
): Promise<{ nfts: any[]; balance: number }> {
  const paddedAddress = walletAddress.slice(2).toLowerCase().padStart(64, "0");
  const callData = BALANCE_OF_SELECTOR + paddedAddress;

  const res = await fetch(BSC_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: nftContractAddress, data: callData }, "latest"],
      id: 1,
    }),
  });

  const data = await res.json();
  if (data.error) {
    console.error("BSC RPC NFT balance error:", data.error);
    return { nfts: [], balance: 0 };
  }

  const rawBalance = BigInt(data.result || "0x0");
  const balance = Number(rawBalance);

  if (balance > 0) {
    const nfts = Array.from({ length: Math.min(balance, 50) }, (_, i) => ({
      token_address: nftContractAddress.toLowerCase(),
      token_id: String(i),
      name: `BC400 NFT #${i + 1}`,
      image_url: null,
      collection_name: "BC400 NFT",
      blockchain: "bsc",
    }));
    return { nfts, balance };
  }

  return { nfts: [], balance: 0 };
}

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

    const body = await req.json();
    const { wallet_address, nft_contract_address } = body;

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

    // Try Moralis first
    const moralisKey = Deno.env.get("MORALIS_API_KEY");
    let moralisFailed = false;
    let allNfts: any[] = [];

    if (moralisKey) {
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
            if (res.status === 401 || res.status === 429) {
              throw new Error("moralis_rate_limited");
            }
            return [];
          }

          const data = await res.json();
          return (data.result || []).map((nft: any) => {
            let imageUrl =
              nft.normalized_metadata?.image ||
              nft.metadata?.image ||
              null;

            if (!imageUrl && typeof nft.metadata === "string") {
              try {
                const parsed = JSON.parse(nft.metadata);
                imageUrl = parsed.image || parsed.image_url || null;
              } catch {
                // ignore parse errors
              }
            }

            if (imageUrl?.startsWith("ipfs://")) {
              imageUrl = imageUrl.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/");
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

      // Check if all chains failed with rate limit
      const allRejected = results.every(
        (r) => r.status === "rejected" || (r.status === "fulfilled" && (r.value as any[]).length === 0)
      );
      const anyRateLimited = results.some(
        (r) => r.status === "rejected" && (r as PromiseRejectedResult).reason?.message === "moralis_rate_limited"
      );

      if (allRejected && anyRateLimited) {
        moralisFailed = true;
        console.warn("Moralis rate limited on all chains, falling back to BSC RPC");
      } else {
        allNfts = results.flatMap((r) =>
          r.status === "fulfilled" ? r.value : []
        );
      }
    } else {
      moralisFailed = true;
      console.warn("MORALIS_API_KEY not configured, using BSC RPC fallback");
    }

    // BSC RPC fallback: if Moralis failed and we have a target NFT contract, check directly on-chain
    if (moralisFailed && nft_contract_address && /^0x[a-fA-F0-9]{40}$/.test(nft_contract_address)) {
      console.log(`BSC RPC fallback: checking balanceOf on ${nft_contract_address} for ${wallet_address}`);
      const rpcResult = await checkNftViaRpc(wallet_address, nft_contract_address);
      if (rpcResult.balance > 0) {
        console.log(`BSC RPC fallback: found ${rpcResult.balance} NFT(s)`);
      }
      allNfts = rpcResult.nfts;
    }

    // Even if Moralis succeeded but returned 0 for the target contract, try RPC as a safety net
    if (
      !moralisFailed &&
      nft_contract_address &&
      /^0x[a-fA-F0-9]{40}$/.test(nft_contract_address)
    ) {
      const targetLower = nft_contract_address.toLowerCase();
      const hasTargetNft = allNfts.some((n) => n.token_address === targetLower);
      if (!hasTargetNft) {
        console.log(`Moralis returned 0 for target contract, trying BSC RPC fallback`);
        const rpcResult = await checkNftViaRpc(wallet_address, nft_contract_address);
        if (rpcResult.balance > 0) {
          console.log(`BSC RPC fallback found ${rpcResult.balance} NFT(s) missed by Moralis`);
          allNfts = [...allNfts, ...rpcResult.nfts];
        }
      }
    }

    return new Response(JSON.stringify({ nfts: allNfts }), {
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
