import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { RoomServiceClient } from "livekit-server-sdk";
import { getErrorMessage } from "../_shared/errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const extractEnvValue = (value: string | null, key: string) => {
  const normalized = (value || "").trim();
  if (!normalized) return "";

  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const assignmentMatch = normalized.match(
    new RegExp(
      `(?:^|[\\n\\r;\\s])${escapedKey}\\s*=\\s*(?:\"([^\"\\n\\r]+)\"|'([^'\\n\\r]+)'|([^\\s;\\n\\r]+))`,
      "i",
    ),
  );

  const fromAssignment = assignmentMatch?.[1] || assignmentMatch?.[2] || assignmentMatch?.[3];
  const candidate = (fromAssignment || normalized).trim();
  return candidate.replace(/^['\"`]|['\"`]$/g, "");
};

const getLivekitConfig = () => {
  const apiKey = extractEnvValue(Deno.env.get("LIVEKIT_API_KEY"), "LIVEKIT_API_KEY");
  const apiSecret = extractEnvValue(Deno.env.get("LIVEKIT_API_SECRET"), "LIVEKIT_API_SECRET");
  const livekitUrl = extractEnvValue(Deno.env.get("LIVEKIT_URL"), "LIVEKIT_URL");
  const httpUrl = livekitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");

  return { apiKey, apiSecret, livekitUrl, httpUrl };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const spaceIds = Array.isArray(body?.space_ids)
      ? body.space_ids.filter((value: unknown): value is string => typeof value === "string" && value.length > 0).slice(0, 10)
      : [];

    if (spaceIds.length === 0) {
      return json({ configured: true, spaces: {} });
    }

    const { apiKey, apiSecret, livekitUrl, httpUrl } = getLivekitConfig();
    if (!apiKey || !apiSecret || !livekitUrl) {
      return json({ configured: false, spaces: {} });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: visibleSpaces, error: visibleSpacesError } = await supabaseAdmin.rpc("get_visible_spaces" as never, {
      _user_id: user.id,
    });

    if (visibleSpacesError) {
      throw visibleSpacesError;
    }

    const liveVisibleSpaceIds = new Set(
      ((visibleSpaces as Array<{ id: string; status: string }> | null) || [])
        .filter((space) => space.status === "live" && spaceIds.includes(space.id))
        .map((space) => space.id),
    );

    const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);

    const spaces = Object.fromEntries(
      await Promise.all(
        spaceIds.map(async (spaceId) => {
          if (!liveVisibleSpaceIds.has(spaceId)) {
            return [spaceId, { participant_count: 0, joined: false }];
          }

          try {
            const participants = await svc.listParticipants(`space-${spaceId}`);

            return [
              spaceId,
              {
                participant_count: participants.length,
                joined: participants.some((participant) => participant.identity === user.id),
              },
            ];
          } catch (error) {
            console.error("space-presence listParticipants error", {
              spaceId,
              message: getErrorMessage(error),
            });

            return [spaceId, { participant_count: 0, joined: false }];
          }
        }),
      ),
    );

    return json({ configured: true, spaces });
  } catch (error) {
    console.error("space-presence error", error);
    return json({ error: getErrorMessage(error) });
  }
});