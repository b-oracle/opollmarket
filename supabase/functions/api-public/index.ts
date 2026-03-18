import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ error: message }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Check if public API is enabled via feature toggle
  const { data: apiToggle } = await admin
    .from("feature_toggles")
    .select("enabled")
    .eq("feature_key", "public_api")
    .maybeSingle();

  if (apiToggle && !apiToggle.enabled) {
    return err("Public API is currently disabled", 503);
  }

  // --- Validate API key (except embed-data which is public) ---
  let apiKeyRecord: any = null;

  if (action !== "embed-data") {
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) return err("Missing X-API-Key header", 401);

    const { data: keyRow } = await admin
      .from("api_keys")
      .select("*")
      .eq("api_key", apiKey)
      .eq("is_active", true)
      .maybeSingle();

    if (!keyRow) return err("Invalid or inactive API key", 401);
    apiKeyRecord = keyRow;

    // Rate limiting
    const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin
      .from("api_request_logs")
      .select("id", { count: "exact", head: true })
      .eq("api_key_id", keyRow.id)
      .gte("created_at", oneMinAgo);

    if ((count ?? 0) >= keyRow.rate_limit_per_min) {
      return err("Rate limit exceeded. Try again later.", 429);
    }

    // Log request
    await admin.from("api_request_logs").insert({
      api_key_id: keyRow.id,
      endpoint: action || "unknown",
      ip: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown",
    });
  }

  // --- Helper: check permission ---
  const hasPermission = (perm: string) => {
    if (!apiKeyRecord) return false;
    const perms = apiKeyRecord.permissions as string[];
    return perms.includes(perm) || perms.includes("all");
  };

  // --- Helper: get authenticated user from bearer token ---
  const getAuthUser = async () => {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data, error } = await userClient.auth.getClaims(token);
    if (error || !data?.claims) return null;
    return data.claims.sub as string;
  };

  try {
    // ==================== MARKETS LIST ====================
    if (action === "markets" && req.method === "GET") {
      if (!hasPermission("read")) return err("Permission denied", 403);

      const category = url.searchParams.get("category");
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const status = url.searchParams.get("status") || "active";

      let query = admin
        .from("markets")
        .select("id, title, description, category, yes_price, no_price, volume, participants, end_date, status, image_url, market_type, created_at")
        .eq("status", status)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (category) query = query.eq("category", category);

      const { data, error } = await query;
      if (error) return err(error.message, 500);
      return json({ markets: data, count: data?.length ?? 0 });
    }

    // ==================== SINGLE MARKET ====================
    if (action === "market" && req.method === "GET") {
      if (!hasPermission("read")) return err("Permission denied", 403);

      const id = url.searchParams.get("id");
      if (!id) return err("Missing id parameter");

      const { data, error } = await admin
        .from("markets")
        .select("id, title, description, details, category, yes_price, no_price, volume, participants, end_date, status, image_url, market_type, resolution_source, created_at, liquidity")
        .eq("id", id)
        .maybeSingle();

      if (error) return err(error.message, 500);
      if (!data) return err("Market not found", 404);

      // Also fetch options for multi-option markets
      let options = null;
      if (data.market_type === "multi") {
        const { data: opts } = await admin
          .from("market_options")
          .select("id, label, price, sort_order")
          .eq("market_id", id)
          .order("sort_order");
        options = opts;
      }

      return json({ market: { ...data, options } });
    }

    // ==================== EMBED DATA (public, no API key) ====================
    if (action === "embed-data" && req.method === "GET") {
      const id = url.searchParams.get("id");
      if (!id) return err("Missing id parameter");

      const { data, error } = await admin
        .from("markets")
        .select("id, title, category, yes_price, no_price, volume, participants, end_date, status, image_url, market_type")
        .eq("id", id)
        .maybeSingle();

      if (error) return err(error.message, 500);
      if (!data) return err("Market not found", 404);

      let options = null;
      if (data.market_type === "multi") {
        const { data: opts } = await admin
          .from("market_options")
          .select("id, label, price, sort_order")
          .eq("market_id", id)
          .order("sort_order");
        options = opts;
      }

      return json({ market: { ...data, options } });
    }

    // ==================== USER BALANCE ====================
    if (action === "balance" && req.method === "GET") {
      if (!hasPermission("read")) return err("Permission denied", 403);

      const userId = url.searchParams.get("user_id");
      if (!userId) return err("Missing user_id parameter");

      const { data, error } = await admin
        .from("balances")
        .select("amount, bonus_balance, currency")
        .eq("user_id", userId)
        .eq("currency", "USDT")
        .maybeSingle();

      if (error) return err(error.message, 500);
      return json({ balance: data || { amount: 0, bonus_balance: 0, currency: "USDT" } });
    }

    // ==================== USER POSITIONS ====================
    if (action === "positions" && req.method === "GET") {
      if (!hasPermission("read")) return err("Permission denied", 403);

      const userId = url.searchParams.get("user_id");
      if (!userId) return err("Missing user_id parameter");

      const { data, error } = await admin
        .from("positions")
        .select("id, market_id, side, shares, avg_price, option_id, created_at, markets(title, status, yes_price, no_price)")
        .eq("user_id", userId)
        .gt("shares", 0);

      if (error) return err(error.message, 500);
      return json({ positions: data });
    }

    // ==================== PLACE BET ====================
    if (action === "place-bet" && req.method === "POST") {
      if (!hasPermission("trade")) return err("Permission denied: trade not allowed", 403);

      const userId = await getAuthUser();
      if (!userId) return err("User authentication required", 401);

      const body = await req.json();
      const { marketId, side, amount, optionId } = body;

      if (!marketId || !amount) return err("Missing marketId or amount");
      if (amount <= 0 || amount > 10000) return err("Amount must be between 0 and 10000");

      // Invoke the existing place-bet edge function
      const placeBetUrl = `${supabaseUrl}/functions/v1/place-bet`;
      const resp = await fetch(placeBetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: req.headers.get("authorization") || "",
          apikey: anonKey,
        },
        body: JSON.stringify({ marketId, side, amount, optionId, apiKeyId: apiKeyRecord?.id }),
      });

      const result = await resp.json();

      // Track affiliate earnings if bet was successful
      if (resp.ok && result.success && apiKeyRecord) {
        try {
          const commPercent = apiKeyRecord.affiliate_commission_percent || 5;
          // Get prediction fee percent from settings
          const { data: settings } = await admin
            .from("commission_settings")
            .select("prediction_fee_percent")
            .limit(1)
            .single();
          const feePercent = settings?.prediction_fee_percent || 10;
          const feeAmount = amount * (feePercent / 100);
          const commissionAmount = feeAmount * (commPercent / 100);

          if (result.transaction_id) {
            // Tag transaction with api_key_id
            await admin.from("transactions").update({ api_key_id: apiKeyRecord.id }).eq("id", result.transaction_id);

            // Record affiliate earning
            await admin.from("affiliate_earnings").insert({
              api_key_id: apiKeyRecord.id,
              transaction_id: result.transaction_id,
              bet_amount: amount,
              fee_amount: feeAmount,
              commission_percent: commPercent,
              commission_amount: commissionAmount,
              status: "pending",
            });
          }
        } catch (affErr) {
          console.warn("Affiliate tracking failed (non-critical):", affErr);
        }
      }

      return json(result, resp.status);
    }

    // ==================== CREATE USER ====================
    if (action === "create-user" && req.method === "POST") {
      if (!hasPermission("trade")) return err("Permission denied", 403);

      const body = await req.json();
      const { email, password } = body;
      if (!email || !password) return err("Missing email or password");

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (error) return err(error.message, 400);
      return json({ user: { id: data.user.id, email: data.user.email } });
    }

    // ==================== DEPOSIT ====================
    if (action === "deposit" && req.method === "POST") {
      if (!hasPermission("deposit")) return err("Permission denied: deposit not allowed", 403);

      const userId = await getAuthUser();
      if (!userId) return err("User authentication required", 401);

      const body = await req.json();
      const { amount, currency } = body;
      if (!amount || amount <= 0) return err("Invalid amount");

      // Invoke existing create-deposit edge function
      const depositUrl = `${supabaseUrl}/functions/v1/create-deposit`;
      const resp = await fetch(depositUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: req.headers.get("authorization") || "",
          apikey: anonKey,
        },
        body: JSON.stringify({ amount, currency: currency || "usdttrc20" }),
      });

      const result = await resp.json();
      return json(result, resp.status);
    }

    return err(`Unknown action: ${action}`, 404);
  } catch (e) {
    console.error("api-public error:", e);
    return err("Internal server error", 500);
  }
});
