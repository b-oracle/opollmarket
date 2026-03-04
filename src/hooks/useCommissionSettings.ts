import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CommissionSettings {
  admin_fee_percent: number;
  creator_fee_percent: number;
}

export const useCommissionSettings = () => {
  return useQuery({
    queryKey: ["commission_settings"],
    queryFn: async (): Promise<CommissionSettings> => {
      const { data, error } = await supabase
        .from("commission_settings")
        .select("admin_fee_percent, creator_fee_percent")
        .limit(1)
        .maybeSingle();
      if (error || !data) return { admin_fee_percent: 2, creator_fee_percent: 3 };
      return { admin_fee_percent: Number(data.admin_fee_percent), creator_fee_percent: Number(data.creator_fee_percent) };
    },
    staleTime: 60_000,
  });
};
