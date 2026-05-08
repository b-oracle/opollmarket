import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { sendNotificationEmail } from "../_shared/notificationEmail.ts";

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find all active markets to close.
    // Two branches:
    //   (a) Non-sports / non-auto-resolve markets — close when end_date <= today (date-only column)
    //   (b) Sports auto-resolve markets — close at exact kickoff (auto_resolve_deadline <= now())
    //       so betting is locked the moment the match starts.
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const nowIso = new Date().toISOString();

    const [genericRes, sportsRes, twitterRes, cryptoRes] = await Promise.all([
      // Generic markets: close when end_date <= today.
      // EXCLUDE crypto rounds — they live on intra-day deadlines (5m/15m/1h)
      // and must stay active until their precise `auto_resolve_deadline`.
      // Closing them by date-only `end_date` was flipping them to "ended"
      // the instant they spawned (since end_date == today).
      supabase
        .from("markets")
        .select("id, title, creator_wallet, auto_resolve, is_crypto_round")
        .eq("status", "active")
        .lte("end_date", today)
        .or("is_crypto_round.is.null,is_crypto_round.eq.false")
        .or("sport_match_id.is.null,auto_resolve.eq.false")
        .or("twitter_metric_type.is.null,auto_resolve.eq.false"),
      supabase
        .from("markets")
        .select("id, title, creator_wallet, auto_resolve, is_crypto_round")
        .eq("status", "active")
        .eq("auto_resolve", true)
        .not("sport_match_id", "is", null)
        .not("auto_resolve_deadline", "is", null)
        .lte("auto_resolve_deadline", nowIso),
      supabase
        .from("markets")
        .select("id, title, creator_wallet, auto_resolve, is_crypto_round")
        .eq("status", "active")
        .eq("auto_resolve", true)
        .not("twitter_metric_type", "is", null)
        .not("auto_resolve_deadline", "is", null)
        .lte("auto_resolve_deadline", nowIso),
      // Crypto Up/Down rounds: close at the exact intra-day deadline.
      supabase
        .from("markets")
        .select("id, title, creator_wallet, auto_resolve, is_crypto_round")
        .eq("status", "active")
        .eq("is_crypto_round", true)
        .not("auto_resolve_deadline", "is", null)
        .lte("auto_resolve_deadline", nowIso),
    ]);

    if (genericRes.error) {
      console.error("Generic fetch error:", genericRes.error);
      return new Response(JSON.stringify({ error: genericRes.error.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }
    if (sportsRes.error) {
      console.error("Sports fetch error:", sportsRes.error);
      return new Response(JSON.stringify({ error: sportsRes.error.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }
    if (twitterRes.error) {
      console.error("Twitter fetch error:", twitterRes.error);
    }

    // Merge & dedupe
    const seen = new Set<string>();
    const expiredMarkets = [
      ...(genericRes.data || []),
      ...(sportsRes.data || []),
      ...(twitterRes.data || []),
    ].filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    if (expiredMarkets.length === 0) {
      return new Response(
        JSON.stringify({ message: "No expired markets found", closed: 0 }),
        { headers: corsHeaders }
      );
    }

    console.log(`Found ${expiredMarkets.length} expired market(s) to close (${genericRes.data?.length ?? 0} generic, ${sportsRes.data?.length ?? 0} sports)`);

    let closed = 0;

    for (const market of expiredMarkets) {
      // Update status to 'ended'
      const { error: updateError } = await supabase
        .from("markets")
        .update({
          status: "ended",
          updated_at: new Date().toISOString(),
        })
        .eq("id", market.id)
        .eq("status", "active"); // prevent race conditions

      if (updateError) {
        console.error(`Failed to close market ${market.id}:`, updateError);
        continue;
      }

      // Notify the creator
      await supabase.from("notifications").insert({
        user_id: market.creator_wallet,
        title: "Market Ended ⏰",
        message: `Your market "${market.title}" has ended and is now awaiting resolution.`,
        type: "info",
        market_id: market.id,
      });

      // Compute volume + participant count for the email
      const { data: posStats } = await supabase
        .from("positions")
        .select("user_id, shares, avg_price")
        .eq("market_id", market.id)
        .gt("shares", 0);
      const totalVolume = (posStats ?? []).reduce(
        (s: number, p: any) => s + Number(p.shares ?? 0) * Number(p.avg_price ?? 0),
        0,
      );
      const participantCount = new Set((posStats ?? []).map((p: any) => p.user_id)).size;

      // Only email creator for MANUAL resolve markets — auto-resolve & crypto rounds resolve themselves
      const isAutoResolved = (market as any).auto_resolve === true || (market as any).is_crypto_round === true;
      if (!isAutoResolved) {
        await sendNotificationEmail({
          admin: supabase,
          userId: market.creator_wallet,
          templateName: "market-expired-creator",
          prefKey: "email_market_expired_creator",
          idempotencyKey: `market-expired-${market.id}`,
          templateData: {
            marketTitle: market.title,
            marketId: market.id,
            endedAt: new Date().toISOString(),
            totalVolume: Math.round(totalVolume * 100) / 100,
            participantCount,
          },
        });
      }

      // Notify all participants
      const { data: participants } = await supabase
        .from("positions")
        .select("user_id")
        .eq("market_id", market.id)
        .gt("shares", 0);

      if (participants && participants.length > 0) {
        const uniqueUserIds = [...new Set(participants.map((p) => p.user_id))];
        const notifications = uniqueUserIds
          .filter((uid) => uid !== market.creator_wallet) // don't double-notify creator
          .map((uid) => ({
            user_id: uid,
            title: "Market Ended ⏰",
            message: `A market you predicted on has ended: "${market.title}". Awaiting resolution.`,
            type: "info",
            market_id: market.id,
          }));

        if (notifications.length > 0) {
          await supabase.from("notifications").insert(notifications);
        }
      }

      closed++;
      console.log(`Closed market: ${market.id} — ${market.title}`);
    }

    return new Response(
      JSON.stringify({ message: `Closed ${closed} expired market(s)`, closed }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
