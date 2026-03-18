import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SocialLink {
  id: string;
  label: string;
  url: string;
  icon_key: string;
  enabled: boolean;
  sort_order: number;
}

export const useSocialLinks = (enabledOnly = true) => {
  return useQuery({
    queryKey: ["social-links", enabledOnly],
    queryFn: async () => {
      let query = supabase
        .from("social_links")
        .select("id, label, url, icon_key, enabled, sort_order")
        .order("sort_order", { ascending: true });

      if (enabledOnly) {
        query = query.eq("enabled", true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as SocialLink[];
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const useUpdateSocialLink = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (link: Partial<SocialLink> & { id: string }) => {
      const { error } = await supabase
        .from("social_links")
        .update({ ...link, updated_at: new Date().toISOString() })
        .eq("id", link.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social-links"] });
    },
  });
};
