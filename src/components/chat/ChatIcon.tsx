import { MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";

const ChatIcon = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isFeatureEnabled } = useFeatureToggles();

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["dm-unread-count", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      // Get conversations where user is a participant
      const { data: convos } = await supabase
        .from("dm_conversations" as any)
        .select("id")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`) as any;
      if (!convos || convos.length === 0) return 0;
      const convoIds = convos.map((c: any) => c.id);
      const { count } = await supabase
        .from("dm_messages" as any)
        .select("id", { count: "exact", head: true })
        .in("conversation_id", convoIds)
        .neq("sender_id", user.id)
        .is("read_at", null) as any;
      return count || 0;
    },
    enabled: !!user && isFeatureEnabled("dm_chat"),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  if (!user || !isFeatureEnabled("dm_chat")) return null;

  return (
    <button
      onClick={() => navigate("/messages")}
      className="relative w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all active:scale-95"
      aria-label="Messages"
    >
      <MessageCircle className="w-5 h-5" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1 animate-pulse">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
};

export default ChatIcon;
