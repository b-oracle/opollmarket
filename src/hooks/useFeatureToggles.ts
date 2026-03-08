import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface FeatureToggle {
  id: string;
  feature_key: string;
  label: string;
  enabled: boolean;
  updated_at: string;
}

export const useFeatureToggles = () => {
  const { isAdmin, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();

  const { data: toggles = [], isLoading } = useQuery({
    queryKey: ["feature-toggles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_toggles" as any)
        .select("*")
        .order("label");
      if (error) throw error;
      return (data ?? []) as unknown as FeatureToggle[];
    },
    staleTime: 30_000,
  });

  const isFeatureEnabled = (key: string): boolean => {
    // Admins and super admins always bypass
    if (isAdmin || isSuperAdmin) return true;
    const toggle = toggles.find((t) => t.feature_key === key);
    // Default to enabled if not found (safety)
    return toggle ? toggle.enabled : true;
  };

  const setToggle = async (key: string, enabled: boolean) => {
    const { error } = await supabase
      .from("feature_toggles" as any)
      .update({ enabled, updated_at: new Date().toISOString() } as any)
      .eq("feature_key", key);
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["feature-toggles"] });
  };

  return { toggles, isLoading, isFeatureEnabled, setToggle };
};
