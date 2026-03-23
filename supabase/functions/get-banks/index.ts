const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Mapping from common Flutterwave 3-digit CBN codes to Payaza/NIP 6-digit codes.
 * Used when Payaza bank list is unavailable and we need to convert Flutterwave codes.
 */
const FW_TO_PAYAZA_MAP: Record<string, string> = {
  "044": "000014", // Access Bank
  "063": "000005", // Access (Diamond)
  "023": "000009", // Citibank
  "050": "000010", // Ecobank
  "070": "000007", // Fidelity Bank
  "011": "000016", // First Bank
  "214": "000003", // FCMB
  "058": "000013", // GTBank
  "030": "000020", // Heritage Bank
  "301": "000006", // Jaiz Bank
  "082": "000002", // Keystone Bank
  "076": "000008", // Polaris Bank
  "101": "000023", // Providus Bank
  "221": "000012", // Stanbic IBTC
  "068": "000021", // Standard Chartered
  "232": "000001", // Sterling Bank
  "033": "000004", // UBA
  "032": "000018", // Union Bank
  "215": "000011", // Unity Bank
  "035": "000017", // Wema Bank
  "057": "000015", // Zenith Bank
  "999992": "100004", // OPay
  "50211": "090267", // Kuda
  "999991": "100033", // PalmPay
  "50515": "090405", // Moniepoint
};

/** Reverse map: Payaza code → Flutterwave code */
const PAYAZA_TO_FW_MAP: Record<string, string> = {};
for (const [fw, pz] of Object.entries(FW_TO_PAYAZA_MAP)) {
  PAYAZA_TO_FW_MAP[pz] = fw;
}

/** Hardcoded fallback when both providers are down */
const FALLBACK_BANKS = [
  { code: "000014", name: "Access Bank", fw_code: "044" },
  { code: "000005", name: "Access Bank (Diamond)", fw_code: "063" },
  { code: "000010", name: "Ecobank Nigeria", fw_code: "050" },
  { code: "000007", name: "Fidelity Bank", fw_code: "070" },
  { code: "000016", name: "First Bank of Nigeria", fw_code: "011" },
  { code: "000003", name: "First City Monument Bank", fw_code: "214" },
  { code: "000013", name: "Guaranty Trust Bank", fw_code: "058" },
  { code: "000020", name: "Heritage Bank", fw_code: "030" },
  { code: "000006", name: "Jaiz Bank", fw_code: "301" },
  { code: "000002", name: "Keystone Bank", fw_code: "082" },
  { code: "090267", name: "Kuda Microfinance Bank", fw_code: "50211" },
  { code: "090405", name: "Moniepoint MFB", fw_code: "50515" },
  { code: "100004", name: "OPay", fw_code: "999992" },
  { code: "100033", name: "PalmPay", fw_code: "999991" },
  { code: "000008", name: "Polaris Bank", fw_code: "076" },
  { code: "000023", name: "Providus Bank", fw_code: "101" },
  { code: "000012", name: "Stanbic IBTC Bank", fw_code: "221" },
  { code: "000021", name: "Standard Chartered Bank", fw_code: "068" },
  { code: "000001", name: "Sterling Bank", fw_code: "232" },
  { code: "000004", name: "United Bank for Africa", fw_code: "033" },
  { code: "000018", name: "Union Bank of Nigeria", fw_code: "032" },
  { code: "000011", name: "Unity Bank", fw_code: "215" },
  { code: "000017", name: "Wema Bank", fw_code: "035" },
  { code: "000015", name: "Zenith Bank", fw_code: "057" },
].sort((a, b) => a.name.localeCompare(b.name));

function encodePayazaKey(key: string): string {
  return btoa(key);
}

async function fetchPayazaBanks(secretKey: string): Promise<Array<{ code: string; name: string }> | null> {
  const encodedSecret = encodePayazaKey(secretKey);
  const headers: Record<string, string> = {
    "Authorization": `Payaza ${encodedSecret}`,
    "Accept": "application/json",
    "Content-Type": "application/json",
    "X-TenantID": "live",
  };

  // Try known Payaza bank list endpoints
  const endpoints = [
    "https://api.payaza.africa/live/get-all-banks",
    "https://api.payaza.africa/live/bank-list",
    "https://api.payaza.africa/live/banks",
    "https://api.payaza.africa/live/merchant/get-banks",
    "https://api.payaza.africa/live/payout-receptor/banks",
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        await res.text();
        continue;
      }
      const data = await res.json();

      // Try to extract bank list from various response shapes
      let bankList: any[] | null = null;

      if (Array.isArray(data)) {
        bankList = data;
      } else if (Array.isArray(data?.data)) {
        bankList = data.data;
      } else if (Array.isArray(data?.banks)) {
        bankList = data.banks;
      } else if (data?.response_content && Array.isArray(data.response_content)) {
        bankList = data.response_content;
      }

      if (bankList && bankList.length > 10) {
        const banks = bankList.map((b: any) => ({
          code: b.code || b.bank_code || b.sortCode || b.institution_code || "",
          name: b.name || b.bank_name || b.bankName || "",
        })).filter((b: any) => b.code && b.name);

        if (banks.length > 10) {
          console.log(`Payaza bank list fetched from ${url}: ${banks.length} banks`);
          return banks;
        }
      }
    } catch {
      // try next endpoint
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Try Payaza first (primary payout provider)
    const payazaKey = Deno.env.get("PAYAZA_SECRET_KEY");
    if (payazaKey) {
      const payazaBanks = await fetchPayazaBanks(payazaKey);
      if (payazaBanks) {
        const sorted = payazaBanks.sort((a, b) => a.name.localeCompare(b.name));
        return new Response(
          JSON.stringify({ banks: sorted, source: "payaza" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.warn("Payaza bank list not available, falling back to Flutterwave");
    }

    // Fallback to Flutterwave, but convert codes to Payaza format
    const flutterwaveKey = Deno.env.get("FLUTTERWAVE_SECRET_KEY");
    if (!flutterwaveKey) {
      return new Response(
        JSON.stringify({ banks: FALLBACK_BANKS, source: "fallback" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const res = await fetch("https://api.flutterwave.com/v3/banks/NG", {
      headers: { Authorization: `Bearer ${flutterwaveKey}` },
    });

    const data = await res.json();

    if (data.status !== "success" || !Array.isArray(data.data)) {
      console.error("Flutterwave banks error:", data.message);
      // Fall through to hardcoded fallback below
      return new Response(
        JSON.stringify({ banks: FALLBACK_BANKS, source: "fallback" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert Flutterwave codes to Payaza codes where possible
    const banks = data.data
      .map((b: any) => {
        const fwCode = b.code;
        // If there's a mapping to Payaza code, use it; otherwise keep original
        const payazaCode = FW_TO_PAYAZA_MAP[fwCode] || fwCode;
        return {
          code: payazaCode,
          name: b.name,
          fw_code: fwCode, // Keep original for account verification
        };
      })
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    return new Response(
      JSON.stringify({ banks, source: "flutterwave_mapped" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("get-banks error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
