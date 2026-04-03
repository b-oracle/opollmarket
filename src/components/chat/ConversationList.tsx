import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Plus, MessageCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";
import SEOHead from "@/components/SEOHead";

interface ConversationRow {
  id: string;
  user_a: string;
  user_b: string;
  last_message_at: string;
  other_user: { id: string; display_name: string; avatar_url: string | null } | null;
  last_message?: string;
  unread_count?: number;
}

const ConversationList = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showNewChat, setShowNewChat] = useState(false);
  const [search, setSearch] = useState("");

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["dm-conversations", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: convos } = await supabase
        .from("dm_conversations" as any)
        .select("*")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .order("last_message_at", { ascending: false });

      if (!convos || convos.length === 0) return [];

      const otherIds = (convos as any[]).map((c) =>
        c.user_a === user.id ? c.user_b : c.user_a
      );

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", otherIds);

      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

      // Get last message + unread count per conversation
      const results: ConversationRow[] = [];
      for (const c of convos as any[]) {
        const otherId = c.user_a === user.id ? c.user_b : c.user_a;

        const { data: lastMsg } = await supabase
          .from("dm_messages" as any)
          .select("content, gift_amount")
          .eq("conversation_id", c.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle() as any;

        const { count: unread } = await supabase
          .from("dm_messages" as any)
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", c.id)
          .neq("sender_id", user.id)
          .is("read_at", null) as any;

        results.push({
          ...c,
          other_user: profileMap.get(otherId) || { id: otherId, display_name: "User", avatar_url: null },
          last_message: (lastMsg as any)?.gift_amount ? `🎁 Gift $${(lastMsg as any).gift_amount}` : (lastMsg as any)?.content || "",
          unread_count: unread || 0,
        });
      }
      return results;
    },
    enabled: !!user,
    staleTime: 10_000,
  });

  // Mutual follows for new chat picker
  const { data: mutualFollows = [] } = useQuery({
    queryKey: ["mutual-follows-for-dm", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: myFollowing } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id);
      const { data: myFollowers } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("following_id", user.id);

      if (!myFollowing || !myFollowers) return [];

      const followingSet = new Set(myFollowing.map((f) => f.following_id));
      const mutualIds = myFollowers
        .map((f) => f.follower_id)
        .filter((id) => followingSet.has(id));

      if (mutualIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", mutualIds);

      return profiles || [];
    },
    enabled: !!user && showNewChat,
  });

  const existingPartnerIds = new Set(
    conversations.map((c) => c.other_user?.id).filter(Boolean)
  );

  const availableMutuals = mutualFollows.filter(
    (m) => !existingPartnerIds.has(m.id)
  );

  const filteredMutuals = search
    ? availableMutuals.filter((m) =>
        (m.display_name || "").toLowerCase().includes(search.toLowerCase())
      )
    : availableMutuals;

  const startConversation = async (otherId: string) => {
    if (!user) return;
    const [a, b] = user.id < otherId ? [user.id, otherId] : [otherId, user.id];

    // Check if exists
    const { data: existing } = await supabase
      .from("dm_conversations" as any)
      .select("id")
      .eq("user_a", a)
      .eq("user_b", b)
      .maybeSingle();

    if (existing) {
      navigate(`/messages/${(existing as any).id}`);
      return;
    }

    const { data: created, error } = await supabase
      .from("dm_conversations" as any)
      .insert({ user_a: a, user_b: b })
      .select("id")
      .single();

    if (error) {
      const { toast } = await import("sonner");
      toast.error("Could not start conversation. Make sure you follow each other.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["dm-conversations"] });
    navigate(`/messages/${(created as any).id}`);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <SEOHead title="Messages | Pollmarket" description="Direct messages" />
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
          <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold flex-1">Messages</h1>
          <button
            onClick={() => setShowNewChat(!showNewChat)}
            className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* New chat picker */}
        {showNewChat && (
          <div className="border-b border-border p-4 space-y-3">
            <Input
              placeholder="Search mutual follows..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
            />
            {filteredMutuals.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">
                {search ? "No matches" : "No mutual follows available"}
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {filteredMutuals.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => startConversation(m.id)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
                      {m.avatar_url ? (
                        <img src={m.avatar_url} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <span className="text-xs font-bold text-primary">
                          {(m.display_name || "?").charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-medium">{m.display_name || "User"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Conversation list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <MessageCircle className="w-12 h-12 opacity-30" />
            <p className="text-sm">No messages yet</p>
            <button
              onClick={() => setShowNewChat(true)}
              className="text-sm text-primary font-medium hover:underline"
            >
              Start a conversation
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/messages/${c.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors text-left"
              >
                <div className="relative w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                  {c.other_user?.avatar_url ? (
                    <img src={c.other_user.avatar_url} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <span className="text-sm font-bold text-primary">
                      {(c.other_user?.display_name || "?").charAt(0).toUpperCase()}
                    </span>
                  )}
                  {(c.unread_count || 0) > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-destructive border-2 border-background" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold truncate">{c.other_user?.display_name || "User"}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {c.last_message_at
                        ? formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true })
                        : ""}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {c.last_message || "Start chatting..."}
                  </p>
                </div>
                {(c.unread_count || 0) > 0 && (
                  <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1.5">
                    {c.unread_count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationList;
