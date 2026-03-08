import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface CopySettingsData {
  copy_predictions: boolean;
  copy_quick_trades: boolean;
  auto_copy: boolean;
  max_amount: number;
}

export const useCopySettings = (targetUserId: string | undefined) => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<CopySettingsData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || !targetUserId) return;
    (async () => {
      const { data } = await supabase
        .from("copy_settings" as any)
        .select("*")
        .eq("user_id", user.id)
        .eq("target_user_id", targetUserId)
        .maybeSingle();
      if (data) {
        setSettings({
          copy_predictions: (data as any).copy_predictions,
          copy_quick_trades: (data as any).copy_quick_trades,
          auto_copy: (data as any).auto_copy,
          max_amount: Number((data as any).max_amount),
        });
      }
    })();
  }, [user, targetUserId]);

  const updateSettings = useCallback(async (updates: Partial<CopySettingsData>) => {
    if (!user || !targetUserId) return;
    setLoading(true);
    const newSettings = { ...settings, ...updates };
    try {
      await supabase
        .from("copy_settings" as any)
        .upsert({
          user_id: user.id,
          target_user_id: targetUserId,
          ...newSettings,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,target_user_id" });
      setSettings(newSettings as CopySettingsData);
      toast.success("Copy settings updated");
    } catch {
      toast.error("Failed to update copy settings");
    } finally {
      setLoading(false);
    }
  }, [user, targetUserId, settings]);

  return { settings, loading, updateSettings };
};
