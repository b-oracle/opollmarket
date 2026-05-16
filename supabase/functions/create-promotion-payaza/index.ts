import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildPayazaWebhookUrl, encodePayazaAuth } from "../_shared/payaza.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_BOOST_TIERS: Record<string, { durationHours: number; price: number; rank: number }> = {
  flash: { durationHours: 12, price: 20, rank: 1 },
  standard: { durationHours: 24, price: 50, rank: 2 },
  whale: { durationHours: 168, price: 150, rank: 3 },
};
let DEFAULT_BROADCAST_PRICE = 5;

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
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const { market_id, boost_tier, include_broadcast } = await req.json();

    if (!market_id) {
      return new Response(JSON.stringify({ error: "market_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (boost_tier && !DEFAULT_BOOST_TIERS[boost_tier]) {
      return new Response(JSON.stringify({ error: "Invalid boost tier" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load dynamic pricing
    const BOOST_TIERS = { ...DEFAULT_BOOST_TIERS };
    BOOST_TIERS.flash = { ...BOOST_TIERS.flash };
    BOOST_TIERS.standard = { ...BOOST_TIERS.standard };
    BOOST_TIERS.whale = { ...BOOST_TIERS.whale };
    let BROADCAST_PRICE = DEFAULT_BROADCAST_PRICE;
    try {
      const { data: cs } = await adminClient
        .from("commission_settings")
        .select("boost_flash_price, boost_standard_price, boost_whale_price, broadcast_price, fallback_naira_rate")
        .limit(1)
        .single();
      if (cs) {
        BOOST_TIERS.flash.price = Number(cs.boost_flash_price) || 20;
        BOOST_TIERS.standard.price = Number(cs.boost_standard_price) || 50;
        BOOST_TIERS.whale.price = Number(cs.boost_whale_price) || 150;
        if (cs.broadcast_price != null) BROADCAST_PRICE = Number(cs.broadcast_price);
      }
    } catch { /* use defaults */ }

    const tierConfig = boost_tier ? BOOST_TIERS[boost_tier] : null;
    const boostCost = tierConfig?.price || 0;
    const broadcastCost = include_broadcast ? BROADCAST_PRICE : 0;
    const totalUsd = boostCost + broadcastCost;

    if (totalUsd <= 0) {
      return new Response(JSON.stringify({ error: "No items selected" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check existing active boost (block downgrades)
    if (tierConfig) {
      const now = new Date().toISOString();
      const { data: existingBoosts } = await adminClient
        .from("market_boosts")
        .select("id, tier, ends_at")
        .eq("market_id", market_id)
        .eq("status", "active")
        .gte("ends_at", now)
        .order("ends_at", { ascending: false })
        .limit(1);

      if (existingBoosts?.[0]) {
        const existingRank = BOOST_TIERS[existingBoosts[0].tier]?.rank || 0;
        if (tierConfig.rank < existingRank) {
          return new Response(JSON.stringify({
            error: `This market already has an active ${existingBoosts[0].tier} boost. Select same or higher tier.`,
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Get exchange rate
    let configuredFallback = 1500;
    try {
      const { data: settings } = await adminClient
        .from("commission_settings")
        .select("fallback_naira_rate")
        .limit(1)
        .single();
      if (settings?.fallback_naira_rate) {
        configuredFallback = Number(settings.fallback_naira_rate);
      }
    } catch { /* use default */ }

    let ngnAmount = Math.ceil(totalUsd * configuredFallback);
    let effectiveRate: number | null = configuredFallback;
    try {
      const rateRes = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/get-naira-rate`,
        {
          headers: {
            Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
        }
      );
      if (rateRes.ok) {
        const rateData = await rateRes.json();
        effectiveRate = rateData.effective_rate;
        ngnAmount = Math.ceil(totalUsd * effectiveRate!);
      }
    } catch { /* use fallback */ }

    const secretKey = Deno.env.get("PAYAZA_SECRET_KEY");
    if (!secretKey) {
      return new Response(JSON.stringify({ error: "Fiat payment service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = user?.email || "customer@opoll.com";
    const firstName = email.split("@")[0];

    // Build a unique reference encoding what's being purchased
    const items = [];
    if (boost_tier) items.push(`boost_${boost_tier}`);
    if (include_broadcast) items.push("broadcast");
    const transactionReference = `promo_${market_id.substring(0, 8)}_${items.join("_")}_${userId.substring(0, 8)}_${Date.now()}`;

    // Insert pending boost record
    let boostId: string | null = null;
    if (tierConfig) {
      const endsAt = new Date(Date.now() + tierConfig.durationHours * 60 * 60 * 1000);
      const { data: boost } = await adminClient
        .from("market_boosts")
        .insert({
          market_id,
          tier: boost_tier,
          amount: tierConfig.price,
          payer_wallet: userId,
          ends_at: endsAt.toISOString(),
          status: "pending",
          nowpayments_payment_id: transactionReference,
        })
        .select("id")
        .single();
      boostId = boost?.id || null;
    }

    // Insert pending broadcast record
    let broadcastId: string | null = null;
    if (include_broadcast) {
      const { data: broadcast } = await adminClient
        .from("market_broadcasts")
        .insert({
          market_id,
          user_id: userId,
          tier: "alert",
          amount: BROADCAST_PRICE,
          status: "pending",
          nowpayments_payment_id: transactionReference,
        })
        .select("id")
        .single();
      broadcastId = broadcast?.id || null;
    }

    // Insert a pending deposit transaction so the payaza-webhook can credit & activate
    await adminClient.from("transactions").insert({
      user_id: userId,
      type: "deposit",
      amount: totalUsd,
      status: "pending",
      payment_provider: "payaza",
      nowpayments_payment_id: transactionReference,
      side: `promotion_${items.join("_")}`,
      market_id,
      expected_amount_ngn: ngnAmount,
      exchange_rate_ngn: effectiveRate ?? configuredFallback,
    });

    // Create Payaza virtual account
    const payazaBaseUrl = "https://api.payaza.africa";
    const endpoint = "/live/merchant-collection/merchant/virtual_account/generate_virtual_account/";
    const fullUrl = `${payazaBaseUrl}${endpoint}`;
    const webhookToken = Deno.env.get("PAYAZA_WEBHOOK_TOKEN");
    const webhookUrl = buildPayazaWebhookUrl(
      Deno.env.get("SUPABASE_URL")!,
      webhookToken,
    );

    const virtualAccountPayload = {
      account_name: firstName,
      account_type: "Dynamic",
      bank_code: "1067",
      account_reference: transactionReference,
      customer_first_name: firstName,
      customer_last_name: "User",
      customer_email: email,
      customer_phone_number: "08000000000",
      transaction_amount: ngnAmount,
      has_amount_validation: true,
      transaction_description: `Promotion: ${items.join(" + ")} for market (₦${ngnAmount.toLocaleString()})`,
      expires_in_minutes: 60,
      callback_url: webhookUrl,
      webhook_url: webhookUrl,
    };

    const payazaAuthorization = encodePayazaAuth(secretKey);
    const proxyUrl = Deno.env.get("QUOTAGUARD_URL");

    let payazaResponse: Response | null = null;

    if (proxyUrl) {
      try {
        const httpClient = Deno.createHttpClient({ proxy: { url: proxyUrl } });
        payazaResponse = await fetch(fullUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": payazaAuthorization,
            "Accept": "application/json",
          },
          body: JSON.stringify(virtualAccountPayload),
          // @ts-ignore
          client: httpClient,
        });
        httpClient.close();
        const preview = await payazaResponse.clone().text();
        if (preview.includes("<html") || preview.includes("<!DOCTYPE")) {
          payazaResponse = null;
        }
      } catch { payazaResponse = null; }
    }

    if (!payazaResponse) {
      try {
        payazaResponse = await fetch(fullUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": payazaAuthorization,
            "Accept": "application/json",
          },
          body: JSON.stringify(virtualAccountPayload),
        });
        const preview = await payazaResponse.clone().text();
        if (preview.includes("<html") || preview.includes("<!DOCTYPE")) {
          payazaResponse = null;
        }
      } catch { payazaResponse = null; }
    }

    if (!payazaResponse) {
      return new Response(JSON.stringify({ error: "Payment service temporarily unavailable" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payazaText = await payazaResponse.text();
    let payazaData: any;
    try {
      payazaData = JSON.parse(payazaText);
    } catch {
      return new Response(JSON.stringify({ error: "Payment service returned invalid response" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!payazaResponse.ok) {
      return new Response(JSON.stringify({ error: payazaData?.message || "Failed to create payment" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const responseData = payazaData?.data || payazaData?.response_content || payazaData;
    const bankName = responseData?.bank_name || responseData?.virtual_account_bank || "Transfer Bank";
    const accountNumber = responseData?.account_number || responseData?.virtual_account_number || "";
    const accountName = responseData?.account_name || responseData?.virtual_account_name || "Opoll";
    const expiresAt = responseData?.expires_at || responseData?.expiry_datetime || null;

    return new Response(JSON.stringify({
      boost_id: boostId,
      broadcast_id: broadcastId,
      transaction_reference: transactionReference,
      bank_name: bankName,
      account_number: accountNumber,
      account_name: accountName,
      amount_ngn: ngnAmount,
      amount_usd: totalUsd,
      exchange_rate: effectiveRate,
      expires_at: expiresAt,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-promotion-payaza error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
