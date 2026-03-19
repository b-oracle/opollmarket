import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// This function is now a thin redirect to request-payaza-withdrawal which handles
// both providers with server-side fallback. Keeping this function to avoid breaking
// any existing references.

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
    // Forward to the unified NGN withdrawal handler
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/request-payaza-withdrawal`;
    const body = await req.text();

    const forwardRes = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": req.headers.get("Authorization") || "",
        "Content-Type": "application/json",
        "apikey": Deno.env.get("SUPABASE_ANON_KEY") || "",
      },
      body,
    });

    const responseBody = await forwardRes.text();
    return new Response(responseBody, {
      status: forwardRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("request-flutterwave-withdrawal proxy error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
