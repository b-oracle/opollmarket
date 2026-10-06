// Temporary connectivity check for BoundlessPay credentials. Returns only key shape + API status, never the key.
Deno.serve(async () => {
  const k = (Deno.env.get("BOUNDLESSPAY_API_KEY") ?? "").trim();
  const r = await fetch("https://business.boundlesspay.com/api/public/v1/balances", {
    headers: { Authorization: `Bearer ${k}` },
  });
  const body = await r.json().catch(() => ({}));
  return new Response(JSON.stringify({
    prefix: k.slice(0, 8), has_colon: k.includes(":"), len: k.length,
    status: r.status, code: body?.code ?? null,
  }), { headers: { "Content-Type": "application/json" } });
});
