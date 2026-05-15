import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { verifyCronSecret } from "../_shared/cronAuth.ts";
import { getErrorMessage } from "../_shared/errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-cron-secret",
};

interface TwitterMetrics {
  like_count?: number;
  reply_count?: number;
  retweet_count?: number;
  quote_count?: number;
  impression_count?: number;
}

interface UserPublicMetrics {
  tweet_count?: number;
  followers_count?: number;
  following_count?: number;
}

// Fetch tweet public metrics (likes, replies, retweets)
async function fetchTweetMetrics(tweetId: string, bearerToken: string): Promise<TwitterMetrics | null> {
  try {
    const resp = await fetch(
      `https://api.x.com/2/tweets/${tweetId}?tweet.fields=public_metrics`,
      { headers: { Authorization: `Bearer ${bearerToken}` } }
    );
    if (!resp.ok) {
      console.error(`Twitter API error [${resp.status}]:`, await resp.text());
      return null;
    }
    const data = await resp.json();
    return data?.data?.public_metrics || null;
  } catch (e) {
    console.error("fetchTweetMetrics error:", e);
    return null;
  }
}

// Extract username from URL or return as-is if already a username/ID
function resolveResourceId(resourceId: string): { type: "username" | "id"; value: string } {
  const urlMatch = resourceId.match(/(?:twitter\.com|x\.com)\/(@?(\w+))/i);
  if (urlMatch) return { type: "username", value: urlMatch[2] };
  if (/^\d+$/.test(resourceId.trim())) return { type: "id", value: resourceId.trim() };
  return { type: "username", value: resourceId.replace(/^@/, "").trim() };
}

// Resolve a resource ID to a numeric Twitter user ID
async function resolveUserId(resourceId: string, bearerToken: string): Promise<string | null> {
  const resolved = resolveResourceId(resourceId);
  if (resolved.type === "id") return resolved.value;
  try {
    const resp = await fetch(
      `https://api.x.com/2/users/by/username/${resolved.value}`,
      { headers: { Authorization: `Bearer ${bearerToken}` } }
    );
    if (!resp.ok) { console.error("resolveUserId error:", await resp.text()); return null; }
    const data = await resp.json();
    return data?.data?.id ?? null;
  } catch (e) { console.error("resolveUserId error:", e); return null; }
}

// Fetch user public metrics (all-time tweet count)
async function fetchUserMetrics(resourceId: string, bearerToken: string): Promise<UserPublicMetrics | null> {
  try {
    const resolved = resolveResourceId(resourceId);
    const endpoint = resolved.type === "username"
      ? `https://api.x.com/2/users/by/username/${resolved.value}?user.fields=public_metrics`
      : `https://api.x.com/2/users/${resolved.value}?user.fields=public_metrics`;
    const resp = await fetch(endpoint, { headers: { Authorization: `Bearer ${bearerToken}` } });
    if (!resp.ok) { console.error(`Twitter User API error [${resp.status}]:`, await resp.text()); return null; }
    const data = await resp.json();
    return data?.data?.public_metrics || null;
  } catch (e) { console.error("fetchUserMetrics error:", e); return null; }
}

