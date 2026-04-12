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

  let bgImageSrc: string | null = null;
  if (market.image_url) {
    bgImageSrc = await fetchImageAsBase64(market.image_url);
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
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
              width: "1200px",
              height: "630px",
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
            width: "1200px",
            height: "630px",
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.45) 40%, rgba(0,0,0,0.88) 100%)",
            display: "flex",
          }}
        />

        {/* Top bar: category + status */}
        <div
          style={{
            position: "absolute",
            top: "40px",
            left: "60px",
            display: "flex",
            alignItems: "center",
          }}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.18)",
              borderRadius: "18px",
              padding: "8px 20px",
              fontSize: "16px",
              fontWeight: 600,
              display: "flex",
            }}
          >
            {market.category}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            top: "40px",
            right: "60px",
            display: "flex",
            alignItems: "center",
          }}
        >
          <div
            style={{
              background: statusColor + "40",
              borderRadius: "18px",
              padding: "8px 20px",
              fontSize: "14px",
              fontWeight: 700,
              color: statusColor,
              display: "flex",
            }}
          >
            {statusLabel}
          </div>
        </div>

        {/* Chance percentage */}
        <div
          style={{
            position: "absolute",
            top: "110px",
            right: "60px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "130px",
            height: "130px",
            borderRadius: "65px",
            border: "6px solid rgba(255,255,255,0.2)",
            background: "rgba(0,0,0,0.4)",
          }}
        >
          <div
            style={{
              fontSize: "38px",
              fontWeight: 800,
              lineHeight: 1,
              display: "flex",
            }}
          >
            {yesPercent}%
          </div>
          <div
            style={{
              fontSize: "14px",
              color: "#22c55e",
              fontWeight: 700,
              marginTop: "4px",
              display: "flex",
            }}
          >
            YES
          </div>
        </div>

        {/* Title - NO flexWrap */}
        <div
          style={{
            fontSize: "40px",
            fontWeight: 800,
            lineHeight: 1.3,
            maxWidth: "900px",
            display: "flex",
          }}
        >
          {displayTitle}
        </div>

        {/* Progress bar */}
        <div
          style={{
            display: "flex",
            marginTop: "20px",
            width: "500px",
            height: "14px",
            borderRadius: "7px",
            background: "rgba(255,255,255,0.15)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${yesPercent}%`,
              height: "14px",
              borderRadius: "7px",
              background: "#22c55e",
              display: "flex",
            }}
          />
        </div>

        {/* YES / NO badges */}
        <div style={{ display: "flex", marginTop: "16px" }}>
          <div
            style={{
              background: "#22c55e",
              borderRadius: "18px",
              padding: "8px 22px",
              fontSize: "16px",
              fontWeight: 700,
              color: "#000",
              display: "flex",
              marginRight: "12px",
            }}
          >
            YES {yesPercent}%
          </div>
          <div
            style={{
              background: "#ef4444",
              borderRadius: "18px",
              padding: "8px 22px",
              fontSize: "16px",
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
            marginTop: "24px",
            width: "100%",
          }}
        >
          <div style={{ display: "flex" }}>
            <div style={{ display: "flex", flexDirection: "column", marginRight: "40px" }}>
              <div
                style={{
                  fontSize: "13px",
                  color: "rgba(255,255,255,0.5)",
                  display: "flex",
                }}
              >
                Volume
              </div>
              <div
                style={{
                  fontSize: "22px",
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
                  fontSize: "13px",
                  color: "rgba(255,255,255,0.5)",
                  display: "flex",
                }}
              >
                Traders
              </div>
              <div
                style={{
                  fontSize: "22px",
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
              fontSize: "24px",
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
