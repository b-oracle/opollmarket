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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: corsHeaders,
      });
    }

    const userId = claimsData.claims.sub;
    const { amount } = await req.json();

    if (!amount || amount < 1 || amount > 50000) {
      return new Response(
        JSON.stringify({ error: "Amount must be between 1 and 50,000" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get payaza_mode from commission_settings
    const { data: settings } = await adminClient
      .from("commission_settings")
      .select("payaza_mode")
      .limit(1)
      .maybeSingle();

    const mode = (settings as any)?.payaza_mode || "direct_api";

    const merchantKey = Deno.env.get("PAYAZA_MERCHANT_KEY");
    const secretKey = Deno.env.get("PAYAZA_SECRET_KEY");

    if (!merchantKey && !secretKey) {
      return new Response(
        JSON.stringify({ error: "Fiat payment service not configured" }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Get user email
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    const email = user?.email || "customer@opoll.com";

    const transactionReference = `payaza_${userId}_${Date.now()}`;

    // Insert pending deposit transaction
    await adminClient.from("transactions").insert({
      user_id: userId,
      type: "deposit",
      amount: amount,
      status: "pending",
      payment_provider: "payaza",
      nowpayments_payment_id: transactionReference,
    });

    // ─── CHECKOUT SDK MODE ───
    if (mode === "checkout_sdk") {
      if (!merchantKey) {
        return new Response(
          JSON.stringify({ error: "Checkout SDK not configured (missing merchant key)" }),
          { status: 500, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({
          mode: "checkout_sdk",
          transaction_reference: transactionReference,
          merchant_key: merchantKey,
          email,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── DIRECT API MODE ───
    if (!secretKey) {
      return new Response(
        JSON.stringify({ error: "Direct API not configured (missing secret key)" }),
        { status: 500, headers: corsHeaders }
      );
    }

    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/payaza-webhook`;

    const collectionPayload = {
      service_type: "Account",
      service_payload: {
        request_application: "Payaza",
        application_module: "USER_MODULE",
        application_version: "1.0.0",
        request_class: "PayazaCheckout",
        request_type: "PayazaCheckout",
        payaza_account_number: merchantKey || "",
        transaction_reference: transactionReference,
        amount: amount,
        currency: "NGN",
        callback_url: webhookUrl,
        customer: {
          email: email,
          first_name: email.split("@")[0],
          last_name: "User",
        },
      },
    };

    console.log("Calling Payaza Collection API:", JSON.stringify(collectionPayload));

    const proxyUrl = Deno.env.get("QUOTAGUARD_URL");
    const payazaApiUrl = "https://router.payaza.africa/api/v1/collection/";

    let payazaResponse: Response;

    if (proxyUrl) {
      // Route through QuotaGuard static IP proxy
      console.log("Using QuotaGuard proxy for Payaza request");
      const proxy = new URL(proxyUrl);
      const proxyHost = proxy.hostname;
      const proxyPort = parseInt(proxy.port) || 9293;
      const proxyAuth = btoa(`${proxy.username}:${proxy.password}`);

      // Use HTTP CONNECT tunnel via Deno.connect
      const conn = await Deno.connect({ hostname: proxyHost, port: proxyPort });
      const connectReq = `CONNECT router.payaza.africa:443 HTTP/1.1\r\nHost: router.payaza.africa:443\r\nProxy-Authorization: Basic ${proxyAuth}\r\n\r\n`;
      await conn.write(new TextEncoder().encode(connectReq));

      // Read CONNECT response
      const buf = new Uint8Array(4096);
      const n = await conn.read(buf);
      const connectResponse = new TextDecoder().decode(buf.subarray(0, n!));
      console.log("Proxy CONNECT response:", connectResponse.split("\r\n")[0]);

      if (!connectResponse.includes("200")) {
        conn.close();
        console.error("Proxy CONNECT failed:", connectResponse);
        return new Response(
          JSON.stringify({ error: "Payment proxy connection failed. Please try again." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Upgrade to TLS
      const tlsConn = await Deno.startTls(conn, { hostname: "router.payaza.africa" });

      const bodyStr = JSON.stringify(collectionPayload);
      const httpReq = `POST /api/v1/collection/ HTTP/1.1\r\nHost: router.payaza.africa\r\nContent-Type: application/json\r\nAuthorization: Payaza ${secretKey}\r\nContent-Length: ${new TextEncoder().encode(bodyStr).length}\r\nConnection: close\r\n\r\n${bodyStr}`;

      await tlsConn.write(new TextEncoder().encode(httpReq));

      // Read full response
      const chunks: Uint8Array[] = [];
      while (true) {
        const chunk = new Uint8Array(8192);
        const bytesRead = await tlsConn.read(chunk);
        if (bytesRead === null) break;
        chunks.push(chunk.subarray(0, bytesRead));
      }
      tlsConn.close();

      const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
      const fullBuf = new Uint8Array(totalLen);
      let offset = 0;
      for (const c of chunks) { fullBuf.set(c, offset); offset += c.length; }
      const rawResponse = new TextDecoder().decode(fullBuf);

      // Split headers and body
      const headerEnd = rawResponse.indexOf("\r\n\r\n");
      const statusLine = rawResponse.split("\r\n")[0];
      const statusCode = parseInt(statusLine.split(" ")[1]) || 500;
      let responseBody = rawResponse.substring(headerEnd + 4);

      // Handle chunked transfer encoding
      if (rawResponse.toLowerCase().includes("transfer-encoding: chunked")) {
        const decoded: string[] = [];
        let remaining = responseBody;
        while (remaining.length > 0) {
          const lineEnd = remaining.indexOf("\r\n");
          if (lineEnd === -1) break;
          const chunkSize = parseInt(remaining.substring(0, lineEnd), 16);
          if (chunkSize === 0) break;
          decoded.push(remaining.substring(lineEnd + 2, lineEnd + 2 + chunkSize));
          remaining = remaining.substring(lineEnd + 2 + chunkSize + 2);
        }
        responseBody = decoded.join("");
      }

      payazaResponse = new Response(responseBody, {
        status: statusCode,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      // Direct request (no proxy)
      console.log("No proxy configured, making direct Payaza request");
      payazaResponse = await fetch(payazaApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Payaza ${secretKey}`,
        },
        body: JSON.stringify(collectionPayload),
      });
    }

    const payazaText = await payazaResponse.text();
    console.log("Payaza Collection API response status:", payazaResponse.status, "body preview:", payazaText.substring(0, 500));

    let payazaData: any;
    try {
      payazaData = JSON.parse(payazaText);
    } catch {
      console.error("Payaza returned non-JSON response:", payazaText.substring(0, 300));
      return new Response(
        JSON.stringify({ error: "Payment service temporarily unavailable. Please try again later." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!payazaResponse.ok) {
      console.error("Payaza API error:", payazaData);
      return new Response(
        JSON.stringify({ error: "Failed to initiate payment. Please try again." }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Extract virtual account details from the response
    const responseData = payazaData?.data || payazaData?.response_content || payazaData;
    const bankName = responseData?.bank_name || responseData?.virtual_account_bank || "Transfer Bank";
    const accountNumber = responseData?.account_number || responseData?.virtual_account_number || "";
    const accountName = responseData?.account_name || responseData?.virtual_account_name || "Opoll";
    const paymentUrl = responseData?.payment_url || responseData?.checkout_url || null;
    const expiresAt = responseData?.expires_at || responseData?.expiry_datetime || null;

    return new Response(
      JSON.stringify({
        mode: "direct_api",
        transaction_reference: transactionReference,
        bank_name: bankName,
        account_number: accountNumber,
        account_name: accountName,
        amount: amount,
        currency: "NGN",
        payment_url: paymentUrl,
        expires_at: expiresAt,
        email,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-payaza-deposit error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
