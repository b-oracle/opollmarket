// Integration regression: public creator requirements must load without admin access.
import { describe, expect, it } from "vitest";

const env = import.meta.env;
const headers = { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY };

describe("public creator settings access", () => {
  it("returns the configured token and NFT contracts for visitors", async () => {
    const response = await fetch(
      `${env.VITE_SUPABASE_URL}/rest/v1/public_commission_settings?select=token_contract_address,nft_contract_address&limit=1`,
      { headers },
    );
    expect(response.status).toBe(200);
    const rows = await response.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].token_contract_address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(rows[0].nft_contract_address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it("does not give visitors access to the admin-only settings table", async () => {
    const response = await fetch(
      `${env.VITE_SUPABASE_URL}/rest/v1/commission_settings?select=id&limit=1`,
      { headers },
    );
    if (response.ok) {
      expect(await response.json()).toEqual([]);
    } else {
      expect([401, 403]).toContain(response.status);
    }
  });
});