import { useState, useEffect } from "react";
import { Bell, X, Check, TrendingUp, RefreshCw, DollarSign, Info, BellRing, UserPlus, Gift, Phone } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  market_id: string | null;
  actor_id: string | null;
  created_at: string;
}

const typeConfig: Record<string, { icon: typeof Bell; colorClass: string }> = {
  payout: { icon: DollarSign, colorClass: "text-primary bg-primary/10" },
  resolution: { icon: TrendingUp, colorClass: "text-muted-foreground bg-muted/50" },
  refund: { icon: RefreshCw, colorClass: "text-primary bg-primary/10" },
  info: { icon: Info, colorClass: "text-muted-foreground bg-muted/50" },
  follow: { icon: UserPlus, colorClass: "text-primary bg-primary/10" },
  gift: { icon: Gift, colorClass: "text-primary bg-primary/10" },
  call: { icon: Phone, colorClass: "text-primary bg-primary/10" },
};

const formatTimeAgo = (date: string) => {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const NotificationBell = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isSupported: pushSupported, isSubscribed: pushSubscribed, loading: pushLoading, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushNotifications();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchNotifications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setNotifications(data as Notification[]);
  };

  useEffect(() => {
    fetchNotifications();
    if (!user) return;

    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const markAllRead = async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleClick = (n: Notification) => {
    if (!n.read) {
      supabase.from("notifications").update({ read: true }).eq("id", n.id).then(() => {
        setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x));
      });
    }

    // Space is Live notifications → join the space directly
    if (n.title.includes("Space is Live") && n.market_id) {
      setOpen(false);
      // Fetch space info and join it
      supabase
        .from("spaces")
        .select("id, title, host_id")
        .eq("id", n.market_id)
        .single()
        .then(({ data: space }) => {
          if (space && space.id) {
            // Navigate to feed/social tab first, then join space via context
            navigate("/feed?tab=spaces");
            // Dispatch a custom event so the app can join the space
            window.dispatchEvent(new CustomEvent("join-space", { detail: { id: space.id, title: space.title, hostId: space.host_id } }));
          }
        });
      return;
    }

    // Welcome bonus notification → balance breakdown
    if (n.type === "welcome_bonus" || n.title?.includes("Welcome Bonus")) {
      setOpen(false);
      navigate("/commissions");
      return;
    }

    // Gift notifications → navigate to sender's profile
    if ((n.type === "gift" || n.title.includes("Gift Received")) && n.actor_id) {
      setOpen(false);
      navigate(`/user/${n.actor_id}`);
      return;
    }

    // Follower notifications → navigate to follower's profile
    if (n.title.includes("Follower") && n.actor_id) {
      setOpen(false);
      navigate(`/user/${n.actor_id}`);
      return;
    }

    // Space invite / live notifications → join the space directly
    if (n.title?.includes("Space Invite") || n.title?.includes("Space is Live") || n.title?.includes("Scheduled Space is Live")) {
      setOpen(false);
      if (n.market_id) {
        window.dispatchEvent(new CustomEvent("join-space", { detail: { id: n.market_id, title: "", hostId: "" } }));
      }
      navigate("/");
      return;
    }

    // Call notifications: incoming-call rows have market_id=null (FK→markets),
    // so we can't navigate via market_id. Resolve the conversation + the
    // ringing/active call from dm_calls using actor_id (= caller). When we
    // find a still-ringing call, append `?incoming_call_id=...&auto_accept=1`
    // so ChatView's auto-accept effect picks it up and answers the call.
    if (n.type === "call" && n.actor_id && user) {
      setOpen(false);
      (async () => {
        // Find the most recent call between caller (actor_id) and current user
        const { data: call } = await supabase
          .from("dm_calls")
          .select("id, conversation_id, status")
          .eq("caller_id", n.actor_id)
          .eq("callee_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!call?.conversation_id) {
          // Fallback: just open conversations list
          navigate("/messages");
          return;
        }

        // Only auto-accept if the call is still ringing; otherwise just open
        // the thread (it's likely already missed/ended/declined).
        if (call.status === "ringing") {
          navigate(
            `/messages/${call.conversation_id}?incoming_call_id=${encodeURIComponent(call.id)}&auto_accept=1&call_id=${encodeURIComponent(call.id)}`
          );
        } else {
          navigate(`/messages/${call.conversation_id}?missed_call_id=${encodeURIComponent(call.id)}`);
        }
      })();
      return;
    }

    // Draft reminder → go to create page
    if (n.title?.includes("Unfinished Draft")) {
      setOpen(false);
      navigate("/portfolio");
      return;
    }

    if (n.market_id) {
      setOpen(false);
      navigate(`/market/${n.market_id}`);
    }
  };

  if (!user) return null;

  return (
    <div className="relative">
      <button
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && unreadCount > 0) {
            // Auto-mark all as read when opening the bell
            markAllRead();
          }
        }}
        className="relative w-9 h-9 rounded-full glass flex items-center justify-center transition-colors hover:bg-accent/50"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40"
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              className="fixed left-2 right-2 sm:left-auto sm:right-0 sm:absolute sm:w-80 top-14 sm:top-12 max-h-[70dvh] flex flex-col rounded-xl border border-border shadow-xl z-50 bg-card backdrop-blur-[30px]"
            >
              <div className="flex items-center justify-between p-3 border-b border-border/30 shrink-0">
                <h3 className="text-sm font-bold">Notifications</h3>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="text-[10px] text-primary font-semibold hover:underline">
                      Mark all read
                    </button>
                  )}
                  <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Push notification toggle */}
              {pushSupported && (
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <BellRing className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">Push alerts</span>
                  </div>
                  <button
                    disabled={pushLoading}
                    onClick={async () => {
                      if (pushSubscribed) {
                        await pushUnsubscribe();
                        toast.info("Push notifications disabled");
                      } else {
                        const ok = await pushSubscribe();
                        if (ok) toast.success("Push notifications enabled!");
                        else toast.error("Permission denied or failed");
                      }
                    }}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors ${
                      pushSubscribed
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {pushLoading ? "..." : pushSubscribed ? "On" : "Off"}
                  </button>
                </div>
              )}

              <div className="overflow-y-auto flex-1 min-h-0" style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehavior: "contain", willChange: "scroll-position" } as React.CSSProperties}>
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No notifications yet</div>
              ) : (
                <div className="divide-y divide-border/20">
                  {notifications.map((n) => {
                    const cfg = typeConfig[n.type] || typeConfig.info;
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={n.id}
                        onClick={() => handleClick(n)}
                        className={`w-full text-left p-3 flex items-start gap-2.5 hover:bg-accent/30 transition-colors ${!n.read ? "bg-primary/5" : ""}`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.colorClass}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold ${!n.read ? "text-foreground" : "text-muted-foreground"}`}>{n.title}</p>
                          <p className="text-[10px] text-muted-foreground line-clamp-2">{n.message}</p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">{formatTimeAgo(n.created_at)}</p>
                        </div>
                        {!n.read && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />}
                      </button>
                    );
                  })}
                </div>
              )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;
