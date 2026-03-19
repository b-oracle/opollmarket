import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import StatusCard from "./StatusCard";
import StatusComposer from "./StatusComposer";
import { Loader2, FileText } from "lucide-react";

interface StatusFeedProps {
  userId?: string;
  showComposer?: boolean;
}

const StatusFeed = ({ userId, showComposer = false }: StatusFeedProps) => {
  const { user } = useAuth();
  const { isFeatureEnabled } = useFeatureToggles();

  

  // If userId provided, show that user's statuses. Otherwise show ALL public posts (Twitter-style).
  const { data: statuses = [], isLoading } = useQuery({
    queryKey: ["status-feed", userId || "global", user?.id],
    queryFn: async () => {
      if (userId) {
        const { data } = await supabase
          .from("status_updates")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);
        return data || [];
      }

      // Global feed — show all posts from all users
      const { data } = await supabase
        .from("status_updates")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  // Fetch profiles for all status authors
  const authorIds = [...new Set(statuses.map((s: any) => s.user_id))];
  const { data: profileMap = new Map() } = useQuery({
    queryKey: ["status-profiles", authorIds.join(",")],
    queryFn: async () => {
      if (authorIds.length === 0) return new Map();
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, verification_level")
        .in("id", authorIds.slice(0, 50));
      return new Map((data || []).map((p: any) => [p.id, p]));
    },
    enabled: authorIds.length > 0,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {showComposer && <StatusComposer />}

      {statuses.length === 0 ? (
        <div className="flex flex-col items-center py-16">
          <FileText className="w-8 h-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No posts yet</p>
        </div>
      ) : (
        statuses.map((s: any, i: number) => (
          <StatusCard
            key={s.id}
            status={s}
            profile={(profileMap as Map<string, any>).get(s.user_id)}
            index={i}
          />
        ))
      )}
    </div>
  );
};

export default StatusFeed;
