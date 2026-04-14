import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface FeatureToggle {
  id: string;
  feature_key: string;
  label: string;
  enabled: boolean;
  updated_at: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
}

export const useFeatureToggles = () => {
  const { isAdmin, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();

  const { data: toggles = [], isLoading } = useQuery({
    queryKey: ["feature-toggles"],
    queryFn: async () => {
      const result = (await Promise.race([
        supabase
          .from("feature_toggles" as any)
          .select("*")
          .order("label"),
        new Promise<{ data: null; error: Error }>((resolve) => {
          setTimeout(() => {
            resolve({ data: null, error: new Error("feature_toggles timeout") });
          }, 5000);
        }),
      ])) as { data: unknown[] | null; error: { message?: string } | null };

      if (result.error) {
        console.warn("feature_toggles unavailable, continuing with safe defaults", result.error.message);
        return [] as FeatureToggle[];
      }

      return (result.data ?? []) as FeatureToggle[];
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  /** Keys that should respect the toggle even for admins */
  const adminEnforcedKeys = new Set(["jamendo_music", "category_twitter_x"]);

  const isFeatureEnabled = (key: string): boolean => {
    if ((isAdmin || isSuperAdmin) && !adminEnforcedKeys.has(key)) return true;
    const toggle = toggles.find((t) => t.feature_key === key);
    return toggle ? toggle.enabled : true;
  };

  /** Check if maintenance is active (respects client-side schedule too) */
  const isMaintenanceActive = (): boolean => {
    const toggle = toggles.find((t) => t.feature_key === "maintenance_mode");
    if (!toggle) return false;
    // If already enabled by cron or manual toggle
    if (toggle.enabled) return true;
    // Client-side fallback: check if we're within the scheduled window
    if (toggle.scheduled_start && toggle.scheduled_end) {
      const now = Date.now();
      const start = new Date(toggle.scheduled_start).getTime();
      const end = new Date(toggle.scheduled_end).getTime();
      if (now >= start && now <= end) return true;
    }
    return false;
  };

  const setToggle = async (key: string, enabled: boolean) => {
    const { error } = await supabase
      .from("feature_toggles" as any)
      .update({ enabled, updated_at: new Date().toISOString() } as any)
      .eq("feature_key", key);
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["feature-toggles"] });
  };

  const setSchedule = async (key: string, start: string | null, end: string | null) => {
    const { error } = await supabase
      .from("feature_toggles" as any)
      .update({
        scheduled_start: start,
        scheduled_end: end,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("feature_key", key);
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["feature-toggles"] });
  };

  return { toggles, isLoading, isFeatureEnabled, isMaintenanceActive, setToggle, setSchedule };
};
