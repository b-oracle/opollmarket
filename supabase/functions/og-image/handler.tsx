import React from "https://esm.sh/react@18.2.0";
import { ImageResponse } from "https://deno.land/x/og_edge@0.0.6/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const ct = resp.headers.get("content-type") || "image/jpeg";
    return `data:${ct};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
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
    .select(
      "title, description, category, yes_price, no_price, volume, participants, status, image_url"
    )
    .eq("id", marketId)
    .single();

  if (!market) {
    return new Response("Market not found", { status: 404 });
  }

  const yesPercent = Math.round(market.yes_price * 100);
  const noPercent = 100 - yesPercent;
  const statusColor =
    market.status === "active"
      ? "#22c55e"
      : market.status === "resolved"
      ? "#3b82f6"
      : "#eab308";
  const statusLabel =
    market.status.charAt(0).toUpperCase() + market.status.slice(1);
  const displayTitle = wrapTitle(market.title, 120);
  const volumeStr = `$${Number(market.volume).toLocaleString("en-US")}`;

  // Pre-fetch market image as base64 for reliable embedding
  let bgImageSrc: string | null = null;
  if (market.image_url) {
    bgImageSrc = await fetchImageAsBase64(market.image_url);
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "50px 60px",
          fontFamily: "sans-serif",
          color: "#fff",
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(135deg, #0a0a0a, #1a1a2e)",
        }}
      >
        {/* Market image background */}
        {bgImageSrc && (
          <img
            src={bgImageSrc}
            width={1200}
            height={630}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 1200,
              height: 630,
              objectFit: "cover",
            }}
          />
        )}

        {/* Dark overlay */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.45) 40%, rgba(0,0,0,0.88) 100%)",
            display: "flex",
          }}
        />

        {/* Top bar: category + status */}
        <div
          style={{
            position: "absolute",
            top: 40,
            left: 60,
            right: 60,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.18)",
              borderRadius: 18,
              padding: "8px 20px",
              fontSize: 16,
              fontWeight: 600,
              display: "flex",
            }}
          >
            {market.category}
          </div>
          <div
            style={{
              background: statusColor + "40",
              borderRadius: 18,
              padding: "8px 20px",
              fontSize: 14,
              fontWeight: 700,
              color: statusColor,
              display: "flex",
            }}
          >
            {statusLabel}
          </div>
        </div>

        {/* Chance percentage (top right area) */}
        <div
          style={{
            position: "absolute",
            top: 110,
            right: 60,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: 130,
            height: 130,
            borderRadius: 65,
            border: "6px solid rgba(255,255,255,0.2)",
            background: "rgba(0,0,0,0.4)",
          }}
        >
          <div
            style={{
              fontSize: 38,
              fontWeight: 800,
              lineHeight: 1,
              display: "flex",
            }}
          >
            {yesPercent}%
          </div>
          <div
            style={{
              fontSize: 14,
              color: "#22c55e",
              fontWeight: 700,
              marginTop: 4,
              display: "flex",
            }}
          >
            YES
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 40,
            fontWeight: 800,
            lineHeight: 1.3,
            maxWidth: 900,
            display: "flex",
            flexWrap: "wrap",
          }}
        >
          {displayTitle}
        </div>

        {/* Progress bar */}
        <div
          style={{
            display: "flex",
            marginTop: 20,
            width: 500,
            height: 14,
            borderRadius: 7,
            background: "rgba(255,255,255,0.15)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${yesPercent}%`,
              height: 14,
              borderRadius: 7,
              background: "#22c55e",
              display: "flex",
            }}
          />
        </div>

        {/* YES / NO badges */}
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <div
            style={{
              background: "#22c55e",
              borderRadius: 18,
              padding: "8px 22px",
              fontSize: 16,
              fontWeight: 700,
              color: "#000",
              display: "flex",
            }}
          >
            YES {yesPercent}%
          </div>
          <div
            style={{
              background: "#ef4444",
              borderRadius: 18,
              padding: "8px 22px",
              fontSize: 16,
              fontWeight: 700,
              color: "#fff",
              display: "flex",
            }}
          >
            NO {noPercent}%
          </div>
        </div>

        {/* Bottom: Volume, Traders, Branding */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginTop: 24,
            width: "100%",
          }}
        >
          <div style={{ display: "flex", gap: 40 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.5)",
                  display: "flex",
                }}
              >
                Volume
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  display: "flex",
                }}
              >
                {volumeStr}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.5)",
                  display: "flex",
                }}
              >
                Traders
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  display: "flex",
                }}
              >
                {market.participants}
              </div>
            </div>
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: "#22c55e",
              display: "flex",
            }}
          >
            OPollmarket
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
