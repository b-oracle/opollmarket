import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
  // Handle full URLs like https://x.com/elonmusk?s=21&t=...
  const urlMatch = resourceId.match(/(?:twitter\.com|x\.com)\/(@?(\w+))/i);
  if (urlMatch) {
    const username = urlMatch[2];
    return { type: "username", value: username };
  }
  // If it's purely numeric, treat as user ID
  if (/^\d+$/.test(resourceId.trim())) {
    return { type: "id", value: resourceId.trim() };
  }
  // Otherwise treat as username
  return { type: "username", value: resourceId.replace(/^@/, "").trim() };
}

// Fetch user public metrics (tweet count)
async function fetchUserMetrics(resourceId: string, bearerToken: string): Promise<UserPublicMetrics | null> {
  try {
    const resolved = resolveResourceId(resourceId);
    console.log("Resolved resource:", JSON.stringify(resolved), "from:", resourceId);
    const endpoint = resolved.type === "username"
      ? `https://api.x.com/2/users/by/username/${resolved.value}?user.fields=public_metrics`
      : `https://api.x.com/2/users/${resolved.value}?user.fields=public_metrics`;
    console.log("Fetching:", endpoint);
    const resp = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`Twitter User API error [${resp.status}]:`, errText);
      return null;
    }
    const data = await resp.json();
    return data?.data?.public_metrics || null;
  } catch (e) {
    console.error("fetchUserMetrics error:", e);
    return null;
  }
}

// Fetch user tweet count in a date range using tweets/counts endpoint
async function fetchUserTweetCount(
  userId: string,
  bearerToken: string,
  startTime?: string,
  endTime?: string
): Promise<number | null> {
  try {
    let url = `https://api.x.com/2/users/${userId}/tweets?max_results=100`;
    if (startTime) url += `&start_time=${startTime}`;
    if (endTime) url += `&end_time=${endTime}`;

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    if (!resp.ok) {
      console.error(`Twitter tweets count error [${resp.status}]:`, await resp.text());
      return null;
    }
    const data = await resp.json();
    return data?.meta?.result_count ?? null;
  } catch (e) {
    console.error("fetchUserTweetCount error:", e);
    return null;
  }
}

function extractCount(metricType: string, tweetMetrics: TwitterMetrics | null, userMetrics: UserPublicMetrics | null): number | null {
  if (metricType === "likes" && tweetMetrics) return tweetMetrics.like_count ?? null;
  if (metricType === "replies" && tweetMetrics) return tweetMetrics.reply_count ?? null;
  if (metricType === "retweets" && tweetMetrics) return (tweetMetrics.retweet_count ?? 0) + (tweetMetrics.quote_count ?? 0);
  if (metricType === "views" && tweetMetrics) return tweetMetrics.impression_count ?? null;
  if (metricType === "tweets" && userMetrics) return userMetrics.tweet_count ?? null;
  if (metricType === "posts" && userMetrics) return userMetrics.tweet_count ?? null;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
      if (body.metric_type === "tweets" || body.metric_type === "posts") {
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
      .select("id, twitter_metric_type, twitter_resource_id")
      .eq("status", "active")
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

      let count: number | null = null;
      if (metricType === "tweets" || metricType === "posts") {
        const userMetrics = await fetchUserMetrics(resourceId, bearerToken);
        count = extractCount(metricType, null, userMetrics);
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
