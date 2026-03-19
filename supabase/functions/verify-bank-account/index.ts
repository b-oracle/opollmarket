const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Mapping from Payaza/NIP 6-digit codes back to Flutterwave 3-digit CBN codes.
 * Flutterwave's account resolve API uses CBN codes.
 */
const PAYAZA_TO_FW_MAP: Record<string, string> = {
  "000014": "044", // Access Bank
  "000005": "063", // Access (Diamond)
  "000009": "023", // Citibank
  "000010": "050", // Ecobank
  "000007": "070", // Fidelity Bank
  "000016": "011", // First Bank
  "000003": "214", // FCMB
  "000013": "058", // GTBank
  "000020": "030", // Heritage Bank
  "000006": "301", // Jaiz Bank
  "000002": "082", // Keystone Bank
  "000008": "076", // Polaris Bank
  "000023": "101", // Providus Bank
  "000012": "221", // Stanbic IBTC
  "000021": "068", // Standard Chartered
  "000001": "232", // Sterling Bank
  "000004": "033", // UBA
  "000018": "032", // Union Bank
  "000011": "215", // Unity Bank
  "000017": "035", // Wema Bank
  "000015": "057", // Zenith Bank
  "100004": "999992", // OPay
  "090267": "50211", // Kuda
  "100033": "999991", // PalmPay
  "090405": "50515", // Moniepoint
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bank_code, account_number } = await req.json();

    const rawBankCode = String(bank_code ?? "").trim();
    const normalizedAccountNumber = String(account_number ?? "").replace(/\D/g, "");

    if (!rawBankCode || normalizedAccountNumber.length !== 10) {
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

    // Map Payaza/NIP code to Flutterwave code if needed
    const flutterwaveCode = PAYAZA_TO_FW_MAP[rawBankCode] || rawBankCode;

    // Try with the mapped code first
    let data = await resolveAccount(flutterwaveKey, normalizedAccountNumber, flutterwaveCode);

    // If failed and we mapped the code, also try the original code
    if (!data?.data?.account_name && flutterwaveCode !== rawBankCode) {
      console.log(`Mapped code ${flutterwaveCode} failed, trying original code ${rawBankCode}`);
      data = await resolveAccount(flutterwaveKey, normalizedAccountNumber, rawBankCode);
    }

    if (data?.status === "success" && data?.data?.account_name) {
      return new Response(
        JSON.stringify({ account_name: data.data.account_name }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Flutterwave returned an error or no name
    console.warn("Flutterwave resolve failed:", data?.message || "Unknown error");
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

async function resolveAccount(flutterwaveKey: string, accountNumber: string, bankCode: string) {
  const res = await fetch("https://api.flutterwave.com/v3/accounts/resolve", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${flutterwaveKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      account_number: accountNumber,
      account_bank: bankCode,
    }),
  });

  const data = await res.json();
  console.log(`Flutterwave resolve (code=${bankCode}) → ${res.status}:`, JSON.stringify(data).substring(0, 500));
  return data;
}
