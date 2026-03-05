import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, FileCode2, Shield, ExternalLink, DollarSign } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const AdminContracts = () => {
  const [tokenContract, setTokenContract] = useState("");
  const [nftContract, setNftContract] = useState("");
  const [nftBuyUrl, setNftBuyUrl] = useState("");
  const [marketCreationFee, setMarketCreationFee] = useState("50");
  const [tokenDecimals, setTokenDecimals] = useState("18");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState("");

  useEffect(() => {
    fetchContracts();
  }, []);

  const fetchContracts = async () => {
    try {
      const { data, error } = await supabase
        .from("commission_settings")
        .select("*")
        .limit(1)
        .single();

      if (error) throw error;
      if (data) {
        setSettingsId(data.id);
        setTokenContract((data as any).token_contract_address || "");
        setNftContract((data as any).nft_contract_address || "");
        setNftBuyUrl((data as any).nft_buy_url || "");
        setMarketCreationFee(String((data as any).market_creation_fee ?? 50));
        setTokenDecimals(String((data as any).token_decimals ?? 18));
      }
    } catch (err) {
      console.error("Failed to fetch contract settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const isValidAddress = (addr: string) => {
    if (!addr) return true;
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  };

  const isValidUrl = (url: string) => {
    if (!url) return true;
    try { new URL(url); return true; } catch { return false; }
  };

  const handleSave = async () => {
    if (!isValidAddress(tokenContract)) {
      toast.error("Invalid token contract address format");
      return;
    }
    if (!isValidAddress(nftContract)) {
      toast.error("Invalid NFT contract address format");
      return;
    }
    if (!isValidUrl(nftBuyUrl)) {
      toast.error("Invalid NFT buy URL format");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("commission_settings")
        .update({
          token_contract_address: tokenContract,
          nft_contract_address: nftContract,
          nft_buy_url: nftBuyUrl,
          market_creation_fee: parseFloat(marketCreationFee) || 50,
          token_decimals: parseInt(tokenDecimals) || 18,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", settingsId);

      if (error) throw error;
      toast.success("Settings updated successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    !saving &&
    (tokenContract === "" || isValidAddress(tokenContract)) &&
    (nftContract === "" || isValidAddress(nftContract)) &&
    (nftBuyUrl === "" || isValidUrl(nftBuyUrl)) &&
    parseFloat(marketCreationFee) > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Smart Contracts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure contract addresses, purchase URLs, and market creation fee.
        </p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
        {/* Token Contract */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileCode2 className="w-4 h-4 text-primary" />
            Native Token Contract Address
          </label>
          <p className="text-xs text-muted-foreground">
            Used for token balance verification and PancakeSwap buy link.
          </p>
          <Input
            value={tokenContract}
            onChange={(e) => setTokenContract(e.target.value.trim())}
            placeholder="0x..."
            className={`font-mono text-sm ${
              tokenContract && !isValidAddress(tokenContract) ? "border-destructive focus-visible:ring-destructive" : ""
            }`}
          />
          {tokenContract && !isValidAddress(tokenContract) && (
            <p className="text-xs text-destructive">Must be a valid EVM address (0x + 40 hex characters)</p>
          )}
        </div>

        {/* NFT Contract */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Shield className="w-4 h-4 text-primary" />
            NFT Collection Contract Address
          </label>
          <p className="text-xs text-muted-foreground">
            Used for NFT ownership verification.
          </p>
          <Input
            value={nftContract}
            onChange={(e) => setNftContract(e.target.value.trim())}
            placeholder="0x..."
            className={`font-mono text-sm ${
              nftContract && !isValidAddress(nftContract) ? "border-destructive focus-visible:ring-destructive" : ""
            }`}
          />
          {nftContract && !isValidAddress(nftContract) && (
            <p className="text-xs text-destructive">Must be a valid EVM address (0x + 40 hex characters)</p>
          )}
        </div>

        {/* NFT Buy URL */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ExternalLink className="w-4 h-4 text-primary" />
            NFT Buy / Mint URL
          </label>
          <p className="text-xs text-muted-foreground">
            Where users can buy or mint the NFT (marketplace or mint page).
          </p>
          <Input
            value={nftBuyUrl}
            onChange={(e) => setNftBuyUrl(e.target.value.trim())}
            placeholder="https://..."
            className={`text-sm ${
              nftBuyUrl && !isValidUrl(nftBuyUrl) ? "border-destructive focus-visible:ring-destructive" : ""
            }`}
          />
          {nftBuyUrl && !isValidUrl(nftBuyUrl) && (
            <p className="text-xs text-destructive">Must be a valid URL</p>
          )}
        </div>

        {/* Market Creation Fee */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <DollarSign className="w-4 h-4 text-primary" />
            Market Creation Fee (USDT)
          </label>
          <p className="text-xs text-muted-foreground">
            Fee deducted from user balance to create a market without holding tokens/NFTs.
          </p>
          <Input
            type="number"
            value={marketCreationFee}
            onChange={(e) => setMarketCreationFee(e.target.value)}
            placeholder="50"
            min="1"
            className="text-sm"
          />
        </div>

        <Button onClick={handleSave} disabled={!canSave} className="w-full sm:w-auto">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Settings
        </Button>
      </div>

      <div className="bg-muted/30 border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-2">How it works</h3>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• <strong>Token Contract</strong> — Verifies minimum token balance & generates PancakeSwap buy link.</li>
          <li>• <strong>NFT Contract</strong> — Verifies NFT ownership for market creation access.</li>
          <li>• <strong>NFT Buy URL</strong> — Shown to users who don't own the required NFT.</li>
          <li>• <strong>Creation Fee</strong> — Alternative: users can pay this fee from their balance to bypass token/NFT requirements.</li>
          <li>• Minimum balance thresholds are configured in the <strong>Commissions</strong> page.</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminContracts;
