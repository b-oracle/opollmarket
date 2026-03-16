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
    const { bank_code, account_number } = await req.json();

    const normalizedBankCode = String(bank_code ?? "").replace(/\D/g, "").trim();
    const normalizedAccountNumber = String(account_number ?? "").replace(/\D/g, "");

    if (!normalizedBankCode || normalizedAccountNumber.length !== 10) {
      return new Response(
        JSON.stringify({ error: "Valid bank code and 10-digit account number required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const flutterwaveKey = Deno.env.get("FLUTTERWAVE_SECRET_KEY");

    if (!flutterwaveKey) {
      console.error("FLUTTERWAVE_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({ account_name: "", manual_confirm: true, message: "Account verification service not configured." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call Flutterwave v3 resolve account endpoint
    const res = await fetch("https://api.flutterwave.com/v3/accounts/resolve", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${flutterwaveKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        account_number: normalizedAccountNumber,
        account_bank: normalizedBankCode,
      }),
    });

    const data = await res.json();
    console.log(`Flutterwave resolve → ${res.status}:`, JSON.stringify(data).substring(0, 500));

    if (data.status === "success" && data.data?.account_name) {
      return new Response(
        JSON.stringify({ account_name: data.data.account_name }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Flutterwave returned an error or no name
    console.warn("Flutterwave resolve failed:", data.message || "Unknown error");
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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
