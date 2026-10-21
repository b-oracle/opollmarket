import { beforeEach, describe, expect, it, vi } from "vitest";
import { placeFirstPrediction } from "./firstPrediction";

const mocks = vi.hoisted(() => ({ single: vi.fn(), invoke: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from, functions: { invoke: mocks.invoke } },
}));

beforeEach(() => {
  vi.clearAllMocks();
  const query = { select: vi.fn(), eq: vi.fn(), single: mocks.single };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
  mocks.invoke.mockResolvedValue({ data: { success: true }, error: null });
});

describe("first prediction submission", () => {
  it("submits a $2 multi-option prediction at its current 25% price, not 50%", async () => {
    mocks.single.mockResolvedValue({ data: { price: 0.25 }, error: null });
    await placeFirstPrediction({ marketId: "market", optionId: "option", side: "yes", amount: 2 });
    expect(mocks.from).toHaveBeenCalledWith("market_options");
    expect(mocks.invoke).toHaveBeenCalledWith("place-bet", {
      body: { marketId: "market", optionId: "option", side: "yes", amount: 2, price: 25, shares: 8 },
    });
  });
  it("uses the selected binary side's fresh price", async () => {
    mocks.single.mockResolvedValue({ data: { yes_price: 0.3, no_price: 0.7 }, error: null });
    await placeFirstPrediction({ marketId: "market", side: "no", amount: 7 });
    expect(mocks.invoke.mock.calls[0][1].body).toMatchObject({ price: 70, shares: 10 });
  });
  it("surfaces the rejection body instead of a generic edge-function error", async () => {
    mocks.single.mockResolvedValue({ data: { price: 0.25 }, error: null });
    mocks.invoke.mockResolvedValue({ data: null, error: {
      message: "Edge Function returned a non-2xx status code",
      context: new Response(JSON.stringify({ error: "Insufficient balance" }), { status: 400 }),
    } });
    await expect(placeFirstPrediction({ marketId: "market", optionId: "option", side: "yes", amount: 2 }))
      .rejects.toThrow("Insufficient balance");
  });
  it("does not submit if the fresh quote cannot be loaded", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { message: "Unavailable" } });
    await expect(placeFirstPrediction({ marketId: "market", side: "yes", amount: 2 })).rejects.toThrow("Could not load");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});