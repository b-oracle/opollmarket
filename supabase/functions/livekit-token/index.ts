import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2.15.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();
    if (userError || !authUser) {
      console.error("Auth error:", userError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = authUser.id;

    const { space_id } = await req.json();
    if (!space_id) {
      return new Response(JSON.stringify({ error: "space_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify space exists and is live
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: space, error: spaceErr } = await supabaseAdmin
      .from("spaces")
      .select("id, host_id, status")
      .eq("id", space_id)
      .single();

    if (spaceErr || !space) {
      console.error("Space lookup error:", spaceErr?.message);
      return new Response(JSON.stringify({ error: "Space not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (space.status !== "live") {
      return new Response(JSON.stringify({ error: "Space has ended" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get display name
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single();

    const displayName = profile?.display_name || "Anonymous";
    const isHost = space.host_id === userId;
    const roomName = `space-${space_id}`;

    const extractEnvValue = (value: string | null, key: string) => {
      const normalized = (value || "").trim();
      if (!normalized) return "";

      const fromNamedLine = normalized.match(
        new RegExp(`(?:^|\\n)\\s*${key}\\s*=\\s*([^\\n\\r]+)`, "i")
      )?.[1];

      const candidate = (fromNamedLine || normalized).trim();
      return candidate.replace(/^['\"`]|['\"`]$/g, "");
    };

    const apiKeyRaw = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecretRaw = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrlRaw = Deno.env.get("LIVEKIT_URL");

    const apiKey = extractEnvValue(apiKeyRaw, "LIVEKIT_API_KEY");
    const apiSecret = extractEnvValue(apiSecretRaw, "LIVEKIT_API_SECRET");
    const livekitUrl = extractEnvValue(livekitUrlRaw, "LIVEKIT_URL");

    const malformedSecret = /^LIVEKIT_/i.test(apiSecret);

    console.log("LiveKit config:", {
      hasKey: !!apiKey,
      hasSecret: !!apiSecret,
      hasUrl: !!livekitUrl,
      malformedSecret,
      keyLength: apiKey.length,
      secretLength: apiSecret.length,
      urlValue: livekitUrl,
      keyPrefix: apiKey.slice(0, 6),
      secretPrefix: apiSecret.slice(0, 6),
      userId,
      roomName,
      isHost,
    });

    if (!apiKey || !apiSecret || !livekitUrl || malformedSecret) {
      return new Response(JSON.stringify({ error: "LiveKit credentials malformed. Paste raw key/secret values only." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      name: displayName,
      ttl: "2h",
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: isHost,
      canSubscribe: true,
      canPublishData: true,
    });

    const accessToken = await at.toJwt();
    console.log("Token generated, length:", accessToken.length);

    return new Response(
      JSON.stringify({
        token: accessToken,
        url: livekitUrl,
        room: roomName,
        isHost,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("livekit-token error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
