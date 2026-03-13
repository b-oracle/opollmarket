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
    // Fetch live USD→NGN rate from ExchangeRate-API (primary) then Frankfurter (fallback)
    let liveRate: number | null = null;

    // Primary: ExchangeRate-API
    const exchangeRateKey = Deno.env.get("EXCHANGERATE_API_KEY");
    if (exchangeRateKey) {
      try {
        const res = await fetch(
          `https://v6.exchangerate-api.com/v6/${exchangeRateKey}/pair/USD/NGN`
        );
        if (res.ok) {
          const json = await res.json();
          if (json.result === "success" && json.conversion_rate) {
            liveRate = json.conversion_rate;
          }
        }
      } catch (e) {
        console.error("ExchangeRate-API failed:", e);
      }
    }

    // Fallback: Frankfurter (free, no key)
    if (!liveRate) {
      try {
        const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=NGN");
        if (res.ok) {
          const json = await res.json();
          if (json.rates?.NGN) {
            liveRate = json.rates.NGN;
          }
        }
      } catch (e) {
        console.error("Frankfurter fallback failed:", e);
      }
    }

    if (!liveRate) {
      return new Response(
        JSON.stringify({ error: "Could not fetch live exchange rate" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get admin markup from commission_settings
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settings } = await adminClient
      .from("commission_settings")
      .select("naira_rate_markup")
      .limit(1)
      .single();

    const markupPercent = (settings as any)?.naira_rate_markup ?? 0;
    const effectiveRate = liveRate * (1 + markupPercent / 100);

    return new Response(
      JSON.stringify({
        live_rate: liveRate,
        markup_percent: markupPercent,
        effective_rate: Math.round(effectiveRate * 100) / 100,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("get-naira-rate error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
