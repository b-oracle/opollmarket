import React from "https://esm.sh/react@18.2.0";
import { ImageResponse } from "https://deno.land/x/og_edge@0.0.6/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

function splitTitle(title: string, charsPerLine: number): string[] {
  const words = title.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && (current + " " + word).length > charsPerLine) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3); // max 3 lines
}

function wrapTitle(title: string, max: number): string {
  if (title.length <= max) return title;
  return title.slice(0, max - 1).trimEnd() + "…";
}

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const marketId = url.searchParams.get("id");

  if (!marketId) {
    return new Response("Missing market id", { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const client = createClient(supabaseUrl, serviceRoleKey);

  const { data: market } = await client
    .from("markets")
    .select("title, description, category, yes_price, no_price, volume, participants, status")
    .eq("id", marketId)
    .single();

  if (!market) {
    return new Response("Market not found", { status: 404 });
  }

  const yesPercent = Math.round(market.yes_price * 100);
  const noPercent = 100 - yesPercent;
  const displayTitle = wrapTitle(market.title, 100);
  const volumeStr = "$" + Number(market.volume).toLocaleString("en-US");

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "linear-gradient(145deg, #0c0c1d 0%, #111128 50%, #0a1a0a 100%)",
          color: "white",
          fontFamily: "sans-serif",
          padding: "60px",
        }}
      >
        {/* Top row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: "18px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "2px" }}>
            {market.category}
          </div>
          <div style={{ display: "flex", fontSize: "24px", fontWeight: 800, color: "#22c55e" }}>
            OPollmarket
          </div>
        </div>

        {/* Title */}
        <div style={{ display: "flex", fontSize: "44px", fontWeight: 800, lineHeight: 1.25, marginTop: "40px", color: "#f1f5f9", maxWidth: "1080px", wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
          {displayTitle}
        </div>

        {/* Spacer + stats */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
          {/* Big percentage */}
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <div style={{ display: "flex", fontSize: "80px", fontWeight: 800, color: "#22c55e" }}>
              {String(yesPercent) + "%"}
            </div>
            <div style={{ display: "flex", fontSize: "28px", fontWeight: 700, color: "#22c55e", marginLeft: "16px" }}>
              YES
            </div>
            <div style={{ display: "flex", fontSize: "28px", fontWeight: 600, color: "#64748b", marginLeft: "24px" }}>
              {String(noPercent) + "% NO"}
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ display: "flex", width: "100%", height: "12px", borderRadius: "6px", backgroundColor: "rgba(255,255,255,0.1)", marginTop: "20px", overflow: "hidden" }}>
            <div style={{ display: "flex", width: yesPercent + "%", height: "12px", borderRadius: "6px", backgroundColor: "#22c55e" }} />
          </div>

          {/* Bottom stats */}
          <div style={{ display: "flex", marginTop: "24px", justifyContent: "space-between" }}>
            <div style={{ display: "flex" }}>
              <div style={{ display: "flex", fontSize: "16px", color: "#64748b", marginRight: "8px" }}>Volume:</div>
              <div style={{ display: "flex", fontSize: "16px", fontWeight: 700 }}>{volumeStr}</div>
              <div style={{ display: "flex", fontSize: "16px", color: "#64748b", marginLeft: "32px", marginRight: "8px" }}>Traders:</div>
              <div style={{ display: "flex", fontSize: "16px", fontWeight: 700 }}>{String(market.participants)}</div>
            </div>
            <div style={{ display: "flex", fontSize: "14px", color: "#64748b" }}>
              opoll.org
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
