import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Cron secret guard
  const cronSecret = Deno.env.get("CRON_SECRET");
  const incoming = req.headers.get("x-cron-secret");
  if (!cronSecret || incoming !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find broadcasts that are pending and scheduled_at is in the past
    const { data: dueBroadcasts, error } = await supabase
      .from("admin_notification_broadcasts")
      .select("id")
      .eq("status", "pending")
      .not("scheduled_at", "is", null)
      .lte("scheduled_at", new Date().toISOString())
      .limit(10);

    if (error) throw error;
    if (!dueBroadcasts || dueBroadcasts.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    for (const bc of dueBroadcasts) {
      // Call the send-admin-broadcast function internally
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-admin-broadcast`;
      
      // Use service role to bypass auth — the send function will see no user
      // Instead, directly process here
      const { data: broadcast } = await supabase
        .from("admin_notification_broadcasts")
        .select("*")
        .eq("id", bc.id)
        .single();

      if (!broadcast || broadcast.status === "sent") continue;

      let userIds: string[] = [];
      const targetType = broadcast.target_type;
      const filter = broadcast.target_filter || {};

      if (targetType === "all_users") {
        let from = 0;
        const batch = 1000;
        while (true) {
          const { data } = await supabase.from("profiles").select("id").range(from, from + batch - 1);
          if (!data || data.length === 0) break;
          userIds.push(...data.map((p: any) => p.id));
          if (data.length < batch) break;
          from += batch;
        }
      } else if (targetType === "by_role") {
        const roles = (filter as any).roles || [];
        if (roles.length > 0) {
          const { data } = await supabase.from("user_roles").select("user_id").in("role", roles);
          userIds = [...new Set((data || []).map((r: any) => r.user_id))];
        }
      } else if (targetType === "by_verification") {
        const levels = (filter as any).levels || [];
        if (levels.length > 0) {
          let from = 0;
          const batch = 1000;
          while (true) {
            const { data } = await supabase.from("profiles").select("id").in("verification_level", levels).range(from, from + batch - 1);
            if (!data || data.length === 0) break;
            userIds.push(...data.map((p: any) => p.id));
            if (data.length < batch) break;
            from += batch;
          }
        }
      } else if (targetType === "manual") {
        userIds = (filter as any).user_ids || [];
      }

      if (userIds.length === 0) {
        await supabase.from("admin_notification_broadcasts")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", bc.id);
        continue;
      }

      let inserted = 0;
      const notifBatch = 500;
      for (let i = 0; i < userIds.length; i += notifBatch) {
        const chunk = userIds.slice(i, i + notifBatch);
        const rows = chunk.map((uid: string) => ({
          user_id: uid,
          title: broadcast.title,
          message: broadcast.message,
          type: broadcast.type || "info",
        }));
        const { error: insertErr } = await supabase.from("notifications").insert(rows);
        if (!insertErr) inserted += chunk.length;
      }

      await supabase.from("admin_notification_broadcasts")
        .update({ status: "sent", sent_at: new Date().toISOString(), recipients_count: inserted, updated_at: new Date().toISOString() })
        .eq("id", bc.id);

      processed++;
    }

    return new Response(JSON.stringify({ processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("process-scheduled-broadcasts error:", err);
    return new Response(JSON.stringify({ error: (err as any).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
