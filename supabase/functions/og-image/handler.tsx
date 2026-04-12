import React from "https://esm.sh/react@18.2.0";
import { ImageResponse } from "https://deno.land/x/og_edge@0.0.6/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

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
    .select("title, yes_price, category, volume, participants, status")
    .eq("id", marketId)
    .single();

  if (!market) {
    return new Response("Market not found", { status: 404 });
  }

  const yesPercent = Math.round(market.yes_price * 100);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          backgroundColor: "#0a0a1a",
          color: "white",
          padding: "60px",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div style={{ display: "flex", fontSize: "24px", color: "#22c55e" }}>
          {market.category}
        </div>
        <div style={{ display: "flex", fontSize: "48px", fontWeight: 700, marginTop: "20px" }}>
          {market.title}
        </div>
        <div style={{ display: "flex", fontSize: "64px", fontWeight: 800, marginTop: "30px", color: "#22c55e" }}>
          {String(yesPercent) + "% YES"}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
