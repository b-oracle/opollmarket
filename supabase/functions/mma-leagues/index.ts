const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const apiKey = Deno.env.get("API_FOOTBALL_KEY")!;
  const { endpoint } = await req.json();
  const resp = await fetch(`https://v1.mma.api-sports.io${endpoint}`, {
    headers: { "x-apisports-key": apiKey },
  });
  const data = await resp.json();
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
