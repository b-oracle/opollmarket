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
    .select("title, description, category, yes_price, no_price, volume, participants, status, image_url")
    .eq("id", marketId)
    .single();

  if (!market) {
    return new Response("Market not found", { status: 404 });
  }

  const yesPercent = Math.round(market.yes_price * 100);
  const noPercent = 100 - yesPercent;
  const statusColor = market.status === "active" ? "#22c55e" : market.status === "resolved" ? "#3b82f6" : "#eab308";
  const statusLabel = market.status.charAt(0).toUpperCase() + market.status.slice(1);
  const displayTitle = wrapTitle(market.title, 120);
  const volumeStr = "$" + Number(market.volume).toLocaleString("en-US");

  let bgImageSrc: string | null = null;
  if (market.image_url) {
    bgImageSrc = await fetchImageAsBase64(market.image_url);
  }

  // Build background element separately to avoid null children (satori 0.4.0 bug)
  const bgElement = bgImageSrc
    ? <img src={bgImageSrc} width={1200} height={630} style={{
        position: "absolute", top: 0, left: 0, width: "1200px", height: "630px", objectFit: "cover",
      }} />
    : <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: "1200px", height: "630px", background: "linear-gradient(135deg, #0a0a0a, #1a1a2e)" }} />;

  return new ImageResponse(
    (
      <div style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: "#0a0a1a",
        color: "white",
        fontFamily: "sans-serif",
        position: "relative",
      }}>
        {bgElement}

        {/* Dark gradient overlay */}
        <div style={{
          position: "absolute", top: 0, left: 0, width: "1200px", height: "630px",
          display: "flex",
          background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.5) 40%, rgba(0,0,0,0.9) 100%)",
        }} />

        {/* Category badge - top left */}
        <div style={{
          position: "absolute", top: "40px", left: "60px", display: "flex",
          backgroundColor: "rgba(255,255,255,0.18)", borderRadius: "18px",
          padding: "8px 20px", fontSize: "16px", fontWeight: 600,
        }}>
          {market.category}
        </div>

        {/* Status badge - top right */}
        <div style={{
          position: "absolute", top: "40px", right: "60px", display: "flex",
          backgroundColor: statusColor + "40", borderRadius: "18px",
          padding: "8px 20px", fontSize: "14px", fontWeight: 700, color: statusColor,
        }}>
          {statusLabel}
        </div>

        {/* Chance circle - right side */}
        <div style={{
          position: "absolute", top: "120px", right: "60px", display: "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center",
          width: "130px", height: "130px", borderRadius: "65px",
          border: "6px solid rgba(255,255,255,0.2)", backgroundColor: "rgba(0,0,0,0.5)",
        }}>
          <div style={{ display: "flex", fontSize: "38px", fontWeight: 800 }}>
            {String(yesPercent) + "%"}
          </div>
          <div style={{ display: "flex", fontSize: "14px", color: "#22c55e", fontWeight: 700, marginTop: "4px" }}>
            YES
          </div>
        </div>

        {/* Content area at bottom */}
        <div style={{
          display: "flex", flexDirection: "column", position: "absolute",
          bottom: "50px", left: "60px", right: "60px",
        }}>
          {/* Title */}
          <div style={{ display: "flex", fontSize: "40px", fontWeight: 800, lineHeight: "1.3", maxWidth: "900px" }}>
            {displayTitle}
          </div>

          {/* Progress bar */}
          <div style={{
            display: "flex", marginTop: "20px", width: "500px", height: "14px",
            borderRadius: "7px", backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden",
          }}>
            <div style={{
              display: "flex", width: yesPercent + "%", height: "14px",
              borderRadius: "7px", backgroundColor: "#22c55e",
            }} />
          </div>

          {/* YES / NO badges */}
          <div style={{ display: "flex", marginTop: "16px" }}>
            <div style={{
              display: "flex", backgroundColor: "#22c55e", borderRadius: "18px",
              padding: "8px 22px", fontSize: "16px", fontWeight: 700, color: "#000", marginRight: "12px",
            }}>
              {"YES " + yesPercent + "%"}
            </div>
            <div style={{
              display: "flex", backgroundColor: "#ef4444", borderRadius: "18px",
              padding: "8px 22px", fontSize: "16px", fontWeight: 700, color: "#fff",
            }}>
              {"NO " + noPercent + "%"}
            </div>
          </div>

          {/* Bottom row: stats + branding */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "flex-end",
            marginTop: "24px", width: "100%",
          }}>
            <div style={{ display: "flex" }}>
              <div style={{ display: "flex", flexDirection: "column", marginRight: "40px" }}>
                <div style={{ display: "flex", fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>Volume</div>
                <div style={{ display: "flex", fontSize: "22px", fontWeight: 700 }}>{volumeStr}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>Traders</div>
                <div style={{ display: "flex", fontSize: "22px", fontWeight: 700 }}>{String(market.participants)}</div>
              </div>
            </div>
            <div style={{ display: "flex", fontSize: "24px", fontWeight: 800, color: "#22c55e" }}>
              OPollmarket
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
