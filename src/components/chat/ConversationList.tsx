import { useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { ArrowLeft, Plus, MessageCircle, Search, Inbox, Phone, Users, HelpCircle, Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";
import SEOHead from "@/components/SEOHead";

const CALL_MSG_REGEX = /^\[CALL:(ended|missed|declined):(\d+)\]$/;

function formatLastMessage(msg: any): string {
  if (!msg) return "";
  if (msg.gift_amount) return `🎁 Gift $${msg.gift_amount}`;
  const content = msg.content || "";
  const match = content.match(CALL_MSG_REGEX);
  if (match) {
    const [, status, durStr] = match;
    const dur = parseInt(durStr, 10);
    if (status === "missed") return "📞 Missed call";
    if (status === "declined") return "📞 Declined call";
    if (dur > 0) {
      const m = Math.floor(dur / 60);
      const s = dur % 60;
      return `📞 Call · ${m}:${s.toString().padStart(2, "0")}`;
    }
    return "📞 Call ended";
  }
  return content;
}

const CallHistoryTab = lazy(() => import("./CallHistoryTab"));
const CommunitiesTab = lazy(() => import("./CommunitiesTab"));
const SupportTab = lazy(() => import("./SupportTab"));
const SettingsTab = lazy(() => import("./SettingsTab"));

interface ConversationRow {
  id: string;
  user_a: string;
  user_b: string;
  last_message_at: string;
  status: string;
  other_user: { id: string; display_name: string; avatar_url: string | null } | null;
  last_message?: string;
  unread_count?: number;
}

const ConversationList = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isFeatureEnabled } = useFeatureToggles();
  const [showNewChat, setShowNewChat] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"chats" | "requests" | "calls" | "communities" | "support" | "settings">("chats");

  const { data: allConversations = [], isLoading } = useQuery({
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
          last_message: formatLastMessage(lastMsg as any),
          unread_count: unread || 0,
        });
      }
      return results;
    },
    enabled: !!user,
    staleTime: 10_000,
  });

  // Split into active chats and pending requests (where I'm the recipient)
  const conversations = allConversations.filter((c) => c.status === "active");
  const pendingRequests = allConversations.filter((c) => {
    if (c.status !== "pending") return false;
    // Show in requests tab only if I'm the recipient (not the sender of first msg)
    return true; // We'll show all pending - sender sees it in chats, recipient in requests
  });

  // For new chat picker - now searches ALL users, not just mutuals
  const { data: searchResults = [] } = useQuery({
    queryKey: ["user-search-for-dm", user?.id, search],
    queryFn: async () => {
      if (!user || !search.trim()) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .neq("id", user.id)
        .ilike("display_name", `%${search.trim()}%`)
        .limit(20);

      return profiles || [];
    },
    enabled: !!user && showNewChat && search.trim().length > 0,
  });

  // Also fetch mutual follows for quick suggestions
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
    allConversations.map((c) => c.other_user?.id).filter(Boolean)
  );

  const displayUsers = search.trim()
    ? searchResults.filter((m) => !existingPartnerIds.has(m.id))
    : mutualFollows.filter((m) => !existingPartnerIds.has(m.id));

  const startConversation = async (otherId: string) => {
    if (!user) return;
    try {
      const { data, error } = await supabase.rpc("start_dm_conversation", {
        _other_user_id: otherId,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["dm-conversations"] });
      navigate(`/messages/${data}`);
    } catch {
      const { toast } = await import("sonner");
      toast.error("Could not start conversation");
    }
  };

  const requestCount = pendingRequests.length;

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden overflow-x-hidden">
      <SEOHead title="Messages | Pollmarket" description="Direct messages" />
      <div className="max-w-lg mx-auto w-full flex flex-col flex-1 min-h-0">
        {/* Header */}
        <div className="shrink-0 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3 z-30" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
          <button onClick={() => navigate("/feed")} className="text-muted-foreground hover:text-foreground">
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

        {/* Tabs */}
        <div className="shrink-0 flex border-b border-border overflow-x-auto no-scrollbar">
          {([
            { key: "chats" as const, label: "Chats", icon: null },
            { key: "requests" as const, label: "Requests", icon: null, badge: requestCount },
            { key: "calls" as const, label: "Calls", icon: null },
            { key: "communities" as const, label: "Communities", icon: null },
            { key: "support" as const, label: "Support", icon: null },
            { key: "settings" as const, label: "Settings", icon: null },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 px-3 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap ${
                tab === t.key
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {(t.badge || 0) > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto min-h-0" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          {/* New chat picker */}
          {showNewChat && (
            <div className="border-b border-border p-4 space-y-3">
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9"
              />
              {displayUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">
                  {search ? "No matches" : "No suggestions available"}
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {displayUsers.map((m) => (
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
          ) : tab === "chats" ? (
            conversations.length === 0 ? (
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
                  <ConversationItem key={c.id} c={c} navigate={navigate} />
                ))}
              </div>
            )
          ) : tab === "calls" ? (
            <Suspense fallback={
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            }>
              <CallHistoryTab />
            </Suspense>
          ) : tab === "communities" ? (
            <Suspense fallback={
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            }>
              <CommunitiesTab />
            </Suspense>
          ) : tab === "support" ? (
            <Suspense fallback={
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            }>
              <SupportTab />
            </Suspense>
          ) : tab === "settings" ? (
            <Suspense fallback={
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            }>
              <SettingsTab />
            </Suspense>
          ) : (
            pendingRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                <Inbox className="w-12 h-12 opacity-30" />
                <p className="text-sm">No message requests</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {pendingRequests.map((c) => (
                  <ConversationItem key={c.id} c={c} navigate={navigate} isPending />
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

function ConversationItem({
  c,
  navigate,
  isPending,
}: {
  c: ConversationRow;
  navigate: (path: string) => void;
  isPending?: boolean;
}) {
  return (
    <button
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
        <div className="flex items-center gap-1.5 mt-0.5">
          {isPending && (
            <span className="text-[10px] font-medium text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full shrink-0">
              Request
            </span>
          )}
          <p className="text-xs text-muted-foreground truncate">
            {c.last_message || "Start chatting..."}
          </p>
        </div>
      </div>
      {(c.unread_count || 0) > 0 && (
        <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1.5">
          {c.unread_count}
        </span>
      )}
    </button>
  );
}

export default ConversationList;
