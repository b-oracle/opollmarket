import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, FileCode2, Shield } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const AdminContracts = () => {
  const [tokenContract, setTokenContract] = useState("");
  const [nftContract, setNftContract] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchContracts();
  }, []);

  const fetchContracts = async () => {
    try {
      const { data, error } = await supabase
        .from("commission_settings")
        .select("token_contract_address, nft_contract_address")
        .limit(1)
        .single();

      if (error) throw error;
      if (data) {
        setTokenContract((data as any).token_contract_address || "");
        setNftContract((data as any).nft_contract_address || "");
      }
    } catch (err) {
      console.error("Failed to fetch contract settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const isValidAddress = (addr: string) => {
    if (!addr) return true; // allow empty
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
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

    setSaving(true);
    try {
      const { error } = await supabase
        .from("commission_settings")
        .update({
          token_contract_address: tokenContract,
          nft_contract_address: nftContract,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", (await supabase.from("commission_settings").select("id").limit(1).single()).data?.id || "");

      if (error) throw error;
      toast.success("Contract addresses updated successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to save contract addresses");
    } finally {
      setSaving(false);
    }
  };

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
          Configure the token and NFT contract addresses used for token-gating market creation.
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
            The EVM smart contract address for the platform's native token (e.g. BEP-20 / ERC-20).
          </p>
          <Input
            value={tokenContract}
            onChange={(e) => setTokenContract(e.target.value.trim())}
            placeholder="0x..."
            className={`font-mono text-sm ${
              tokenContract && !isValidAddress(tokenContract)
                ? "border-destructive focus-visible:ring-destructive"
                : ""
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
            The EVM smart contract address for the NFT collection used for avatar verification.
          </p>
          <Input
            value={nftContract}
            onChange={(e) => setNftContract(e.target.value.trim())}
            placeholder="0x..."
            className={`font-mono text-sm ${
              nftContract && !isValidAddress(nftContract)
                ? "border-destructive focus-visible:ring-destructive"
                : ""
            }`}
          />
          {nftContract && !isValidAddress(nftContract) && (
            <p className="text-xs text-destructive">Must be a valid EVM address (0x + 40 hex characters)</p>
          )}
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || (tokenContract !== "" && !isValidAddress(tokenContract)) || (nftContract !== "" && !isValidAddress(nftContract))}
          className="w-full sm:w-auto"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Contract Addresses
        </Button>
      </div>

      <div className="bg-muted/30 border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-foreground mb-2">How it works</h3>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• The <strong>Token Contract</strong> is used to verify users hold the minimum token balance before creating markets.</li>
          <li>• The <strong>NFT Contract</strong> is used to verify users hold the required NFTs for market creation access.</li>
          <li>• Minimum balance thresholds can be configured in the <strong>Commissions</strong> page.</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminContracts;
