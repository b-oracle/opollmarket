import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { getErrorMessage } from "../_shared/errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Auto-posts platform activities to the official OPollmarket X account.
 * Uses platform-level X API credentials (OAuth 1.0a app-level tokens).
 *
 * Body: { event_type: string, variables?: Record<string, string> }
 */

async function postTweet(text: string): Promise<{ success: boolean; tweet_id?: string; error?: string }> {
  const consumerKey = Deno.env.get("TWITTER_CONSUMER_KEY");
  const consumerSecret = Deno.env.get("TWITTER_CONSUMER_SECRET");
  const accessToken = Deno.env.get("TWITTER_ACCESS_TOKEN");
  const accessTokenSecret = Deno.env.get("TWITTER_ACCESS_TOKEN_SECRET");

  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    return { success: false, error: "Platform X credentials not configured" };
  }

  // OAuth 1.0a signature generation
  const method = "POST";
  const url = "https://api.x.com/2/tweets";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID().replace(/-/g, "");

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: "1.0",
  };

  // Create signature base string (do NOT include POST body params for JSON content type)
  const sortedParams = Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const signatureBase = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(accessTokenSecret)}`;

  // HMAC-SHA1
  const keyData = new TextEncoder().encode(signingKey);
  const msgData = new TextEncoder().encode(signatureBase);
  const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));

  const authHeader =
    "OAuth " +
    Object.entries({ ...oauthParams, oauth_signature: signature })
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
      .join(", ");

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("Tweet post failed:", resp.status, errText);
    return { success: false, error: `X API error ${resp.status}: ${errText}` };
  }

  const data = await resp.json();
  return { success: true, tweet_id: data.data?.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { event_type, variables } = (await req.json()) as {
      event_type: string;
      variables?: Record<string, string>;
    };

    if (!event_type) {
      return new Response(JSON.stringify({ error: "event_type is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Check if this event type has auto-post enabled
    const { data: setting, error: settingError } = await supabase
      .from("twitter_auto_post_settings")
      .select("*")
      .eq("event_type", event_type)
      .eq("enabled", true)
      .maybeSingle();

    if (settingError) {
      console.error("Error fetching auto-post setting:", settingError);
      throw settingError;
    }

    if (!setting) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "Auto-post not enabled for this event" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Apply template variables
    const vars = variables || {};
    const tweetText = setting.tweet_template.replace(
      /\{\{(\w+)\}\}/g,
      (_: string, key: string) => vars[key] || `{{${key}}}`
    );

    // Truncate to 280 chars
    const finalText = tweetText.length > 280 ? tweetText.slice(0, 277) + "..." : tweetText;

    const result = await postTweet(finalText);

    if (!result.success) {
      console.error(`Auto-post failed for ${event_type}:`, result.error);
      return new Response(JSON.stringify({ error: result.error }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Auto-posted tweet for ${event_type}: ${result.tweet_id}`);

    return new Response(
      JSON.stringify({ success: true, event_type, tweet_id: result.tweet_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("twitter-auto-post error:", err);
    return new Response(JSON.stringify({ error: (getErrorMessage(err)) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
