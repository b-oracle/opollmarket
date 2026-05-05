import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { useUnreadCounts } from "@/hooks/useUnreadCounts";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import PullToRefreshIndicator from "@/components/PullToRefreshIndicator";
import { ArrowLeft, Plus, MessageCircle, Search, Inbox, Phone, Users, HelpCircle, Settings, X } from "lucide-react";
import { toast } from "sonner";
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
import CommunityChat from "./CommunityChat";
import SupportChat from "./SupportChat";

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

  const { data: myUsername } = useQuery({
    queryKey: ["my-username", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();
      return data?.username || null;
    },
    enabled: !!user,
    staleTime: 300_000,
  });
  const { supportUnread, communityUnread, markSupportRead, markCommunityRead } = useUnreadCounts();
  const { isFeatureEnabled } = useFeatureToggles();
  const [showNewChat, setShowNewChat] = useState(false);
  const [search, setSearch] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [tab, setTab] = useState<"chats" | "requests" | "calls" | "communities" | "support" | "settings">("chats");
  const [activeCommunityChat, setActiveCommunityChat] = useState<{ slug: string; label: string } | null>(null);
  const [activeSupportTicket, setActiveSupportTicket] = useState<{ ticketId: string; isStaff: boolean } | null>(null);

  // Mark sections as read when user views them
  useEffect(() => {
    if (tab === "support") {
      markSupportRead();
      queryClient.invalidateQueries({ queryKey: ["unread-support"] });
    }
  }, [tab]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["dm-conversations"] }),
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] }),
      queryClient.invalidateQueries({ queryKey: ["unread-support"] }),
      queryClient.invalidateQueries({ queryKey: ["unread-community"] }),
    ]);
  }, [queryClient]);
  const { pulling, pullDistance, refreshing, pullProgress, spinControls, handlers } = usePullToRefresh({ onRefresh: handleRefresh, scrollRef });

  const topTabs = [
    { key: "chats" as const, label: "Chats", badge: 0, featureKey: null },
    { key: "requests" as const, label: "Requests", badge: 0, featureKey: null },
    { key: "calls" as const, label: "Calls", badge: 0, featureKey: null },
  ];

  const bottomTabs = [
    { key: "chats" as const, label: "Chats", icon: MessageCircle, featureKey: null },
    { key: "communities" as const, label: "Communities", icon: Users, featureKey: "communities" },
    { key: "support" as const, label: "Support", icon: HelpCircle, featureKey: "support_tickets" },
    { key: "settings" as const, label: "Settings", icon: Settings, featureKey: "user_settings" },
  ].filter((t) => !t.featureKey || isFeatureEnabled(t.featureKey));

  const isTopTab = (t: string) => ["chats", "requests", "calls"].includes(t);
  const activeSection = isTopTab(tab) ? "chats" : tab;

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

  const existingActivePartnerIds = new Set(
    allConversations
      .filter((c) => c.status !== "rejected")
      .map((c) => c.other_user?.id)
      .filter(Boolean)
  );

  const displayUsers = search.trim()
    ? searchResults.filter((m) => !existingActivePartnerIds.has(m.id))
    : mutualFollows.filter((m) => !existingActivePartnerIds.has(m.id));

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

  // Full-screen community chat overlay
  if (activeCommunityChat) {
    return (
      <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
        <SEOHead title={`${activeCommunityChat.label} | Pollmarket`} description="Community chat" />
        <div className="max-w-lg mx-auto w-full flex flex-col flex-1 min-h-0">
          <CommunityChat
            slug={activeCommunityChat.slug}
            label={activeCommunityChat.label}
            onBack={() => setActiveCommunityChat(null)}
          />
        </div>
      </div>
    );
  }

  // Full-screen support chat overlay
  if (activeSupportTicket) {
    return (
      <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
        <SEOHead title="Support | Pollmarket" description="Support chat" />
        <div className="max-w-lg mx-auto w-full flex flex-col flex-1 min-h-0">
          <SupportChat
            ticketId={activeSupportTicket.ticketId}
            isStaff={activeSupportTicket.isStaff}
            onBack={() => { setActiveSupportTicket(null); queryClient.invalidateQueries({ queryKey: ["support-tickets"] }); }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden overflow-x-hidden">
      <SEOHead title="Messages | Pollmarket" description="Direct messages" />
      <div className="max-w-lg mx-auto w-full flex flex-col flex-1 min-h-0">
        {/* Header */}
        <div className="shrink-0 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3 z-30" style={{ paddingTop: "max(0.75rem, var(--safe-top))" }}>
          <button onClick={() => navigate(`/user/${myUsername || user?.id}`)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold flex-1">
            {tab === "communities" ? "Communities" : tab === "support" ? "Support" : tab === "settings" ? "Settings" : tab === "calls" ? "Calls" : "Messages"}
          </h1>
          {tab === "chats" && (
            <button
              onClick={() => setShowNewChat(!showNewChat)}
              className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Top tabs - only show for chat section */}
        {isTopTab(tab) && (
          <div className="shrink-0 flex border-b border-border">
            {topTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap ${
                  tab === t.key
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                {t.key === "requests" && requestCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
                    {requestCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <PullToRefreshIndicator pulling={pulling} refreshing={refreshing} pullDistance={pullDistance} pullProgress={pullProgress} spinControls={spinControls} />
        <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0" {...handlers}>
          {/* New chat picker */}
          {showNewChat && isTopTab(tab) && (
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

          {/* Tab content */}
          {isLoading && isTopTab(tab) ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tab === "chats" ? (
            <>
              {conversations.length > 0 && isFeatureEnabled("chat_search") && (
                <div className="px-4 py-2 border-b border-border">
                  <Input
                    placeholder="Search chats..."
                    value={chatSearch}
                    onChange={(e) => setChatSearch(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              )}
              {(() => {
                const filtered = chatSearch.trim()
                  ? conversations.filter((c) =>
                      (c.other_user?.display_name || "").toLowerCase().includes(chatSearch.toLowerCase())
                    )
                  : conversations;
                return filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                    <MessageCircle className="w-12 h-12 opacity-30" />
                    <p className="text-sm">{chatSearch ? "No matching chats" : "No messages yet"}</p>
                    {!chatSearch && (
                      <button
                        onClick={() => setShowNewChat(true)}
                        className="text-sm text-primary font-medium hover:underline"
                      >
                        Start a conversation
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {filtered.map((c) => (
                      <ConversationItem key={c.id} c={c} navigate={navigate} />
                    ))}
                  </div>
                );
              })()}
            </>

          ) : tab === "requests" ? (
            pendingRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                <Inbox className="w-12 h-12 opacity-30" />
                <p className="text-sm">No message requests</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {pendingRequests.map((c) => (
                  <ConversationItem
                    key={c.id}
                    c={c}
                    navigate={navigate}
                    isPending
                    currentUserId={user?.id}
                    onCancel={async (id) => {
                      if (!confirm("Cancel this message request? This will remove the conversation for both of you.")) return;
                      try {
                        await supabase.from("dm_messages" as any).delete().eq("conversation_id", id);
                        const { error } = await supabase.from("dm_conversations" as any).delete().eq("id", id);
                        if (error) throw error;
                        toast.success("Request cancelled");
                        queryClient.invalidateQueries({ queryKey: ["dm-conversations"] });
                      } catch (e: any) {
                        toast.error(e?.message || "Failed to cancel request");
                      }
                    }}
                  />
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
              <CommunitiesTab onOpenChat={(slug, label) => {
                markCommunityRead(slug);
                queryClient.invalidateQueries({ queryKey: ["unread-community"] });
                setActiveCommunityChat({ slug, label });
              }} />
            </Suspense>
          ) : tab === "support" ? (
            <Suspense fallback={
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            }>
              <SupportTab onOpenChat={(ticketId, isStaff) => setActiveSupportTicket({ ticketId, isStaff })} />
            </Suspense>
          ) : tab === "settings" ? (
            <Suspense fallback={
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            }>
              <SettingsTab />
            </Suspense>
          ) : null}
        </div>

        {/* WhatsApp-style bottom nav */}
        <div className="shrink-0 border-t border-border bg-background/95 backdrop-blur" style={{ paddingBottom: "var(--safe-bottom)" }}>
          <div className="flex items-center justify-around h-14">
            {bottomTabs.map(({ key, label, icon: Icon }) => {
              const isActive = activeSection === key;
              const badgeCount = key === "support" ? supportUnread : key === "communities" ? communityUnread : 0;
              return (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className="flex flex-col items-center gap-0.5 py-1 px-3 transition-colors relative"
                >
                  <div className="relative">
                    <Icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                    {badgeCount > 0 && (
                      <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold px-1">
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

function ConversationItem({
  c,
  navigate,
  isPending,
  currentUserId,
  onCancel,
}: {
  c: ConversationRow;
  navigate: (path: string) => void;
  isPending?: boolean;
  currentUserId?: string;
  onCancel?: (id: string) => void;
}) {
  const isInitiator = isPending && currentUserId && (c as any).initiated_by === currentUserId;
  return (
    <div className="relative w-full flex items-center">
    <button
      onClick={() => navigate(`/messages/${c.id}`)}
      className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors text-left"
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
