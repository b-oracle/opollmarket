/**
 * Encodes market resolution data as hex for an on-chain memo transaction.
 * The encoded data is stored permanently on BSC and readable via BSCScan.
 */

/** A self-owned "recorder" address – the 0-value tx is sent here */
export const RECORDER_ADDRESS = "0x000000000000000000000000000000000000dEaD" as const;

export function encodeResolutionData(
  marketId: string,
  winningSide: string,
  totalPaidOut: number,
): `0x${string}` {
  const payload = JSON.stringify({
    platform: "Pollmarket",
    type: "resolution",
    marketId,
    winningSide,
    totalPaidOut,
    ts: Math.floor(Date.now() / 1000),
  });
  const hex = Array.from(new TextEncoder().encode(payload))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}`;
}
