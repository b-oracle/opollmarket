import { getErrorMessage } from "../_shared/errors.ts";
import { verifyInternalOrAdmin } from "../_shared/internalAuth.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await verifyInternalOrAdmin(req, { functionName: "aimtell-push", corsHeaders });
  if (!auth.ok) return auth.response!;

  try {
    const AIMTELL_API_KEY_RAW = Deno.env.get("AIMTELL_API_KEY");
    const AIMTELL_SITE_ID_RAW = Deno.env.get("AIMTELL_SITE_ID");

    if (!AIMTELL_API_KEY_RAW) {
      throw new Error("AIMTELL_API_KEY is not configured");
    }

    const AIMTELL_API_KEY = AIMTELL_API_KEY_RAW.trim().replace(/['"]/g, "");
    if (!AIMTELL_API_KEY) {
      throw new Error("AIMTELL_API_KEY is empty");
    }

    if (!AIMTELL_SITE_ID_RAW) {
      throw new Error("AIMTELL_SITE_ID is not configured");
    }

    const AIMTELL_SITE_ID = AIMTELL_SITE_ID_RAW.trim().replace(/['"]/g, "");
    const siteIdNum = Number(AIMTELL_SITE_ID);
    if (isNaN(siteIdNum)) {
      throw new Error(`AIMTELL_SITE_ID is not a valid number: "${AIMTELL_SITE_ID}"`);
    }

    console.log("Using Aimtell site ID:", siteIdNum);

    const payload = await req.json();

    const title = typeof payload?.title === "string" ? payload.title.trim() : "";
    const body = typeof payload?.body === "string" ? payload.body.trim() : "";
    const url = typeof payload?.url === "string" ? payload.url.trim() : "";
    const alias = typeof payload?.alias === "string" ? payload.alias.trim() : "";
    const broadcastAll = payload?.broadcast_all === true;
    const rawSegmentId = payload?.segment_id ?? payload?.segmentId;

    let subscriberUids: string | undefined;
    if (Array.isArray(payload?.subscriber_uids)) {
      const cleaned = payload.subscriber_uids
        .map((uid: unknown) => String(uid).trim())
        .filter(Boolean);
      if (cleaned.length > 0) subscriberUids = cleaned.join(",");
    } else if (typeof payload?.subscriber_uids === "string") {
      const cleaned = payload.subscriber_uids.trim();
      if (cleaned) subscriberUids = cleaned;
    }

    const hasSegment =
      rawSegmentId !== undefined && rawSegmentId !== null && String(rawSegmentId).trim() !== "";
    const hasAlias = alias.length > 0;
    const hasUids = Boolean(subscriberUids);

    if (!title) {
      return new Response(JSON.stringify({ error: "title is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (broadcastAll && !hasSegment && !hasAlias && !hasUids) {
      return new Response(
        JSON.stringify({
          error:
            "Aimtell requires a target. Provide a segment_id (recommended), alias, or subscriber_uids.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!hasSegment && !hasAlias && !hasUids) {
      return new Response(
        JSON.stringify({
          error: "One of segment_id, subscriber_uids, or alias is required.",
        }),
        {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const pushPayload: Record<string, unknown> = {
      idSite: siteIdNum,
      title,
      body,
      link: url || "https://opoll.org",
    };

    if (hasSegment) {
      const segmentIdNum = Number(rawSegmentId);
      if (!Number.isFinite(segmentIdNum)) {
        return new Response(JSON.stringify({ error: "segment_id must be a valid number" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      pushPayload.segmentId = segmentIdNum;
    }

    if (subscriberUids) pushPayload.subscriber_uids = subscriberUids;
    if (hasAlias) pushPayload.alias = alias;

    const response = await fetch("https://api.aimtell.com/prod/push", {
      method: "POST",
      headers: {
        "X-Authorization-Api-Key": AIMTELL_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pushPayload),
    });

    const rawResponse = await response.text();
    let data: unknown = rawResponse;
    try {
      data = JSON.parse(rawResponse);
    } catch {
      // keep raw text when response isn't JSON
    }

    const apiResultIsError =
      typeof data === "object" &&
      data !== null &&
      "result" in data &&
      (data as { result?: string }).result === "error";

    if (!response.ok || apiResultIsError) {
      console.error("Aimtell API error:", response.status, rawResponse);
      const apiMessage =
        typeof data === "object" && data !== null && "message" in data
          ? String((data as { message?: string }).message)
          : "Aimtell push failed";

      return new Response(
        JSON.stringify({ error: apiMessage, details: data }),
        {
          status: response.ok ? 400 : response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log("Aimtell push sent:", JSON.stringify(data));

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("aimtell-push error:", err);
    return new Response(JSON.stringify({ error: getErrorMessage(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
