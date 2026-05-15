import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCronSecret } from "../_shared/cronAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronCheck = verifyCronSecret(req, { functionName: "remind-draft-completion", corsHeaders });
  if (!cronCheck.ok) return cronCheck.response!;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find drafts that haven't been reminded in 12+ hours (or never reminded)
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const { data: drafts, error: draftsError } = await supabase
      .from("markets")
      .select("id, title, creator_wallet")
      .eq("status", "draft")
      .or(`last_draft_reminder_at.is.null,last_draft_reminder_at.lt.${twelveHoursAgo}`)
      .limit(200);

    if (draftsError) {
      console.error("Error fetching drafts:", draftsError);
      return new Response(JSON.stringify({ error: draftsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!drafts || drafts.length === 0) {
      return new Response(JSON.stringify({ ok: true, reminded: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by user
    const userDrafts = new Map<string, typeof drafts>();
    for (const draft of drafts) {
      const userId = draft.creator_wallet;
      if (!userId) continue;
      if (!userDrafts.has(userId)) userDrafts.set(userId, []);
      userDrafts.get(userId)!.push(draft);
    }

    let reminded = 0;
    const draftIdsToUpdate: string[] = [];

    for (const [userId, userDraftList] of userDrafts) {
      // Build a summary notification
      let message: string;
      let title: string;

      if (userDraftList.length === 1) {
        const d = userDraftList[0];
        title = "📝 Unfinished Draft";
        message = `You have an unfinished market draft: "${d.title || "Untitled"}". Tap here to continue editing →`;
      } else {
        title = "📝 Unfinished Drafts";
        message = `You have ${userDraftList.length} unfinished market drafts. Tap here to continue editing →`;
      }

      // Insert in-app notification (trigger dispatches to Telegram/push/WhatsApp)
      const { error: notifError } = await supabase.from("notifications").insert({
        user_id: userId,
        title,
        message,
        type: "info",
      });

      if (notifError) {
        console.error(`Failed to notify user ${userId}:`, notifError);
        continue;
      }

      reminded++;
      draftIdsToUpdate.push(...userDraftList.map((d) => d.id));
    }

    // Batch update last_draft_reminder_at
    if (draftIdsToUpdate.length > 0) {
      const { error: updateError } = await supabase
        .from("markets")
        .update({ last_draft_reminder_at: new Date().toISOString() })
        .in("id", draftIdsToUpdate);

      if (updateError) {
        console.error("Error updating last_draft_reminder_at:", updateError);
      }
    }

    console.log(`Draft reminders sent to ${reminded} users for ${draftIdsToUpdate.length} drafts`);

    return new Response(
      JSON.stringify({ ok: true, reminded, drafts_updated: draftIdsToUpdate.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("remind-draft-completion error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
