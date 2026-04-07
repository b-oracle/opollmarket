import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is super_admin
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await anonClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleCheck } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Forbidden: super_admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { broadcast_id } = await req.json();
    if (!broadcast_id) {
      return new Response(JSON.stringify({ error: "broadcast_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch broadcast record
    const { data: broadcast, error: bcErr } = await supabase
      .from("admin_notification_broadcasts")
      .select("*")
      .eq("id", broadcast_id)
      .single();

    if (bcErr || !broadcast) {
      return new Response(JSON.stringify({ error: "Broadcast not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (broadcast.status === "sent") {
      return new Response(JSON.stringify({ error: "Broadcast already sent" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve target user IDs
    let userIds: string[] = [];
    const targetType = broadcast.target_type;
    const filter = broadcast.target_filter || {};

    if (targetType === "all_users") {
      // Fetch all user IDs from profiles
      let from = 0;
      const batch = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("profiles")
          .select("id")
          .range(from, from + batch - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        userIds.push(...data.map((p: any) => p.id));
        if (data.length < batch) break;
        from += batch;
      }
    } else if (targetType === "by_role") {
      const roles = (filter as any).roles || [];
      if (roles.length > 0) {
        const { data, error } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", roles);
        if (error) throw error;
        userIds = [...new Set((data || []).map((r: any) => r.user_id))];
      }
    } else if (targetType === "by_verification") {
      const levels = (filter as any).levels || [];
      if (levels.length > 0) {
        let from = 0;
        const batch = 1000;
        while (true) {
          const { data, error } = await supabase
            .from("profiles")
            .select("id")
            .in("verification_level", levels)
            .range(from, from + batch - 1);
          if (error) throw error;
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
      await supabase
        .from("admin_notification_broadcasts")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", broadcast_id);

      return new Response(JSON.stringify({ error: "No recipients found for target criteria" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert notifications in batches
    const notifBatch = 500;
    let inserted = 0;
    for (let i = 0; i < userIds.length; i += notifBatch) {
      const chunk = userIds.slice(i, i + notifBatch);
      const rows = chunk.map((uid: string) => ({
        user_id: uid,
        title: broadcast.title,
        message: broadcast.message,
        type: broadcast.type || "info",
      }));

      const { error: insertErr } = await supabase.from("notifications").insert(rows);
      if (insertErr) {
        console.error("Notification insert error:", insertErr);
      } else {
        inserted += chunk.length;
      }
    }

    // Update broadcast status
    await supabase
      .from("admin_notification_broadcasts")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        recipients_count: inserted,
        updated_at: new Date().toISOString(),
      })
      .eq("id", broadcast_id);

    // Push notifications are handled by the existing trg_send_push_on_notification trigger
    // which fires automatically when notifications are inserted

    return new Response(JSON.stringify({
      success: true,
      recipients_count: inserted,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-admin-broadcast error:", err);
    return new Response(JSON.stringify({ error: (err as any).message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
