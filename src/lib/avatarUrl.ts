/**
 * Resolves NFT / IPFS avatar URLs to a reachable public gateway.
 *
 * The historical `ipfs.io` gateway is frequently unreachable (timeouts), which
 * made NFT profile photos render as broken images. Any `ipfs://` URI or known
 * dead gateway host is rewritten to the primary gateway below.
 */

const PRIMARY_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

const DEAD_GATEWAY_PATTERNS = [
  "https://ipfs.io/ipfs/",
  "http://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://nftstorage.link/ipfs/",
];

export function resolveAvatarUrl(url: string | null | undefined): string {
  if (!url) return "";

  if (url.startsWith("ipfs://")) {
    return PRIMARY_GATEWAY + url.replace("ipfs://ipfs/", "").replace("ipfs://", "");
  }

  for (const pattern of DEAD_GATEWAY_PATTERNS) {
    if (url.startsWith(pattern)) {
      return PRIMARY_GATEWAY + url.slice(pattern.length);
    }
  }

  return url;
}
