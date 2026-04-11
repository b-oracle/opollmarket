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

// Sanitize error messages to avoid leaking internals
function safeError(error: { message?: string }, fallback = "Operation failed") {
  const msg = error?.message || fallback;
  // Strip Postgres/Supabase internal details
  if (msg.includes("violates") || msg.includes("duplicate key") || msg.includes("relation") || msg.includes("schema")) {
    return fallback;
  }
  return msg;
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
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user) return null;
    return user.id;
  };

  try {
    // ==================== MARKETS LIST ====================
    if (action === "markets" && req.method === "GET") {
      if (!hasPermission("read")) return err("Permission denied", 403);

      const category = url.searchParams.get("category");
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const status = url.searchParams.get("status") || "active";

      // Validate offset/limit are non-negative integers
      if (isNaN(limit) || limit < 1 || isNaN(offset) || offset < 0) {
        return err("Invalid limit or offset");
      }

      let query = admin
        .from("markets")
        .select("id, title, description, category, yes_price, no_price, volume, participants, end_date, status, image_url, market_type, created_at")
        .eq("status", status)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (category) query = query.eq("category", category);

      const { data, error } = await query;
      if (error) return err("Failed to fetch markets", 500);
      return json({ markets: data, count: data?.length ?? 0 });
    }

    // ==================== SINGLE MARKET ====================
    if (action === "market" && req.method === "GET") {
      if (!hasPermission("read")) return err("Permission denied", 403);

      const id = url.searchParams.get("id");
      if (!id) return err("Missing id parameter");
      // Validate UUID format
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        return err("Invalid market ID format");
      }

      const { data, error } = await admin
        .from("markets")
        .select("id, title, description, details, category, yes_price, no_price, volume, participants, end_date, status, image_url, market_type, resolution_source, created_at, liquidity")
        .eq("id", id)
        .maybeSingle();

      if (error) return err("Failed to fetch market", 500);
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
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        return err("Invalid market ID format");
      }

      const { data, error } = await admin
        .from("markets")
        .select("id, title, category, yes_price, no_price, volume, participants, end_date, status, image_url, market_type")
        .eq("id", id)
        .maybeSingle();

      if (error) return err("Failed to fetch market", 500);
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

    // ==================== USER BALANCE (scoped to authenticated user) ====================
    if (action === "balance" && req.method === "GET") {
      if (!hasPermission("read")) return err("Permission denied", 403);

      // FIX: Scope to authenticated user only — no IDOR
      const userId = await getAuthUser();
      if (!userId) return err("User authentication required", 401);

      const { data, error } = await admin
        .from("balances")
        .select("amount, bonus_balance, currency")
        .eq("user_id", userId)
        .eq("currency", "USDT")
        .maybeSingle();

      if (error) return err("Failed to fetch balance", 500);
      return json({ balance: data || { amount: 0, bonus_balance: 0, currency: "USDT" } });
    }

    // ==================== USER POSITIONS (scoped to authenticated user) ====================
    if (action === "positions" && req.method === "GET") {
      if (!hasPermission("read")) return err("Permission denied", 403);

      // FIX: Scope to authenticated user only — no IDOR
      const userId = await getAuthUser();
      if (!userId) return err("User authentication required", 401);

      const { data, error } = await admin
        .from("positions")
        .select("id, market_id, side, shares, avg_price, option_id, created_at, markets(title, status, yes_price, no_price)")
        .eq("user_id", userId)
        .gt("shares", 0);

      if (error) return err("Failed to fetch positions", 500);
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
      if (typeof amount !== "number" || amount <= 0 || amount > 10000) return err("Amount must be between 0 and 10000");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(marketId)) {
        return err("Invalid marketId format");
      }
      if (side && !["yes", "no"].includes(side)) return err("Side must be 'yes' or 'no'");

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
          const { data: settings } = await admin
            .from("commission_settings")
            .select("prediction_fee_percent")
            .limit(1)
            .single();
          const feePercent = settings?.prediction_fee_percent || 10;
          const feeAmount = amount * (feePercent / 100);
          const commissionAmount = feeAmount * (commPercent / 100);

          if (result.transaction_id) {
            await admin.from("transactions").update({ api_key_id: apiKeyRecord.id }).eq("id", result.transaction_id);

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
      // Validate email format
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err("Invalid email format");
      // Enforce minimum password length
      if (typeof password !== "string" || password.length < 8) return err("Password must be at least 8 characters");

      // Auto-confirm for API-created users so partners get a session token immediately
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (error) {
        console.error("create-user auth error:", error.message);
        return err(safeError(error, "Failed to create user"), 400);
      }

      // Sign in to generate session tokens for the partner
      const { data: signInData, error: signInError } = await admin.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        console.error("create-user sign-in error:", signInError.message);
        // User was created successfully but sign-in failed — return user info without tokens
        return json({ user: { id: data.user.id, email: data.user.email }, warning: "User created but session generation failed" });
      }

      return json({
        user: { id: data.user.id, email: data.user.email },
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
      });
    }

    // ==================== DEPOSIT ====================
    if (action === "deposit" && req.method === "POST") {
      if (!hasPermission("deposit")) return err("Permission denied: deposit not allowed", 403);

      const userId = await getAuthUser();
      if (!userId) return err("User authentication required", 401);

      const body = await req.json();
      const { amount, currency } = body;
      if (!amount || typeof amount !== "number" || amount <= 0) return err("Invalid amount");

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

    // ==================== DEPOSIT (Flutterwave / NGN) ====================
    if (action === "deposit-flutterwave" && req.method === "POST") {
      if (!hasPermission("deposit")) return err("Permission denied: deposit not allowed", 403);

      const userId = await getAuthUser();
      if (!userId) return err("User authentication required", 401);

      const body = await req.json();
      const { amount } = body;
      if (!amount || typeof amount !== "number" || amount <= 0) return err("Invalid amount");

      const depositUrl = `${supabaseUrl}/functions/v1/create-flutterwave-deposit`;
      const resp = await fetch(depositUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: req.headers.get("authorization") || "",
          apikey: anonKey,
        },
        body: JSON.stringify({ amount }),
      });

      const result = await resp.json();
      return json(result, resp.status);
    }

    // ==================== DEPOSIT (Payaza / NGN) ====================
    if (action === "deposit-payaza" && req.method === "POST") {
      if (!hasPermission("deposit")) return err("Permission denied: deposit not allowed", 403);

      const userId = await getAuthUser();
      if (!userId) return err("User authentication required", 401);

      const body = await req.json();
      const { amount } = body;
      if (!amount || typeof amount !== "number" || amount <= 0) return err("Invalid amount");

      const depositUrl = `${supabaseUrl}/functions/v1/create-payaza-deposit`;
      const resp = await fetch(depositUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: req.headers.get("authorization") || "",
          apikey: anonKey,
        },
        body: JSON.stringify({ amount }),
      });

      const result = await resp.json();
      return json(result, resp.status);
    }

    // ==================== DEPOSIT STATUS ====================
    if (action === "deposit-status" && req.method === "POST") {
      if (!hasPermission("read")) return err("Permission denied", 403);

      const userId = await getAuthUser();
      if (!userId) return err("User authentication required", 401);

      const body = await req.json();
      const { payment_id } = body;
      if (!payment_id) return err("payment_id is required");

      const depositUrl = `${supabaseUrl}/functions/v1/get-deposit-status`;
      const resp = await fetch(depositUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: req.headers.get("authorization") || "",
          apikey: anonKey,
        },
        body: JSON.stringify({ payment_id }),
      });

      const result = await resp.json();
      return json(result, resp.status);
    }

    // ==================== CREATE MARKET ====================
    if (action === "create-market" && req.method === "POST") {
      if (!hasPermission("trade")) return err("Permission denied: trade not allowed", 403);

      const userId = await getAuthUser();
      if (!userId) return err("User authentication required", 401);

      const body = await req.json();
      const { title, description, category, endDate, marketType, options, imageUrl, resolutionSource, initialLiquidity } = body;

      if (!title || typeof title !== "string" || title.trim().length < 5) return err("Title is required (min 5 chars)");
      if (!description || typeof description !== "string") return err("Description is required");
      if (!category || typeof category !== "string") return err("Category is required");
      if (!endDate) return err("endDate is required (ISO string)");
      // Validate endDate is in the future
      const parsedEndDate = new Date(endDate);
      if (isNaN(parsedEndDate.getTime()) || parsedEndDate <= new Date()) {
        return err("endDate must be a valid future ISO date");
      }
      if (marketType === "multi" && (!options || !Array.isArray(options) || options.length < 2)) {
        return err("Multi-option markets require at least 2 options");
      }

      const liquidity = Math.max(0, Number(initialLiquidity) || 0);

      // FIX: Apply market creation fee just like the frontend flow
      const { data: feeSettings } = await admin
        .from("commission_settings")
        .select("market_creation_fee")
        .limit(1)
        .single();
      const creationFee = feeSettings?.market_creation_fee || 0;
      const totalCost = liquidity + creationFee;

      // Check balance if totalCost > 0
      if (totalCost > 0) {
        const { data: bal } = await admin
          .from("balances")
          .select("amount")
          .eq("user_id", userId)
          .eq("currency", "USDT")
          .maybeSingle();

        if (!bal || bal.amount < totalCost) {
          return err("Insufficient balance for initial liquidity and creation fee");
        }
      }

      // Run AI moderation
      try {
        const modUrl = `${supabaseUrl}/functions/v1/moderate-market-content`;
        const modResp = await fetch(modUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: anonKey },
          body: JSON.stringify({ title, description, options: options?.map((o: any) => o.label || o) }),
        });
        if (modResp.ok) {
          const modResult = await modResp.json();
          if (modResult.flagged) {
            return err(`Content flagged: ${modResult.reason}`, 422);
          }
        }
      } catch (modErr) {
        console.warn("Moderation check failed (non-critical):", modErr);
      }

      // FIX: Insert market as 'pending' — require admin approval like frontend
      const { data: market, error: marketErr } = await admin
        .from("markets")
        .insert({
          title: title.trim(),
          description: description.trim(),
          category,
          end_date: endDate,
          market_type: marketType || "binary",
          image_url: imageUrl || null,
          resolution_source: resolutionSource || "manual",
          creator_wallet: userId,
          creator_name: "API User",
          api_key_id: apiKeyRecord.id,
          initial_liquidity: liquidity,
          liquidity,
          status: "pending",
          yes_price: 50,
          no_price: 50,
        })
        .select("id, title, status, category, market_type, end_date, created_at")
        .single();

      if (marketErr) return err("Failed to create market", 500);

      // Insert options for multi markets
      if (marketType === "multi" && options?.length) {
        const optionRows = options.map((o: any, i: number) => ({
          market_id: market.id,
          label: typeof o === "string" ? o : o.label,
          sort_order: i,
          price: Math.round(100 / options.length),
        }));
        await admin.from("market_options").insert(optionRows);
      }

      // FIX: Use correct RPC parameter names (_user_id, _delta)
      if (totalCost > 0) {
        await admin.rpc("adjust_balance", { _user_id: userId, _delta: -totalCost });
        await admin.from("transactions").insert({
          user_id: userId,
          type: "buy",
          amount: liquidity,
          market_id: market.id,
          status: "confirmed",
          side: "initial_liquidity",
        });
        // Log creation fee separately if applicable
        if (creationFee > 0) {
          await admin.from("transactions").insert({
            user_id: userId,
            type: "fee",
            amount: creationFee,
            market_id: market.id,
            status: "confirmed",
            side: "market_creation_fee",
          });
        }
      }

      // Fetch creator display name
      const { data: profile } = await admin.from("profiles").select("display_name").eq("id", userId).maybeSingle();
      if (profile?.display_name) {
        await admin.from("markets").update({ creator_name: profile.display_name }).eq("id", market.id);
      }

      return json({ market, note: "Market created as pending — requires admin approval" }, 201);
    }

    // ==================== BOOST MARKET ====================
    if (action === "boost-market" && req.method === "POST") {
      if (!hasPermission("trade")) return err("Permission denied", 403);

      const userId = await getAuthUser();
      if (!userId) return err("User authentication required", 401);

      const body = await req.json();
      const { marketId, tier, paymentMethod } = body;

      if (!marketId) return err("Missing marketId");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(marketId)) {
        return err("Invalid marketId format");
      }
      if (!tier || !["flash", "standard", "whale"].includes(tier)) {
        return err("Invalid tier. Must be flash, standard, or whale");
      }

      // Invoke existing create-boost-payment edge function
      const boostUrl = `${supabaseUrl}/functions/v1/create-boost-payment`;
      const resp = await fetch(boostUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: req.headers.get("authorization") || "",
          apikey: anonKey,
        },
        body: JSON.stringify({ market_id: marketId, tier }),
      });

      const result = await resp.json();

      // Track via API key
      if (resp.ok && apiKeyRecord) {
        await admin.from("api_request_logs").insert({
          api_key_id: apiKeyRecord.id,
          endpoint: "boost-market",
          ip: req.headers.get("x-forwarded-for") || "unknown",
        }).then(() => {});
      }

      return json(result, resp.status);
    }

    // ==================== SELL POSITION ====================
    if (action === "sell-position" && req.method === "POST") {
      if (!hasPermission("trade")) return err("Permission denied: trade not allowed", 403);

      const userId = await getAuthUser();
      if (!userId) return err("User authentication required", 401);

      const body = await req.json();
      const { positionId } = body;

      if (!positionId) return err("Missing positionId");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(positionId)) {
        return err("Invalid positionId format");
      }

      // Invoke existing sell-position edge function
      const sellUrl = `${supabaseUrl}/functions/v1/sell-position`;
      const resp = await fetch(sellUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: req.headers.get("authorization") || "",
          apikey: anonKey,
        },
        body: JSON.stringify({ positionId }),
      });

      const result = await resp.json();
      return json(result, resp.status);
    }

    // ==================== MARKET TRADES ====================
    if (action === "market-trades" && req.method === "GET") {
      if (!hasPermission("read")) return err("Permission denied", 403);

      const marketId = url.searchParams.get("marketId");
      if (!marketId) return err("Missing marketId parameter");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(marketId)) {
        return err("Invalid marketId format");
      }

      const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
      const offset = parseInt(url.searchParams.get("offset") || "0");
      if (isNaN(limit) || limit < 1 || isNaN(offset) || offset < 0) {
        return err("Invalid limit or offset");
      }

      const { data, error } = await admin
        .from("transactions")
        .select("id, type, side, amount, price, shares, status, created_at")
        .eq("market_id", marketId)
        .in("type", ["buy", "sell"])
        .eq("status", "confirmed")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) return err("Failed to fetch trades", 500);
      return json({ trades: data, count: data?.length ?? 0 });
    }

    // ==================== USER TRADE HISTORY ====================
    if (action === "trade-history" && req.method === "GET") {
      if (!hasPermission("read")) return err("Permission denied", 403);

      const userId = await getAuthUser();
      if (!userId) return err("User authentication required", 401);

      const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const type = url.searchParams.get("type"); // buy, sell, deposit, etc.

      if (isNaN(limit) || limit < 1 || isNaN(offset) || offset < 0) {
        return err("Invalid limit or offset");
      }

      let query = admin
        .from("transactions")
        .select("id, type, side, amount, price, shares, status, market_id, created_at, description")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (type) query = query.eq("type", type);

      const { data, error } = await query;
      if (error) return err("Failed to fetch trade history", 500);
      return json({ trades: data, count: data?.length ?? 0 });
    }

    // ==================== CATEGORIES ====================
    if (action === "categories" && req.method === "GET") {
      if (!hasPermission("read")) return err("Permission denied", 403);

      const { data, error } = await admin
        .from("markets")
        .select("category")
        .eq("status", "active");

      if (error) return err("Failed to fetch categories", 500);

      const categories = [...new Set((data || []).map((m: any) => m.category).filter(Boolean))].sort();
      return json({ categories });
    }

    // ==================== TRENDING MARKETS ====================
    if (action === "trending" && req.method === "GET") {
      if (!hasPermission("read")) return err("Permission denied", 403);

      const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);

      const { data, error } = await admin.rpc("get_trending_scores");

      if (error) return err("Failed to fetch trending markets", 500);

      const topIds = (data || []).slice(0, limit).map((r: any) => r.market_id);

      if (topIds.length === 0) return json({ markets: [] });

      const { data: markets } = await admin
        .from("markets")
        .select("id, title, description, category, yes_price, no_price, volume, participants, end_date, status, image_url, market_type, created_at")
        .in("id", topIds);

      // Merge scores and sort
      const scoreMap = new Map((data || []).map((r: any) => [r.market_id, r.total_score]));
      const sorted = (markets || [])
        .map((m: any) => ({ ...m, trending_score: scoreMap.get(m.id) || 0 }))
        .sort((a: any, b: any) => b.trending_score - a.trending_score);

      return json({ markets: sorted });
    }

    // ==================== WEBHOOKS MANAGEMENT ====================
    if (action === "webhooks" && (req.method === "GET" || req.method === "POST" || req.method === "PUT")) {
      if (!apiKeyRecord) return err("API key required", 401);

      // GET — return current webhook config
      if (req.method === "GET") {
        return json({
          webhook_url: apiKeyRecord.webhook_url || null,
          webhook_secret: apiKeyRecord.webhook_secret ? "***configured***" : null,
        });
      }

      // POST/PUT — update webhook config
      const body = await req.json();
      const { webhookUrl, webhookSecret } = body;

      if (webhookUrl !== undefined) {
        if (webhookUrl !== null && typeof webhookUrl === "string") {
          if (!/^https?:\/\/.+/.test(webhookUrl)) return err("webhookUrl must be a valid HTTP(S) URL");
        }
      }

      const updates: Record<string, any> = {};
      if (webhookUrl !== undefined) updates.webhook_url = webhookUrl || null;
      if (webhookSecret !== undefined) updates.webhook_secret = webhookSecret || null;
      updates.updated_at = new Date().toISOString();

      const { error } = await admin
        .from("api_keys")
        .update(updates)
        .eq("id", apiKeyRecord.id);

      if (error) return err("Failed to update webhook config", 500);
      return json({ success: true, message: "Webhook configuration updated" });
    }

    // ==================== MARKET SEARCH ====================
    if (action === "search" && req.method === "GET") {
      if (!hasPermission("read")) return err("Permission denied", 403);

      const q = url.searchParams.get("q");
      if (!q || q.trim().length < 2) return err("Search query (q) must be at least 2 characters");

      const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);
      const status = url.searchParams.get("status") || "active";
      const sanitized = q.trim().replace(/[%_]/g, "");

      const { data, error } = await admin
        .from("markets")
        .select("id, title, description, category, yes_price, no_price, volume, participants, end_date, status, image_url, market_type, created_at")
        .eq("status", status)
        .or(`title.ilike.%${sanitized}%,description.ilike.%${sanitized}%`)
        .order("volume", { ascending: false })
        .limit(limit);

      if (error) return err("Search failed", 500);
      return json({ markets: data, count: data?.length ?? 0 });
    }

    // ==================== COMMENTS ====================
    if (action === "comments" && req.method === "GET") {
      if (!hasPermission("read")) return err("Permission denied", 403);

      const marketId = url.searchParams.get("market_id");
      if (!marketId || !/^[0-9a-f-]{36}$/i.test(marketId)) return err("Valid market_id is required");

      const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
      const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"), 0);

      const { data, error } = await admin
        .from("comments")
        .select("id, market_id, author_name, content, likes_count, parent_id, created_at")
        .eq("market_id", marketId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) return err("Failed to fetch comments", 500);
      return json({ comments: data, count: data?.length ?? 0 });
    }

    if (action === "comments" && req.method === "POST") {
      if (!hasPermission("trade")) return err("Permission denied", 403);
      const userId = await getAuthUser();
      if (!userId) return err("Authentication required for posting comments", 401);

      const body = await req.json();
      const marketId = body.market_id;
      const content = body.content?.trim();
      const parentId = body.parent_id || null;

      if (!marketId || !/^[0-9a-f-]{36}$/i.test(marketId)) return err("Valid market_id is required");
      if (!content || content.length < 1 || content.length > 500) return err("Content must be 1-500 characters");
      if (parentId && !/^[0-9a-f-]{36}$/i.test(parentId)) return err("Invalid parent_id");

      // Get user display name
      const { data: profile } = await admin
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .single();

      const authorName = profile?.display_name || "Anonymous";

      const { data: comment, error } = await admin
        .from("comments")
        .insert({
          market_id: marketId,
          author_wallet: userId,
          author_name: authorName,
          content,
          parent_id: parentId,
        })
        .select("id, market_id, author_name, content, parent_id, created_at")
        .single();

      if (error) return err("Failed to post comment", 500);
      return json({ comment }, 201);
    }

    // ==================== PRICE HISTORY ====================
    if (action === "price-history" && req.method === "GET") {
      if (!hasPermission("read")) return err("Permission denied", 403);

      const marketId = url.searchParams.get("market_id");
      if (!marketId || !/^[0-9a-f-]{36}$/i.test(marketId)) return err("Valid market_id is required");

      const limit = Math.min(parseInt(url.searchParams.get("limit") || "200"), 1000);
      const since = url.searchParams.get("since"); // ISO timestamp

      let query = admin
        .from("transactions")
        .select("created_at, side, price, option_id")
        .eq("market_id", marketId)
        .in("type", ["buy", "sell"])
        .eq("status", "confirmed")
        .order("created_at", { ascending: true })
        .limit(limit);

      if (since) {
        query = query.gte("created_at", since);
      }

      const { data, error } = await query;
      if (error) return err("Failed to fetch price history", 500);

      // Also fetch current market prices
      const { data: market } = await admin
        .from("markets")
        .select("yes_price, no_price, market_type")
        .eq("id", marketId)
        .single();

      // Fetch options if multi-option
      let options = null;
      if (market?.market_type !== "binary") {
        const { data: opts } = await admin
          .from("market_options")
          .select("id, label, price, sort_order")
          .eq("market_id", marketId)
          .order("sort_order");
        options = opts;
      }

      return json({
        trades: data?.map((t: any) => ({
          timestamp: t.created_at,
          side: t.side,
          price: t.price,
          option_id: t.option_id,
        })),
        current: {
          yes_price: market?.yes_price,
          no_price: market?.no_price,
          market_type: market?.market_type,
        },
        options,
        count: data?.length ?? 0,
      });
    }

    return err(`Unknown action: ${action}`, 404);
  } catch (e) {
    console.error("api-public error:", e);
    return err("Internal server error", 500);
  }
});
