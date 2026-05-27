import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyInternalOrAdmin } from "../_shared/internalAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

type Event = "created" | "reply" | "closed";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await verifyInternalOrAdmin(req, { functionName: "notify-support-ticket-event", corsHeaders });
  if (!auth.ok) return auth.response!;


  try {
    const { ticket_id, event, message_preview } = (await req.json()) as {
      ticket_id?: string;
      event?: Event;
      message_preview?: string;
    };

    if (!ticket_id || !event) {
      return new Response(JSON.stringify({ error: "ticket_id and event are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: ticket, error: ticketErr } = await admin
      .from("support_tickets")
      .select("id, user_id, subject, status, ticket_number, category")
      .eq("id", ticket_id)
      .maybeSingle();

    if (ticketErr || !ticket) {
      return new Response(JSON.stringify({ error: "Ticket not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ticketNumber = ticket.ticket_number;
    const subject = ticket.subject || "Support";

    // 1. In-app notification (also triggers DB-level push via send_push_on_notification)
    let notifTitle = "";
    let notifMessage = "";
    let templateName = "";

    if (event === "created") {
      notifTitle = `Ticket #${ticketNumber} received`;
      notifMessage = `We received your ticket "${subject}". We'll get back to you shortly.`;
      templateName = "support-ticket-created";
    } else if (event === "reply") {
      notifTitle = `New reply on ticket #${ticketNumber}`;
      notifMessage = message_preview ? message_preview : `Support replied to "${subject}".`;
      templateName = "support-ticket-reply";
    } else if (event === "closed") {
      notifTitle = `Ticket #${ticketNumber} closed`;
      notifMessage = `Your ticket "${subject}" has been closed.`;
      templateName = "support-ticket-closed";
    }

    try {
      await admin.from("notifications").insert({
        user_id: ticket.user_id,
        title: notifTitle,
        message: notifMessage,
        type: event === "closed" ? "info" : "support",
      });
    } catch (e) {
      console.error("notification insert failed", e);
    }

    // 2. Email via send-transactional-email
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(ticket.user_id);
      const recipientEmail = authUser?.user?.email;
      if (recipientEmail) {
        const templateData: Record<string, unknown> = {
          ticketNumber,
          subject,
        };
        if (event === "created") templateData.category = ticket.category;
        if (event === "reply") templateData.preview = message_preview ?? "";

        await admin.functions.invoke("send-transactional-email", {
          body: {
            templateName,
            recipientEmail,
            idempotencyKey: `support-${event}-${ticket_id}-${Date.now()}`,
            templateData,
          },
        });
      }
    } catch (e) {
      console.error("email send failed", e);
    }

    return new Response(JSON.stringify({ success: true, ticket_number: ticketNumber, event }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-support-ticket-event error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
