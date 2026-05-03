import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AccessToken, RoomServiceClient } from "npm:livekit-server-sdk@2.15.0";
import { getErrorMessage } from "../_shared/errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const extractEnvValue = (value: string | null | undefined, key: string) => {
  const normalized = (value || "").trim();
  if (!normalized) return "";
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const assignmentMatch = normalized.match(
    new RegExp(
      `(?:^|[\\n\\r;\\s])${escapedKey}\\s*=\\s*(?:"([^"\\n\\r]+)"|'([^'\\n\\r]+)'|([^\\s;\\n\\r]+))`,
      "i"
    )
  );
  const fromAssignment = assignmentMatch?.[1] || assignmentMatch?.[2] || assignmentMatch?.[3];
  const candidate = (fromAssignment || normalized).trim();
  return candidate.replace(/^['\"`]|['\"`]$/g, "");
};

function getLivekitConfig() {
  const apiKey = extractEnvValue(Deno.env.get("LIVEKIT_API_KEY"), "LIVEKIT_API_KEY");
  const apiSecret = extractEnvValue(Deno.env.get("LIVEKIT_API_SECRET"), "LIVEKIT_API_SECRET");
  const livekitUrl = extractEnvValue(Deno.env.get("LIVEKIT_URL"), "LIVEKIT_URL");
  const httpUrl = livekitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  return { apiKey, apiSecret, livekitUrl, httpUrl };
}

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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = authUser.id;
    const body = await req.json();
    const { space_id, action, target_user_id } = body;

    if (!space_id) {
      return new Response(JSON.stringify({ error: "space_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: space, error: spaceErr } = await supabaseAdmin
      .from("spaces")
      .select("id, host_id, status, co_host_ids, is_private")
      .eq("id", space_id)
      .single();

    if (spaceErr || !space) {
      return new Response(JSON.stringify({ error: "Space not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (space.status !== "live") {
      const msg = space.status === "scheduled"
        ? "This Space isn't live yet. You'll be notified when it starts."
        : "This Space has ended.";
      return new Response(JSON.stringify({ error: msg }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { apiKey, apiSecret, livekitUrl, httpUrl } = getLivekitConfig();

    if (!apiKey || !apiSecret || !livekitUrl) {
      return new Response(JSON.stringify({ error: "LiveKit not configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const roomName = `space-${space_id}`;
    const isHost = space.host_id === userId;
    const coHostIds: string[] = space.co_host_ids || [];
    const isCoHost = coHostIds.includes(userId);
    const hasModPowers = isHost || isCoHost;

    // Block banned users from joining (allow host/co-host actions through).
    // Auto-expire temporary bans whose expires_at has passed.
    if (!isHost && !isCoHost && !["ban", "unban"].includes(action || "")) {
      const nowIso = new Date().toISOString();
      // Clean up any expired bans for this user/space first
      await supabaseAdmin
        .from("space_bans")
        .delete()
        .eq("space_id", space_id)
        .eq("user_id", userId)
        .not("expires_at", "is", null)
        .lte("expires_at", nowIso);

      const { data: activeBans } = await supabaseAdmin
        .from("space_bans")
        .select("expires_at")
        .eq("space_id", space_id)
        .eq("user_id", userId)
        .limit(1);
      if (activeBans && activeBans.length > 0) {
        const exp = activeBans[0].expires_at as string | null;
        const msg = exp
          ? `You have been temporarily banned from this Space until ${new Date(exp).toLocaleString()}.`
          : "You have been banned from this Space by the host.";
        return new Response(
          JSON.stringify({ error: msg }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Private space join-gating
    if (space.is_private && !isHost && !isCoHost && !action) {
      const { count } = await supabaseAdmin
        .from("space_invites")
        .select("id", { count: "exact", head: true })
        .eq("space_id", space_id)
        .eq("invitee_id", userId);
      if (!count || count === 0) {
        return new Response(
          JSON.stringify({ error: "This is a private Space. You need an invite to join." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Helper to ensure host or co-host for moderation actions
    const requireMod = () => {
      if (!hasModPowers) throw new Error("Only the host or co-host can perform this action");
    };

    // Helper to ensure only host for admin-only actions
    const requireHost = () => {
      if (!isHost) throw new Error("Only the host can perform this action");
    };

    // --- MAKE CO-HOST ---
    if (action === "make_cohost" && target_user_id) {
      requireHost();
      // Check if unverified users are allowed to be co-hosts
      const { data: toggleRow } = await supabaseAdmin
        .from("feature_toggles")
        .select("enabled")
        .eq("feature_key", "allow_unverified_spaces")
        .single();
      const allowUnverified = toggleRow?.enabled ?? false;

      if (!allowUnverified) {
        const { data: targetProfile } = await supabaseAdmin
          .from("profiles")
          .select("verification_level")
          .eq("id", target_user_id)
          .single();
        const targetVer = targetProfile?.verification_level || "none";
        if (targetVer === "none") {
          return new Response(JSON.stringify({ error: "Only verified members can be co-hosts" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      if (coHostIds.includes(target_user_id)) {
        return new Response(JSON.stringify({ success: true, action: "already_cohost" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const newCoHosts = [...coHostIds, target_user_id];
      await supabaseAdmin
        .from("spaces")
        .update({ co_host_ids: newCoHosts })
        .eq("id", space_id);
      // Also promote them to speaker permissions in LiveKit
      const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      try {
        await svc.updateParticipant(roomName, target_user_id, undefined, {
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
        });
      } catch { /* participant may not be connected yet */ }
      await supabaseAdmin
        .from("space_participants")
        .update({ role: "co_host" })
        .eq("space_id", space_id)
        .eq("user_id", target_user_id);
      return new Response(JSON.stringify({ success: true, action: "made_cohost" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- REMOVE CO-HOST ---
    // When a co-host is removed they are demoted to a listener (NOT a speaker).
    // They must be explicitly re-promoted by the host to speak again.
    if (action === "remove_cohost" && target_user_id) {
      requireHost();
      const newCoHosts = coHostIds.filter((id: string) => id !== target_user_id);
      await supabaseAdmin
        .from("spaces")
        .update({ co_host_ids: newCoHosts })
        .eq("id", space_id);
      // Revoke publish permissions in LiveKit so they can't keep speaking
      try {
        const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
        await svc.updateParticipant(roomName, target_user_id, undefined, {
          canPublish: false,
          canSubscribe: true,
          canPublishData: true,
        });
      } catch (_e) {
        // Participant may already be disconnected — ignore
      }
      await supabaseAdmin
        .from("space_participants")
        .update({ role: "listener" })
        .eq("space_id", space_id)
        .eq("user_id", target_user_id);
      return new Response(JSON.stringify({ success: true, action: "removed_cohost" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- PROMOTE ---
    if (action === "promote" && target_user_id) {
      requireMod();
      const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      await svc.updateParticipant(roomName, target_user_id, undefined, {
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });
      await supabaseAdmin
        .from("space_participants")
        .update({ role: "speaker" })
        .eq("space_id", space_id)
        .eq("user_id", target_user_id);
      return new Response(JSON.stringify({ success: true, action: "promoted" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- DEMOTE ---
    if (action === "demote" && target_user_id) {
      requireMod();
      const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      await svc.updateParticipant(roomName, target_user_id, undefined, {
        canPublish: false,
        canSubscribe: true,
        canPublishData: true,
      });
      await supabaseAdmin
        .from("space_participants")
        .update({ role: "listener" })
        .eq("space_id", space_id)
        .eq("user_id", target_user_id);
      return new Response(JSON.stringify({ success: true, action: "demoted" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- FORCE MUTE ---
    if (action === "mute" && target_user_id) {
      requireMod();
      const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      const participant = await svc.getParticipant(roomName, target_user_id);
      if (participant.tracks) {
        for (const track of participant.tracks) {
          if (track.type === 1) {
            await svc.mutePublishedTrack(roomName, target_user_id, track.sid!, true);
          }
        }
      }
      return new Response(JSON.stringify({ success: true, action: "muted" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- MUTE ALL ---
    if (action === "mute_all") {
      requireMod();
      const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      const participants = await svc.listParticipants(roomName);
      let mutedCount = 0;
      for (const p of participants) {
        if (p.identity === userId) continue;
        if (p.tracks) {
          for (const track of p.tracks) {
            if (track.type === 1 && track.sid) {
              try {
                await svc.mutePublishedTrack(roomName, p.identity!, track.sid, true);
                mutedCount++;
              } catch { /* participant may have left */ }
            }
          }
        }
      }
      return new Response(JSON.stringify({ success: true, action: "muted_all", count: mutedCount }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- KICK ---
    if (action === "kick" && target_user_id) {
      requireMod();
      // Co-hosts cannot kick other co-hosts or the host
      if (isCoHost && !isHost) {
        if (target_user_id === space.host_id || coHostIds.includes(target_user_id)) {
          throw new Error("Co-hosts cannot remove the host or other co-hosts");
        }
      }
      const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      await svc.removeParticipant(roomName, target_user_id);
      await supabaseAdmin
        .from("space_participants")
        .update({ left_at: new Date().toISOString(), role: "kicked" })
        .eq("space_id", space_id)
        .eq("user_id", target_user_id);
      return new Response(JSON.stringify({ success: true, action: "kicked" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- BAN (kick + add to space_bans so user can't rejoin) ---
    if (action === "ban" && target_user_id) {
      requireMod();
      if (target_user_id === space.host_id) {
        throw new Error("You cannot ban the host");
      }
      if (isCoHost && !isHost && coHostIds.includes(target_user_id)) {
        throw new Error("Co-hosts cannot ban other co-hosts");
      }
      // Optional duration in minutes for temporary bans (null/0 = permanent)
      const durationMin = Number(body.duration_minutes);
      const expiresAt = Number.isFinite(durationMin) && durationMin > 0
        ? new Date(Date.now() + durationMin * 60_000).toISOString()
        : null;
      // Insert ban record (idempotent via UNIQUE(space_id, user_id))
      const { error: banErr } = await supabaseAdmin
        .from("space_bans")
        .upsert(
          { space_id, user_id: target_user_id, banned_by: userId, reason: body.reason ?? null, expires_at: expiresAt },
          { onConflict: "space_id,user_id" }
        );
      if (banErr) throw new Error(banErr.message);

      // Remove from co-hosts if present
      if (coHostIds.includes(target_user_id)) {
        const newCoHosts = coHostIds.filter((id: string) => id !== target_user_id);
        await supabaseAdmin.from("spaces").update({ co_host_ids: newCoHosts }).eq("id", space_id);
      }

      // Force-disconnect from the live room
      try {
        const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
        await svc.removeParticipant(roomName, target_user_id);
      } catch { /* may already be gone */ }

      await supabaseAdmin
        .from("space_participants")
        .update({ left_at: new Date().toISOString(), role: "banned" })
        .eq("space_id", space_id)
        .eq("user_id", target_user_id);

      return new Response(JSON.stringify({ success: true, action: "banned", expires_at: expiresAt }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- UNBAN ---
    if (action === "unban" && target_user_id) {
      requireMod();
      const { error: unbanErr } = await supabaseAdmin
        .from("space_bans")
        .delete()
        .eq("space_id", space_id)
        .eq("user_id", target_user_id);
      if (unbanErr) throw new Error(unbanErr.message);
      return new Response(JSON.stringify({ success: true, action: "unbanned" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (action === "end_space") {
      requireHost();
      const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      try {
        await svc.deleteRoom(roomName);
      } catch { /* room may already be gone */ }
      await supabaseAdmin
        .from("spaces")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", space_id);
      // Mark all remaining participants as left
      await supabaseAdmin
        .from("space_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("space_id", space_id)
        .is("left_at", null);
      return new Response(JSON.stringify({ success: true, action: "ended" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Default: JOIN ---
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single();

    const displayName = profile?.display_name || "Anonymous";
    const canPublish = isHost || isCoHost;

    const at = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      name: displayName,
      ttl: "2h",
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish,
      canSubscribe: true,
      canPublishData: true,
    });

    const accessToken = await at.toJwt();

    return new Response(
      JSON.stringify({ token: accessToken, url: livekitUrl, room: roomName, isHost, isCoHost }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("livekit-token error:", err);
    return new Response(
      JSON.stringify({ error: (getErrorMessage(err)) || "Internal error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
