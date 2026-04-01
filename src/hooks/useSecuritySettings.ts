import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SecuritySettings {
  security_setup_complete: boolean;
  pin_enabled: boolean;
  totp_enabled: boolean;
  require_pin_login: boolean;
  require_totp_login: boolean;
}

const DEFAULTS: SecuritySettings = {
  security_setup_complete: false,
  pin_enabled: false,
  totp_enabled: false,
  require_pin_login: false,
  require_totp_login: false,
};

/**
 * Cached query for user_security_settings.
 * Both SecuritySetupGuard and LoginSecurityGuard share this single query,
 * so navigating between pages doesn't re-fetch from the database.
 * staleTime = 5 min, gcTime = 10 min.
 */
export const useSecuritySettings = (userId: string | null) => {
  return useQuery({
    queryKey: ["user-security-settings", userId],
    queryFn: async (): Promise<SecuritySettings> => {
      if (!userId) return DEFAULTS;

      const { data, error } = await supabase
        .from("user_security_settings" as any)
        .select("security_setup_complete, pin_enabled, totp_enabled, require_pin_login, require_totp_login")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return DEFAULTS;

      const d = data as any;
      return {
        security_setup_complete: d.security_setup_complete ?? false,
        pin_enabled: d.pin_enabled ?? false,
        totp_enabled: d.totp_enabled ?? false,
        require_pin_login: d.require_pin_login ?? false,
        require_totp_login: d.require_totp_login ?? false,
      };
    },
    enabled: !!userId,
    staleTime: 5 * 60_000, // 5 minutes — don't refetch on every navigation
    gcTime: 10 * 60_000,
    retry: 2,
    retryDelay: (attempt) => 500 * (attempt + 1),
  });
};

export const useInvalidateSecuritySettings = () => {
  const queryClient = useQueryClient();
  return (userId: string) => {
    queryClient.invalidateQueries({ queryKey: ["user-security-settings", userId] });
  };
};