// Count tweets in a date range by paginating the user timeline
async function fetchUserTweetCountInRange(
  resourceId: string,
  bearerToken: string,
  startTime: string,
  endTime: string
): Promise<number | null> {
  try {
    const userId = await resolveUserId(resourceId, bearerToken);
    if (!userId) return null;

    let total = 0;
    let paginationToken: string | undefined;
    let pages = 0;
    const maxPages = 20; // safety limit (20 * 100 = 2000 tweets max)

    do {
      let url = `https://api.x.com/2/users/${userId}/tweets?max_results=100&start_time=${startTime}&end_time=${endTime}`;
      if (paginationToken) url += `&pagination_token=${paginationToken}`;

      console.log(`Fetching timeline page ${pages + 1}:`, url);
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${bearerToken}` } });
      if (!resp.ok) {
        console.error(`Timeline API error [${resp.status}]:`, await resp.text());
        return total > 0 ? total : null;
      }
      const data = await resp.json();
      total += data?.meta?.result_count ?? 0;
      paginationToken = data?.meta?.next_token;
      pages++;
    } while (paginationToken && pages < maxPages);

    console.log(`Total tweets in range: ${total} (${pages} pages)`);
    return total;
  } catch (e) {
    console.error("fetchUserTweetCountInRange error:", e);
    return null;
  }
}

// Sum impression_count across user's tweets in a date range
async function fetchUserImpressionsInRange(
  resourceId: string,
  bearerToken: string,
  startTime: string,
  endTime: string
): Promise<number | null> {
  try {
    const userId = await resolveUserId(resourceId, bearerToken);
    if (!userId) return null;

    let totalImpressions = 0;
    let paginationToken: string | undefined;
    let pages = 0;
    const maxPages = 20;

    do {
      let url = `https://api.x.com/2/users/${userId}/tweets?max_results=100&tweet.fields=public_metrics&start_time=${startTime}&end_time=${endTime}`;
      if (paginationToken) url += `&pagination_token=${paginationToken}`;

      console.log(`Fetching impressions page ${pages + 1}:`, url);
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${bearerToken}` } });
      if (!resp.ok) {
        console.error(`Timeline API error [${resp.status}]:`, await resp.text());
        return totalImpressions > 0 ? totalImpressions : null;
      }
      const data = await resp.json();
      const tweets = data?.data || [];
      for (const tweet of tweets) {
        totalImpressions += tweet.public_metrics?.impression_count ?? 0;
      }
      paginationToken = data?.meta?.next_token;
      pages++;
    } while (paginationToken && pages < maxPages);

    console.log(`Total impressions in range: ${totalImpressions} (${pages} pages)`);
    return totalImpressions;
  } catch (e) {
    console.error("fetchUserImpressionsInRange error:", e);
    return null;
  }
}

// Check if a resource ID looks like a username (not a tweet ID)
function isUsername(resourceId: string): boolean {
  const resolved = resolveResourceId(resourceId);
  return resolved.type === "username";
}

function extractCount(metricType: string, tweetMetrics: TwitterMetrics | null, userMetrics: UserPublicMetrics | null): number | null {
  if (metricType === "likes" && tweetMetrics) return tweetMetrics.like_count ?? null;
  if (metricType === "replies" && tweetMetrics) return tweetMetrics.reply_count ?? null;
  if (metricType === "retweets" && tweetMetrics) return (tweetMetrics.retweet_count ?? 0) + (tweetMetrics.quote_count ?? 0);
  if ((metricType === "views" || metricType === "impressions") && tweetMetrics) return tweetMetrics.impression_count ?? null;
  if (metricType === "tweets" && userMetrics) return userMetrics.tweet_count ?? null;
  if (metricType === "posts" && userMetrics) return userMetrics.tweet_count ?? null;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronCheck = verifyCronSecret(req, { functionName: "fetch-twitter-metrics", corsHeaders });
  if (!cronCheck.ok) return cronCheck.response!;

  try {
    const bearerToken = Deno.env.get("X_BEARER_TOKEN");
    if (!bearerToken) {
      return new Response(JSON.stringify({ error: "X_BEARER_TOKEN not configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check if called with specific params (single market query from frontend)
    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    // Single metric fetch for frontend live counter
    if (body.metric_type && body.resource_id) {
      let count: number | null = null;
      const isUserBased = isUsername(body.resource_id);
      const isRangeMetric = body.metric_type === "tweets" || body.metric_type === "posts";
      const isImpressionsMetric = body.metric_type === "impressions" || body.metric_type === "views";

      if ((isRangeMetric || (isImpressionsMetric && isUserBased)) && body.market_id) {
        const { data: mkt } = await adminClient
          .from("markets")
          .select("created_at, end_date, auto_resolve_deadline")
          .eq("id", body.market_id)
          .single();
        if (mkt) {
          const startTime = new Date(mkt.created_at).toISOString();
          // Prefer auto_resolve_deadline (the true measurement window) over end_date
          const endTime = mkt.auto_resolve_deadline
            ? new Date(mkt.auto_resolve_deadline).toISOString()
            : new Date(mkt.end_date + "T23:59:59Z").toISOString();
          if (isImpressionsMetric && isUserBased) {
            count = await fetchUserImpressionsInRange(body.resource_id, bearerToken, startTime, endTime);
          } else {
            count = await fetchUserTweetCountInRange(body.resource_id, bearerToken, startTime, endTime);
          }
        }
      } else if (isRangeMetric) {
        const userMetrics = await fetchUserMetrics(body.resource_id, bearerToken);
        count = extractCount(body.metric_type, null, userMetrics);
      } else {
        const tweetMetrics = await fetchTweetMetrics(body.resource_id, bearerToken);
        count = extractCount(body.metric_type, tweetMetrics, null);
      }
      return new Response(JSON.stringify({ count }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Bulk update: fetch all active Twitter markets and update their counts
    const { data: markets, error: fetchErr } = await adminClient
      .from("markets")
      .select("id, twitter_metric_type, twitter_resource_id, created_at, end_date, auto_resolve_deadline")
      .in("status", ["active", "ended"])
      .not("twitter_metric_type", "is", null)
      .not("twitter_resource_id", "is", null);

    if (fetchErr) {
      console.error("Failed to fetch twitter markets:", fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!markets || markets.length === 0) {
      return new Response(JSON.stringify({ message: "No Twitter markets to update", updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updatedCount = 0;

    for (const market of markets) {
      const metricType = market.twitter_metric_type as string;
      const resourceId = market.twitter_resource_id as string;
      const isUserBased = isUsername(resourceId);
      const isRangeMetric = metricType === "tweets" || metricType === "posts";
      const isImpressionsMetric = metricType === "impressions" || metricType === "views";

      let count: number | null = null;
      if (isRangeMetric || (isImpressionsMetric && isUserBased)) {
        const startTime = new Date(market.created_at).toISOString();
        // Prefer auto_resolve_deadline (the true measurement window) over end_date
        const endTime = market.auto_resolve_deadline
          ? new Date(market.auto_resolve_deadline).toISOString()
          : new Date(market.end_date + "T23:59:59Z").toISOString();
        if (isImpressionsMetric && isUserBased) {
          count = await fetchUserImpressionsInRange(resourceId, bearerToken, startTime, endTime);
        } else {
          count = await fetchUserTweetCountInRange(resourceId, bearerToken, startTime, endTime);
        }
      } else {
        const tweetMetrics = await fetchTweetMetrics(resourceId, bearerToken);
        count = extractCount(metricType, tweetMetrics, null);
      }

      if (count !== null) {
        await adminClient
          .from("markets")
          .update({ twitter_current_count: count })
          .eq("id", market.id);
        updatedCount++;
      }
    }

    return new Response(
      JSON.stringify({ message: "Twitter metrics updated", updated: updatedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("fetch-twitter-metrics error:", err);
    return new Response(JSON.stringify({ error: (getErrorMessage(err)) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
