import { supabase } from "@/integrations/supabase/client";

/** Fetch a fresh quote immediately before submitting; never assume a 50% price. */
export async function placeFirstPrediction(input: {
  marketId: string;
  optionId?: string;
  side: string;
  amount: number;
}) {
  const { marketId, optionId, side, amount } = input;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid prediction amount");

  let probability: number;
  if (optionId) {
    const { data, error } = await supabase.from("market_options")
      .select("price").eq("id", optionId).eq("market_id", marketId).single();
    if (error || !data) throw new Error("Could not load the selected option's price. Please try again.");
    probability = Number(data.price);
  } else {
    const { data, error } = await supabase.from("markets")
      .select("yes_price, no_price").eq("id", marketId).single();
    if (error || !data) throw new Error("Could not load the market price. Please try again.");
    probability = Number(side === "yes" ? data.yes_price : data.no_price);
  }
  const price = Math.round(probability * 100);
  if (!Number.isFinite(price) || price <= 0 || price > 100) {
    throw new Error("This option's price is unavailable. Please try again.");
  }

  const { data, error } = await supabase.functions.invoke("place-bet", {
    body: { ...input, price, shares: amount / (price / 100) },
  });
  if (error) {
    let message = data?.error || error.message || "Failed to place prediction";
    try {
      const context = error.context;
      if (context instanceof Response) {
        const body = await context.clone().json();
        if (typeof body?.error === "string") message = body.error;
      }
    } catch { /* Preserve the fallback when the response isn't JSON. */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}