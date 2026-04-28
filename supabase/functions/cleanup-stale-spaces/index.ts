import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getErrorMessage } from "../_shared/errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const INACTIVITY_MINUTES = 30;
    const HARD_TIMEOUT_HOURS = 12;
    const cutoff = new Date(Date.now() - INACTIVITY_MINUTES * 60 * 1000).toISOString();
    const hardCutoff = new Date(Date.now() - HARD_TIMEOUT_HOURS * 60 * 60 * 1000).toISOString();

    // Find live spaces that started more than 30 minutes ago
    const { data: liveSpaces, error: fetchErr } = await supabase
      .from("spaces")
      .select("id, title, host_id, co_host_ids, started_at")
      .eq("status", "live")
      .lt("started_at", cutoff);

    if (fetchErr) throw fetchErr;

    if (!liveSpaces || liveSpaces.length === 0) {
      return new Response(
        JSON.stringify({ ended: 0, message: "No stale spaces found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let ended = 0;

    // Set up LiveKit client once — this is our authoritative source of truth
    // for who is *actually* connected to the room. DB-tracked `left_at` can
    // be stale when clients background, lose network, or crash without
    // firing a clean leave event, which previously caused the cleanup job
    // to kill spaces that still had active speakers/listeners.
    const livekitUrl = Deno.env.get("LIVEKIT_URL") || "";
    const apiKey = Deno.env.get("LIVEKIT_API_KEY") || "";
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET") || "";
    let RoomServiceClientCtor: any = null;
    let svc: any = null;
    if (livekitUrl && apiKey && apiSecret) {
      try {
        const mod = await import("npm:livekit-server-sdk@2.15.0");
        RoomServiceClientCtor = mod.RoomServiceClient;
        const httpUrl = livekitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
        svc = new RoomServiceClientCtor(httpUrl, apiKey, apiSecret);
      } catch (e) {
        console.error("cleanup-stale-spaces: failed to init LiveKit client", e);
      }
    }

    for (const space of liveSpaces) {
      const keyUserIds: string[] = [space.host_id];
      if (space.co_host_ids?.length) keyUserIds.push(...space.co_host_ids);

      // Force-end if space exceeded the hard timeout (raised to 12h to allow
      // long-form shows). Even legitimately active spaces are capped here so
      // forgotten/abandoned rooms don't run forever.
      const pastHardTimeout = space.started_at < hardCutoff;

      // ── Primary liveness check: LiveKit room presence ─────────────────
      // If ANY participant is on LiveKit (host, co-host, speaker, or even a
      // real listener) the space is alive — skip it. Only fall back to the
      // DB-based heuristic if LiveKit is unreachable or returns 0.
      let liveKitParticipantCount: number | null = null;
      if (svc && !pastHardTimeout) {
        try {
          const participants = await svc.listParticipants(`space-${space.id}`);
          liveKitParticipantCount = Array.isArray(participants) ? participants.length : 0;
        } catch (err: any) {
          // 404 = room doesn't exist on LiveKit anymore → treat as empty.
          // Other errors → leave as null so we fall through to DB heuristic.
          const msg = String(err?.message || err);
          if (/not.?found|404/i.test(msg)) {
            liveKitParticipantCount = 0;
          } else {
            console.error(`cleanup-stale-spaces: LiveKit listParticipants failed for ${space.id}`, msg);
            liveKitParticipantCount = null;
          }
        }
      }

      if (!pastHardTimeout && liveKitParticipantCount !== null && liveKitParticipantCount > 0) {
        // Room is genuinely alive — skip.
        continue;
      }

      // ── Fallback: DB-based heuristic (only if LiveKit unreachable) ────
      // Used when liveKitParticipantCount === null (transient LiveKit error).
      // We do NOT use this when LiveKit confirmed 0 participants — empty
      // room is a strong end signal.
      let anyKeyUserPresent = false;
      let anyKeyUserActive = false;
      if (!pastHardTimeout && liveKitParticipantCount === null) {
        const { data: connectedSpeakers } = await supabase
          .from("space_participants")
          .select("user_id")
          .eq("space_id", space.id)
          .eq("role", "speaker")
          .is("left_at", null);
        if (connectedSpeakers?.length) {
          for (const sp of connectedSpeakers) {
            if (!keyUserIds.includes(sp.user_id)) keyUserIds.push(sp.user_id);
          }
        }

        const { data: connectedKeyUsers } = await supabase
          .from("space_participants")
          .select("user_id")
          .eq("space_id", space.id)
          .in("user_id", keyUserIds)
          .is("left_at", null);
        anyKeyUserPresent = (connectedKeyUsers?.length ?? 0) > 0;

        const { count: recentKeyMessages } = await supabase
          .from("space_messages")
          .select("id", { count: "exact", head: true })
          .eq("space_id", space.id)
          .in("user_id", keyUserIds)
          .gte("created_at", cutoff);
        anyKeyUserActive = (recentKeyMessages ?? 0) > 0;
      }

      // End the space if:
      //  • Hard timeout exceeded, OR
      //  • LiveKit confirmed 0 participants, OR
      //  • LiveKit unreachable AND the DB heuristic shows nobody key present/active.
      const liveKitConfirmedEmpty = liveKitParticipantCount === 0;
      const dbFallbackSaysDead =
        liveKitParticipantCount === null && !anyKeyUserPresent && !anyKeyUserActive;

      if (pastHardTimeout || liveKitConfirmedEmpty || dbFallbackSaysDead) {
        const now = new Date().toISOString();

        await supabase
          .from("spaces")
          .update({ status: "ended", ended_at: now })
          .eq("id", space.id)
          .eq("status", "live");

        await supabase
          .from("space_participants")
          .update({ left_at: now })
          .eq("space_id", space.id)
          .is("left_at", null);

        const reason = pastHardTimeout
          ? `exceeded the maximum duration of ${HARD_TIMEOUT_HOURS} hours`
          : liveKitConfirmedEmpty
            ? "all participants left the room"
            : `${INACTIVITY_MINUTES} minutes of no host, co-host, or speaker activity`;

        await supabase.from("notifications").insert({
          user_id: space.host_id,
          title: "Space Ended (Auto-Closed) ⏰",
          message: `Your space "${space.title}" was automatically ended after ${reason}.`,
          type: "info",
        });

        if (svc) {
          try { await svc.deleteRoom(`space-${space.id}`); } catch { /* room may already be gone */ }
        }

        ended++;
        console.log(
          `cleanup-stale-spaces: ended space ${space.id} — "${space.title}" (reason: ${reason})`,
        );
      }
    }

    return new Response(
      JSON.stringify({ ended, checked: liveSpaces.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("cleanup-stale-spaces error:", err);
    return new Response(
      JSON.stringify({ error: (getErrorMessage(err)) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
