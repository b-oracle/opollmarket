import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NP_API = "https://api.nowpayments.io/v1";

async function getNpJwt(apiKey: string, email: string, password: string): Promise<string> {
  console.log("NP auth: requesting JWT...");
  const res = await fetch(`${NP_API}/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NP auth failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  if (!data.token) {
    console.error("NP auth response missing token:", JSON.stringify(data));
    throw new Error("NP auth returned no token");
  }
  console.log("NP auth: JWT obtained, length:", data.token.length);
  return data.token;
}

interface NpPayment {
  payment_id: number;
  payment_status: string;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  pay_currency: string;
  actually_paid: number;
  actually_paid_at_fiat: number | null;
  outcome_amount: number;
  outcome_currency: string;
  order_id: string;
  order_description: string | null;
  created_at: string;
  updated_at: string;
}

async function fetchAllNpPayments(apiKey: string, jwt: string): Promise<NpPayment[]> {
  const all: NpPayment[] = [];
  let page = 0;
  const limit = 100;

  while (true) {
    const url = `${NP_API}/payment/?limit=${limit}&page=${page}&sortBy=created_at&orderBy=asc`;
    const res = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
        "Authorization": `Bearer ${jwt}`,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`NP list payments failed page ${page}: ${res.status} ${text}`);
      break;
    }

    const data = await res.json();
    const payments: NpPayment[] = data.data || [];
    all.push(...payments);

    if (payments.length < limit) break;
    page++;

    // Rate limit protection
    await new Promise((r) => setTimeout(r, 300));
  }

  return all;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    const { data: isSuperAdmin } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
    if (!isAdmin && !isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get NP credentials
    const npApiKey = Deno.env.get("NOWPAYMENTS_API_KEY");
    const npEmail = Deno.env.get("NOWPAYMENTS_EMAIL");
    const npPassword = Deno.env.get("NOWPAYMENTS_PASSWORD");
    if (!npApiKey || !npEmail || !npPassword) {
      return new Response(JSON.stringify({ error: "NP credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body; // "audit" or "apply"

    // Step 1: Authenticate with NP
    const npJwt = await getNpJwt(npApiKey, npEmail, npPassword);

    // Step 2: Fetch ALL payments from NP
    const npPayments = await fetchAllNpPayments(npApiKey, npJwt);

    // Step 3: Fetch all deposit transactions from DB
    const { data: dbDeposits } = await adminClient
      .from("transactions")
      .select("id, user_id, amount, status, nowpayments_payment_id, created_at")
      .eq("type", "deposit")
      .order("created_at");

    if (!dbDeposits) {
      return new Response(JSON.stringify({ error: "Failed to fetch DB deposits" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build lookup maps
    const npByPaymentId = new Map<string, NpPayment>();
    for (const np of npPayments) {
      npByPaymentId.set(String(np.payment_id), np);
    }

    const dbByPaymentId = new Map<string, typeof dbDeposits[0]>();
    for (const db of dbDeposits) {
      if (db.nowpayments_payment_id) {
        dbByPaymentId.set(db.nowpayments_payment_id, db);
      }
    }

    // Filter NP payments to deposits only (order_id starts with "deposit_")
    const npDeposits = npPayments.filter((p) => p.order_id?.startsWith("deposit_"));
    const npBoosts = npPayments.filter((p) => p.order_id?.startsWith("boost_"));
    const npOther = npPayments.filter((p) => !p.order_id?.startsWith("deposit_") && !p.order_id?.startsWith("boost_"));

    // Cross-reference: DB deposits that have NP records
    const matched: Array<{
      tx_id: string;
      user_id: string;
      np_payment_id: string;
      db_amount: number;
      db_status: string;
      np_price_amount: number;
      np_outcome_amount: number;
      np_actually_paid: number;
      np_pay_currency: string;
      np_status: string;
      np_created_at: string;
      excess: number;
    }> = [];

    const dbConfirmedNoNpRecord: Array<{
      tx_id: string;
      user_id: string;
      amount: number;
      status: string;
      np_payment_id: string | null;
      created_at: string;
    }> = [];

    const npFinishedNoDbRecord: Array<{
      np_payment_id: string;
      order_id: string;
      price_amount: number;
      outcome_amount: number;
      pay_currency: string;
      status: string;
      created_at: string;
    }> = [];

    // Check each DB deposit
    for (const db of dbDeposits) {
      if (db.status === "pending" || db.status === "expired") continue;

      if (db.nowpayments_payment_id) {
        const np = npByPaymentId.get(db.nowpayments_payment_id);
        if (np) {
          const excess = Math.round((Number(db.amount) - np.outcome_amount) * 100) / 100;
          matched.push({
            tx_id: db.id,
            user_id: db.user_id,
            np_payment_id: db.nowpayments_payment_id,
            db_amount: Number(db.amount),
            db_status: db.status,
            np_price_amount: np.price_amount,
            np_outcome_amount: np.outcome_amount,
            np_actually_paid: np.actually_paid,
            np_pay_currency: np.pay_currency,
            np_status: np.payment_status,
            np_created_at: np.created_at,
            excess,
          });
        } else {
          // DB has payment ID but NP doesn't know about it
          dbConfirmedNoNpRecord.push({
            tx_id: db.id,
            user_id: db.user_id,
            amount: Number(db.amount),
            status: db.status,
            np_payment_id: db.nowpayments_payment_id,
            created_at: db.created_at,
          });
        }
      } else {
        // DB deposit confirmed but no NP payment ID (manual confirm?)
        dbConfirmedNoNpRecord.push({
          tx_id: db.id,
          user_id: db.user_id,
          amount: Number(db.amount),
          status: db.status,
          np_payment_id: null,
          created_at: db.created_at,
        });
      }
    }

    // Check NP deposits that have no matching DB record
    for (const np of npDeposits) {
      if (np.payment_status !== "finished" && np.payment_status !== "confirmed") continue;
      const pid = String(np.payment_id);
      if (!dbByPaymentId.has(pid)) {
        npFinishedNoDbRecord.push({
          np_payment_id: pid,
          order_id: np.order_id,
          price_amount: np.price_amount,
          outcome_amount: np.outcome_amount,
          pay_currency: np.pay_currency,
          status: np.payment_status,
          created_at: np.created_at,
        });
      }
    }

    // Compute totals
    const totalDbCredited = matched.reduce((s, m) => s + m.db_amount, 0);
    const totalNpOutcome = matched.reduce((s, m) => s + m.np_outcome_amount, 0);
    const totalExcess = matched.reduce((s, m) => s + Math.max(m.excess, 0), 0);
    const totalNpGross = matched.reduce((s, m) => s + m.np_price_amount, 0);
    const affectedDeposits = matched.filter((m) => m.excess > 0.005);

    // Aggregate NP totals (all payments, not just deposits)
    const npTotalIncoming = npPayments
      .filter((p) => p.payment_status === "finished" || p.payment_status === "confirmed")
      .reduce((s, p) => s + (p.outcome_amount || 0), 0);

    const summary = {
      np_total_payments: npPayments.length,
      np_deposit_payments: npDeposits.length,
      np_boost_payments: npBoosts.length,
      np_other_payments: npOther.length,
      np_total_incoming_usd: Math.round(npTotalIncoming * 100) / 100,
      db_total_credited: Math.round(totalDbCredited * 100) / 100,
      np_total_outcome: Math.round(totalNpOutcome * 100) / 100,
      np_total_gross: Math.round(totalNpGross * 100) / 100,
      total_excess: Math.round(totalExcess * 100) / 100,
      np_fees_retained: Math.round((totalNpGross - totalNpOutcome) * 100) / 100,
      matched_count: matched.length,
      affected_count: affectedDeposits.length,
      db_no_np_record: dbConfirmedNoNpRecord.length,
      np_no_db_record: npFinishedNoDbRecord.length,
    };

    // If action is "apply", deduct excess from affected user balances
    if (action === "apply") {
      const userExcessMap = new Map<string, number>();
      for (const m of matched) {
        if (m.excess > 0.005) {
          userExcessMap.set(m.user_id, (userExcessMap.get(m.user_id) || 0) + m.excess);
        }
      }

      const adjustments: Array<{ user_id: string; deducted: number; new_balance: number; prev_balance: number }> = [];

      for (const [userId, totalDeduct] of userExcessMap) {
        const { data: balance } = await adminClient
          .from("balances")
          .select("amount")
          .eq("user_id", userId)
          .eq("currency", "USDT")
          .single();

        if (!balance) continue;

        const prevBalance = Number(balance.amount);
        const newBalance = Math.round((prevBalance - totalDeduct) * 100) / 100;

        await adminClient
          .from("balances")
          .update({ amount: newBalance, updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("currency", "USDT");

        // Update transaction amounts to NP outcome_amount
        for (const m of matched) {
          if (m.user_id === userId && m.excess > 0.005) {
            await adminClient
              .from("transactions")
              .update({ amount: m.np_outcome_amount })
              .eq("id", m.tx_id);
          }
        }

        await adminClient.from("notifications").insert({
          user_id: userId,
          title: "Balance Adjustment 📊",
          message: `A fee correction of -$${totalDeduct.toFixed(2)} has been applied for payment processing fees.`,
          type: "info",
        });

        await adminClient.from("audit_logs").insert({
          actor_id: user.id,
          action: "np_fee_correction",
          target_type: "balance",
          target_id: userId,
          details: { deducted: totalDeduct, new_balance: newBalance, previous_balance: prevBalance },
        });

        adjustments.push({ user_id: userId, deducted: totalDeduct, new_balance: newBalance, prev_balance: prevBalance });
      }

      return new Response(JSON.stringify({
        action: "applied",
        adjustments,
        total_deducted: Math.round(adjustments.reduce((s, a) => s + a.deducted, 0) * 100) / 100,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: audit mode
    return new Response(JSON.stringify({
      action: "audit",
      summary,
      matched,
      anomalies: {
        db_confirmed_no_np: dbConfirmedNoNpRecord,
        np_finished_no_db: npFinishedNoDbRecord,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("np-reconcile error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
