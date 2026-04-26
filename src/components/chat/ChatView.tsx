import { useState, useEffect, useRef, useCallback } from "react";
import ChatDoodleBackground from "./ChatDoodleBackground";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { ArrowLeft, Send, Gift, Loader2, Share2, Check, X, Phone, Video } from "lucide-react";
import NftBadge, { type VerificationLevel } from "@/components/NftBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ChatGiftModal from "./ChatGiftModal";
import ChatMessageBubble from "./ChatMessageBubble";
import ChatSharePicker from "./ChatSharePicker";
import SEOHead from "@/components/SEOHead";
import { toast } from "sonner";
import { logCallEvent } from "@/lib/callEvents";

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  gift_amount: number | null;
  created_at: string;
  read_at: string | null;
  reactions?: Record<string, string[]>;
  reply_to_id?: string | null;
  reply_to_content?: string | null;
  reply_to_sender_name?: string | null;
}

interface ReplyTo {
  id: string;
  content: string;
  senderName: string;
}

const ChatView = () => {
  const { conversationId: paramId } = useParams<{ conversationId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isFeatureEnabled } = useFeatureToggles();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showGift, setShowGift] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [calling, setCalling] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [resolvedConvoId, setResolvedConvoId] = useState<string | null>(null);
  const resolvedRef = useRef(false);
  const autoAcceptedRef = useRef<string | null>(null);
  // null = idle, "reconnecting" = retry loop running, "failed" = gave up.
  // Drives the slim banner shown under the header so users get visible
  // feedback while we wait for conversation/convo data before auto-joining.
  const [rejoinStatus, setRejoinStatus] = useState<null | "reconnecting" | "failed">(null);

  // If paramId is a user ID (not a conversation ID), resolve it to a conversation
  useEffect(() => {
    if (!paramId || !user) return;
    resolvedRef.current = false;
    setResolvedConvoId(null);

    // Try to load as conversation first
    (async () => {
      const { data: existing } = await supabase
        .from("dm_conversations" as any)
        .select("id")
        .eq("id", paramId)
        .maybeSingle() as any;

      if (existing) {
        // paramId is a valid conversation ID
        setResolvedConvoId(paramId);
        resolvedRef.current = true;
        return;
      }

      // paramId might be a user ID — use start_dm_conversation RPC
      try {
        const { data: convoId, error } = await supabase.rpc("start_dm_conversation", {
          _other_user_id: paramId,
        });
        if (error) throw error;
        if (convoId) {
          // Replace URL so back button works correctly
          navigate(`/messages/${convoId}`, { replace: true });
          setResolvedConvoId(convoId);
          resolvedRef.current = true;
        }
      } catch (err) {
        console.error("Failed to resolve conversation:", err);
        toast.error("Could not start conversation");
        navigate("/messages", { replace: true });
      }
    })();
  }, [paramId, user, navigate]);

  const conversationId = resolvedConvoId;

  const { data: convo } = useQuery({
    queryKey: ["dm-conversation", conversationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("dm_conversations" as any)
        .select("*")
        .eq("id", conversationId)
        .single() as any;
      if (!data) return null;
      const otherId = data.user_a === user!.id ? data.user_b : data.user_a;
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, verification_level")
        .eq("id", otherId)
        .maybeSingle();
      return { ...(data as any), other_user: profile };
    },
    enabled: !!conversationId && !!user,
  });

  const convStatus = (convo as any)?.status || "active";
  const otherId = convo ? ((convo as any).user_a === user?.id ? (convo as any).user_b : (convo as any).user_a) : null;
  const otherName = (convo as any)?.other_user?.display_name || "User";
  const otherVerification = ((convo as any)?.other_user?.verification_level || "none") as VerificationLevel;

  const isInitiator = convo ? (convo as any).initiated_by === user?.id : false;
  const isRecipientOfRequest = convStatus === "pending" && !isInitiator && !!convo;
  const isSenderOfRequest = convStatus === "pending" && isInitiator && !!convo;

  const { data: messages = [] } = useQuery({
    queryKey: ["dm-messages", conversationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("dm_messages" as any)
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(200) as any;
      return (data || []) as Message[];
    },
    enabled: !!conversationId,
    staleTime: 5_000,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  useEffect(() => {
    if (!user || !conversationId || messages.length === 0) return;
    const hasUnread = messages.some((m) => m.sender_id !== user.id && !m.read_at);
    if (!hasUnread) return;
    supabase
      .rpc("mark_dm_messages_read", { _conversation_id: conversationId })
      .then(({ error }) => {
        if (error) console.error("mark_dm_messages_read error:", error);
        queryClient.invalidateQueries({ queryKey: ["dm-unread-count"] });
        queryClient.invalidateQueries({ queryKey: ["dm-messages", conversationId] });
        queryClient.invalidateQueries({ queryKey: ["dm-conversations"] });
      });
  }, [messages, user, conversationId, queryClient]);

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`dm-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dm_messages", filter: `conversation_id=eq.${conversationId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["dm-messages", conversationId] });
          queryClient.invalidateQueries({ queryKey: ["dm-unread-count"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, queryClient]);

  const sendMessage = useCallback(async (content?: string) => {
    const trimmed = (content || text).trim();
    if (!trimmed || sending || !conversationId || !user) return;
    setSending(true);
    try {
      const payload: any = {
        conversation_id: conversationId,
        sender_id: user.id,
        content: trimmed,
      };
      if (replyTo && !content) {
        payload.reply_to_id = replyTo.id;
        payload.reply_to_content = replyTo.content.slice(0, 200);
        payload.reply_to_sender_name = replyTo.senderName;
      }
      const { error } = await supabase
        .from("dm_messages" as any)
        .insert(payload);
      if (error) throw error;
      if (!content) {
        setText("");
        setReplyTo(null);
      }
      queryClient.invalidateQueries({ queryKey: ["dm-messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["dm-conversations"] });
    } catch (err: any) {
      console.error("DM send error:", err?.message || err, err?.code, err?.details);
      toast.error("Failed to send message");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [text, sending, conversationId, user, queryClient, replyTo]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleShareLink = (url: string) => {
    sendMessage(url);
  };

  const handleReply = useCallback((info: { id: string; content: string; senderName: string }) => {
    setReplyTo(info);
    inputRef.current?.focus();
  }, []);

  const handleScrollToMessage = useCallback((messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("bg-primary/10");
      setTimeout(() => el.classList.remove("bg-primary/10"), 1500);
    }
  }, []);

  const handleAccept = async () => {
    if (!conversationId) return;
    setAccepting(true);
    try {
      const { data, error } = await supabase.rpc("accept_dm_request", {
        _conversation_id: conversationId,
      });
      if (error) throw error;
      if (!(data as any)?.success) {
        toast.error((data as any)?.error || "Failed to accept");
        return;
      }
      toast.success("Request accepted!");
      queryClient.invalidateQueries({ queryKey: ["dm-conversation", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["dm-conversations"] });
    } catch {
      toast.error("Failed to accept request");
    } finally {
      setAccepting(false);
    }
  };

  const handleReject = async () => {
    if (!conversationId) return;
    setAccepting(true);
    try {
      const { data, error } = await supabase.rpc("reject_dm_request", {
        _conversation_id: conversationId,
      });
      if (error) throw error;
      if (!(data as any)?.success) {
        toast.error((data as any)?.error || "Failed to reject");
        return;
      }
      toast("Request rejected");
      navigate("/messages");
    } catch {
      toast.error("Failed to reject request");
    } finally {
      setAccepting(false);
    }
  };

  const canSendMessage = convStatus === "active" || (isSenderOfRequest && messages.length === 0);
  const isRejected = convStatus === "rejected";

  const handleRejoinCall = useCallback(async (callId: string, withVideo = false) => {
    if (!conversationId || !user) return;
    setCalling(true);
    try {
      logCallEvent(callId, "rejoin", { with_video: withVideo });
      const { data, error } = await supabase.functions.invoke("dm-call-token", {
        body: { action: "rejoin", call_id: callId },
      });

      if (error || data?.error) throw new Error(data?.error || "Failed to rejoin call");

      window.dispatchEvent(
        new CustomEvent("start-voice-call", {
          detail: {
            callId: data.call_id,
            conversationId,
            token: data.token,
            url: data.url,
            room: data.room,
            passphrase: data.e2ee_passphrase,
            otherName,
            otherAvatar: (convo as any)?.other_user?.avatar_url,
            isOutgoing: true,
            startWithVideo: withVideo,
          },
        })
      );
    } catch (err: any) {
      logCallEvent(callId, "failed", { stage: "rejoin", error: err?.message });
      toast.error(err.message || "Failed to rejoin call");
    } finally {
      setCalling(false);
    }
  }, [conversationId, user, otherName, convo]);

  const handleStartCall = useCallback(async (withVideo = false) => {
    if (calling || !conversationId || !user) return;
    setCalling(true);
    try {
      const { data, error } = await supabase.functions.invoke("dm-call-token", {
        body: { action: "start", conversation_id: conversationId },
      });

      if (error) {
        let message = error.message || "Failed to start call";
        let activeCallId: string | null = null;
        let canRejoin = false;
        const errorContext = (error as any)?.context;

        if (errorContext instanceof Response) {
          try {
            const payload = await errorContext.json();
            if (payload?.error) message = payload.error;
            activeCallId = payload?.active_call_id || null;
            canRejoin = payload?.can_rejoin === true;
          } catch {
            // Keep the default message
          }
        }

        if (canRejoin && activeCallId) {
          toast("Ongoing call found", {
            description: "Tap Rejoin to reconnect to the active call.",
            action: {
              label: "Rejoin",
              onClick: () => handleRejoinCall(activeCallId!, withVideo),
            },
            duration: 15000,
          });
          setCalling(false);
          return;
        }

        throw new Error(message);
      }

      if (data?.error) throw new Error(data.error);

      window.dispatchEvent(
        new CustomEvent("start-voice-call", {
          detail: {
            callId: data.call_id,
            conversationId,
            token: data.token,
            url: data.url,
            room: data.room,
            passphrase: data.e2ee_passphrase,
            otherName,
            otherAvatar: (convo as any)?.other_user?.avatar_url,
            isOutgoing: true,
            startWithVideo: withVideo,
          },
        })
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to start call");
    } finally {
      setCalling(false);
    }
  }, [calling, conversationId, user, otherName, convo, handleRejoinCall]);

  // Auto-accept incoming call when arriving via native notification deep link
  // (opoll://call/accept → /messages/<id>?call_id=...&auto_accept=1)
  // Polls until conversation/convo data is ready, then joins.
  // Strips ONLY auto_accept + call_id from the URL after the attempt resolves
  // — preserves utm_*, ref, and any other tracking/query params untouched.
  useEffect(() => {
    const autoAccept = searchParams.get("auto_accept");
    const callId = searchParams.get("call_id");
    if (autoAccept !== "1" || !callId) return;
    if (autoAcceptedRef.current === callId) return;

    // Mark as in-flight immediately so re-renders don't re-enter this effect
    // for the same callId. We still wait to clear the URL params until after
    // the join attempt resolves (success or timeout) so a mid-flight unmount
    // doesn't lose context.
    autoAcceptedRef.current = callId;

    let attempts = 0;
    const MAX_ATTEMPTS = 10;        // ~10s of polling (1s interval)
    const HARD_TIMEOUT_MS = 15_000; // absolute upper bound
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let done = false;

    const stripCallParams = () => {
      // Use the functional form so we merge against the LATEST params,
      // not the snapshot captured when the effect ran. This preserves any
      // utm_*, ref, or other params that may have been added meanwhile.
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("auto_accept");
          next.delete("call_id");
          return next;
        },
        { replace: true },
      );
    };

    const stop = (opts: { strip: boolean }) => {
      if (done) return;
      done = true;
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      if (opts.strip) stripCallParams();
    };

    const tryAccept = () => {
      if (done) return;
      attempts += 1;
      if (conversationId && user && convo) {
        setRejoinStatus(null);
        handleRejoinCall(callId, false);
        stop({ strip: true });
        return;
      }
      // Surface the reconnecting banner once we've waited at least one tick
      // — avoids a flash for the common case where everything is ready on the
      // first synchronous attempt.
      setRejoinStatus("reconnecting");
      if (attempts >= MAX_ATTEMPTS) {
        console.warn("auto_accept: gave up after", attempts, "attempts");
        // Reset so a future deep link with the same callId could retry
        autoAcceptedRef.current = null;
        setRejoinStatus("failed");
        stop({ strip: true });
      }
    };

    // Try immediately, then poll
    tryAccept();
    if (!done) {
      intervalId = setInterval(tryAccept, 1000);
      timeoutId = setTimeout(() => {
        if (!done) {
          console.warn("auto_accept: hard timeout reached");
          autoAcceptedRef.current = null;
          setRejoinStatus("failed");
        }
        stop({ strip: true });
      }, HARD_TIMEOUT_MS);
    }

    // Cleanup on unmount: stop timers but DON'T strip params, so if the user
    // navigates back the deep-link intent is still respected.
    return () => {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [conversationId, user, convo, searchParams, setSearchParams, handleRejoinCall]);



  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden overflow-x-hidden relative">
      {isFeatureEnabled("chat_doodle_bg") && <ChatDoodleBackground />}
      <SEOHead title={`Chat with ${otherName} | Pollmarket`} description="Direct message" />
      {/* Header */}
      <div className="bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3 shrink-0" style={{ paddingTop: "max(0.75rem, var(--safe-top))" }}>
        <button onClick={() => navigate("/messages")} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div
          className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
          onClick={() => otherId && navigate(`/user/${otherId}`)}
        >
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
            {(convo as any)?.other_user?.avatar_url ? (
              <img src={(convo as any).other_user.avatar_url} className="w-full h-full object-cover" alt="" />
            ) : (
              <span className="text-xs font-bold text-primary">{otherName.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <span className="text-sm font-semibold truncate">{otherName}</span>
          {otherVerification !== "none" && <NftBadge level={otherVerification} size={16} />}
        </div>
        {convStatus === "active" && isFeatureEnabled("voice_calls") && (
          <>
            <button
              onClick={() => handleStartCall(true)}
              disabled={calling}
              className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors shrink-0 disabled:opacity-50"
              aria-label="Video call"
            >
              {calling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
            </button>
            <button
              onClick={() => handleStartCall(false)}
              disabled={calling}
              className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors shrink-0 disabled:opacity-50"
              aria-label="Voice call"
            >
              {calling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
            </button>
          </>
        )}
      </div>

      {/* Pending request banner for recipient */}
      {isRecipientOfRequest && (
        <div className="shrink-0 bg-amber-500/10 border-b border-amber-500/20 px-4 py-3 flex items-center gap-3">
          <p className="text-sm text-foreground flex-1">
            <span className="font-semibold">{otherName}</span> wants to message you
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReject}
            disabled={accepting}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <X className="w-4 h-4 mr-1" />
            Reject
          </Button>
          <Button
            size="sm"
            onClick={handleAccept}
            disabled={accepting}
          >
            <Check className="w-4 h-4 mr-1" />
            Accept
          </Button>
        </div>
      )}

      {/* Pending status for sender */}
      {isSenderOfRequest && (
        <div className="shrink-0 bg-muted/50 border-b border-border px-4 py-2.5 text-center">
          <p className="text-xs text-muted-foreground">
            ⏳ Message request sent — waiting for {otherName} to accept
          </p>
        </div>
      )}

      {/* Rejected status */}
      {isRejected && (
        <div className="shrink-0 bg-destructive/10 border-b border-destructive/20 px-4 py-2.5 text-center">
          <p className="text-xs text-muted-foreground">This message request was declined</p>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} data-chat-scroll className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 px-4 py-4 space-y-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-20">
            <span className="text-6xl mb-4">💬</span>
            <h3 className="text-lg font-semibold text-foreground mb-1">No messages here yet...</h3>
            <p className="text-sm text-muted-foreground">Send a message to start the conversation.</p>
          </div>
        )}
        {messages.map((m) => (
          <ChatMessageBubble
            key={m.id}
            message={m}
            conversationId={conversationId!}
            onReply={handleReply}
            onScrollToMessage={handleScrollToMessage}
          />
        ))}
      </div>

      {/* Input bar */}
      {canSendMessage && !isRejected ? (
        <div className="bg-background/95 backdrop-blur border-t border-border px-4 py-3 shrink-0" style={{ paddingBottom: "max(0.75rem, var(--safe-bottom))" }}>
          {/* Reply context banner */}
          {replyTo && (
            <div className="max-w-lg mx-auto mb-2 flex items-center gap-2 bg-muted/60 rounded-lg px-3 py-2 border-l-2 border-primary">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-primary">{replyTo.senderName}</p>
                <p className="text-xs text-muted-foreground truncate">{replyTo.content.slice(0, 80)}</p>
              </div>
              <button
                onClick={() => setReplyTo(null)}
                className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full hover:bg-accent"
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          )}
          <div className="max-w-lg mx-auto flex items-center gap-2">
            {convStatus === "active" && (
              <>
                <button
                  onClick={() => setShowGift(true)}
                  className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors shrink-0"
                  aria-label="Send gift"
                >
                  <Gift className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowShare(true)}
                  className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors shrink-0"
                  aria-label="Share market or space"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </>
            )}
            <Input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={replyTo ? "Reply..." : convStatus === "pending" ? "Send a message request..." : "Type a message..."}
              className="flex-1 h-10 rounded-full"
              maxLength={2000}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!text.trim() || sending}
              className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-50 transition-all active:scale-95 shrink-0"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      ) : !isRejected && convStatus === "pending" && isSenderOfRequest ? (
        <div className="bg-muted/30 border-t border-border px-4 py-3 text-center shrink-0" style={{ paddingBottom: "max(0.75rem, var(--safe-bottom))" }}>
          <p className="text-xs text-muted-foreground">You can send more messages once your request is accepted</p>
        </div>
      ) : isRejected ? (
        <div className="bg-muted/30 border-t border-border px-4 py-3 text-center shrink-0" style={{ paddingBottom: "max(0.75rem, var(--safe-bottom))" }}>
          <p className="text-xs text-muted-foreground">You can no longer send messages in this conversation</p>
        </div>
      ) : null}

      {showGift && otherId && (
        <ChatGiftModal
          open={showGift}
          onClose={() => setShowGift(false)}
          conversationId={conversationId!}
          recipientId={otherId}
          recipientName={otherName}
        />
      )}

      {showShare && (
        <ChatSharePicker
          open={showShare}
          onClose={() => setShowShare(false)}
          onShare={handleShareLink}
        />
      )}
    </div>
  );
};

export default ChatView;
