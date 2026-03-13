import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function encodePayazaAuth(secretKey: string): string {
  return `Payaza ${btoa(secretKey)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: corsHeaders,
      });
    }

    const { bank_code, account_number } = await req.json();

    if (!bank_code || !account_number || account_number.length < 10) {
      return new Response(
        JSON.stringify({ error: "Valid bank code and 10-digit account number required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const secretKey = Deno.env.get("PAYAZA_SECRET_KEY");
    if (!secretKey) {
      // No key configured — allow manual confirmation
      return new Response(
        JSON.stringify({ account_name: "", manual_confirm: true, message: "Please confirm your account name manually" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payazaAuthorization = encodePayazaAuth(secretKey);
    const proxyUrl = Deno.env.get("QUOTAGUARD_URL");

    // Prioritised endpoint list — most likely working first
    const endpoints = [
      "https://api.payaza.africa/live/merchant-payout/account/name_enquiry/",
      "https://api.payaza.africa/live/merchant-payout/name_enquiry/",
      "https://api.payaza.africa/live/merchant-payout/name-enquiry/",
      "https://api.payaza.africa/live/merchant-payout/resolve_account/",
    ];

    const payload = {
      account_number,
      bank_code,
      currency: "NGN",
    };

    const fetchOpts = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": payazaAuthorization,
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    };

    let accountName = "";

    for (const url of endpoints) {
      try {
        // Try via proxy first, then direct
        const attempts: Array<{ label: string; opts: any }> = [];

        if (proxyUrl) {
          const httpClient = Deno.createHttpClient({ proxy: { url: proxyUrl } });
          attempts.push({ label: "Proxy", opts: { ...fetchOpts, /* @ts-ignore */ client: httpClient } });
        }
        attempts.push({ label: "Direct", opts: fetchOpts });

        for (const attempt of attempts) {
          try {
            const res = await fetch(url, attempt.opts);
            const text = await res.text();
            console.log(`${attempt.label} ${url} → ${res.status}: ${text.substring(0, 200)}`);

            // Close proxy client if applicable
            if (attempt.opts.client) {
              try { attempt.opts.client.close(); } catch {}
            }

            if (text.includes("<html") || text.includes("<!DOCTYPE")) continue;

            if (res.ok) {
              try {
                const data = JSON.parse(text);
                const responseData = data?.data || data?.response_content || data;
                accountName = responseData?.account_name || responseData?.accountName || responseData?.name || "";
                if (accountName) break;
              } catch {
                continue;
              }
            }
          } catch (err) {
            console.warn(`${attempt.label} ${url} fetch error:`, String(err));
            if (attempt.opts.client) {
              try { attempt.opts.client.close(); } catch {}
            }
          }
        }

        if (accountName) break;
      } catch (err) {
        console.warn(`Endpoint ${url} error:`, String(err));
      }
    }

    // If name enquiry succeeded, return the name
    if (accountName) {
      return new Response(
        JSON.stringify({ account_name: accountName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Graceful degradation: all endpoints failed — allow manual confirmation
    console.warn("All Payaza name enquiry endpoints failed. Falling back to manual confirmation.");
    return new Response(
      JSON.stringify({
        account_name: "",
        manual_confirm: true,
        message: "We couldn't auto-verify the account name. Please confirm it manually before proceeding.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("verify-bank-account error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
