import { useState, useEffect, useRef, useCallback } from "react";
import ChatDoodleBackground from "./ChatDoodleBackground";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { ArrowLeft, Send, Gift, Loader2, Share2, Check, X, Phone, PhoneMissed, Video, WifiOff } from "lucide-react";
import NftBadge, { type VerificationLevel } from "@/components/NftBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ChatGiftModal from "./ChatGiftModal";
import ChatMessageBubble from "./ChatMessageBubble";
import ChatSharePicker from "./ChatSharePicker";
import SEOHead from "@/components/SEOHead";
import { toast } from "sonner";
import { logCallEvent } from "@/lib/callEvents";
import { stripCallDeepLinkParams } from "@/lib/callDeepLinkUrl";
import {
  getCachedCallConversation,
  dedupeCallConversationLookup,
} from "@/lib/dmCallLookupCache";

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
  // Persisted in sessionStorage (keyed by conversation id) so the banner
  // survives navigation away and back to the chat view — without this, the
  // user loses all visibility into a still-pending or failed reconnect the
  // moment they tap the back button or open another tab.
  const rejoinStorageKey = paramId ? `dm-rejoin-status:${paramId}` : null;
  const [rejoinStatus, setRejoinStatus] = useState<null | "reconnecting" | "failed">(() => {
    if (!rejoinStorageKey) return null;
    try {
      const raw = window.sessionStorage.getItem(rejoinStorageKey);
      if (raw === "reconnecting" || raw === "failed") return raw;
    } catch { /* ignore */ }
    return null;
  });
  // Holds the call_id from the last failed auto-accept attempt so the
  // "Try again" affordance (banner button + toast action) can re-invoke it.
  // Also persisted alongside rejoinStatus so "Try again" still works after
  // returning to the page.
  const lastFailedCallIdKey = paramId ? `dm-rejoin-failed-call:${paramId}` : null;
  const lastFailedCallIdRef = useRef<string | null>((() => {
    if (!lastFailedCallIdKey) return null;
    try {
      return window.sessionStorage.getItem(lastFailedCallIdKey);
    } catch { return null; }
  })());

  // Mirror rejoinStatus + last failed call id to sessionStorage so they
  // survive remounts. Cleared when status returns to idle.
  useEffect(() => {
    if (!rejoinStorageKey) return;
    try {
      if (rejoinStatus) {
        window.sessionStorage.setItem(rejoinStorageKey, rejoinStatus);
      } else {
        window.sessionStorage.removeItem(rejoinStorageKey);
        if (lastFailedCallIdKey) window.sessionStorage.removeItem(lastFailedCallIdKey);
      }
    } catch { /* ignore quota / privacy mode */ }
  }, [rejoinStatus, rejoinStorageKey, lastFailedCallIdKey]);

  // ── Missed-call banner ────────────────────────────────────────────────
  // When a missed-call notification deep-links us into the thread it adds
  // `?missed_call_id=<id>` to the URL. We surface a slim banner offering
  // "Call back" and "Open thread" until the user dismisses it. Dismissal
  // is persisted per call_id in sessionStorage so we don't keep re-showing
  // the banner if the user navigates away and returns.
  // Accept either deep-link param. We validate them below — if the id is
  // malformed, references a different conversation, or is expired we just
  // strip it from the URL and continue rendering the chat normally.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const rawMissedCallId = searchParams.get("missed_call_id");
  const rawIncomingCallId = searchParams.get("incoming_call_id");
  const isValidUuid = (v: string | null): v is string => !!v && UUID_RE.test(v);

  // Track ids that have been validated (or rejected) so the banner & scroll
  // effects only fire for known-good calls. `null` until validated.
  const [validatedMissedCallId, setValidatedMissedCallId] = useState<string | null>(null);
  const missedCallId = validatedMissedCallId;
  const missedDismissKey = missedCallId ? `dm-missed-dismissed:${missedCallId}` : null;
  const [missedDismissed, setMissedDismissed] = useState<boolean>(() => {
    if (!missedDismissKey) return false;
    try { return window.sessionStorage.getItem(missedDismissKey) === "1"; }
    catch { return false; }
  });
  useEffect(() => {
    // Reset dismissal state whenever the deep link points at a new call.
    if (!missedDismissKey) { setMissedDismissed(false); return; }
    try {
      setMissedDismissed(window.sessionStorage.getItem(missedDismissKey) === "1");
    } catch { setMissedDismissed(false); }
  }, [missedDismissKey]);

  const dismissMissedBanner = useCallback(() => {
    if (missedDismissKey) {
      try { window.sessionStorage.setItem(missedDismissKey, "1"); } catch { /* ignore */ }
    }
    setMissedDismissed(true);
    // Strip the param so a refresh doesn't re-show the banner either.
    const next = new URLSearchParams(searchParams);
    next.delete("missed_call_id");
    setSearchParams(next, { replace: true });
  }, [missedDismissKey, searchParams, setSearchParams]);

  // (Deep-link call-id validation effect lives below, after `conversationId`
  // is resolved — see the block right after `const conversationId = ...`.)

  // Track which missed_call_id we've already scrolled to so message-list
  // updates / refetches don't re-trigger the highlight repeatedly.
  const scrolledMissedCallRef = useRef<string | null>(null);

  // Absolute deadline (epoch ms) for the current auto-rejoin attempt — set
  // when the retry loop kicks off, used to drive a live countdown in the
  // banner. Null when there is no active attempt. We store the deadline (not
  // the seconds remaining) so the visible value stays accurate even if the
  // browser throttles our 1s tick (e.g., backgrounded tab).
  const [rejoinDeadlineAt, setRejoinDeadlineAt] = useState<number | null>(null);
  const [rejoinSecondsLeft, setRejoinSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (rejoinStatus !== "reconnecting" || !rejoinDeadlineAt) {
      setRejoinSecondsLeft(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((rejoinDeadlineAt - Date.now()) / 1000));
      setRejoinSecondsLeft(remaining);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [rejoinStatus, rejoinDeadlineAt]);

  // Clear the countdown deadline as soon as we leave the reconnecting state.
  useEffect(() => {
    if (rejoinStatus !== "reconnecting") setRejoinDeadlineAt(null);
  }, [rejoinStatus]);


  // Helper to update the failed-call ref AND its persisted mirror together.
  const setLastFailedCallId = useCallback((id: string | null) => {
    lastFailedCallIdRef.current = id;
    if (!lastFailedCallIdKey) return;
    try {
      if (id) window.sessionStorage.setItem(lastFailedCallIdKey, id);
      else window.sessionStorage.removeItem(lastFailedCallIdKey);
    } catch { /* ignore */ }
  }, [lastFailedCallIdKey]);

  // Track network connectivity so the rejoin banner can show a more accurate
  // "Offline — waiting for network" state instead of a misleading "Reconnecting…"
  // spinner when the device has no connection. We only check navigator.onLine
  // once on mount and then react to online/offline events — `navigator.onLine`
  // can lie (says online when captive portal blocks traffic) but it's the best
  // signal available without a probe request.
  const [isOffline, setIsOffline] = useState<boolean>(() => {
    if (typeof navigator === "undefined") return false;
    return navigator.onLine === false;
  });
  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);


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

  // Validate deep-link call ids. Strips bad params from the URL so the chat
  // still opens cleanly to the conversation. Considered invalid when:
  //   • missing / malformed UUID
  //   • call row not found (deleted / wrong project)
  //   • call belongs to a different conversation than the one we're viewing
  //   • call is "expired": older than 24h (any status) — past that point a
  //     "Call back" CTA is more noise than signal.
  //   • for incoming_call_id: status is no longer "ringing" (already
  //     answered/declined/missed elsewhere)
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;

    const stripParams = (keys: string[]) => {
      const next = new URLSearchParams(searchParams);
      let changed = false;
      for (const k of keys) {
        if (next.has(k)) { next.delete(k); changed = true; }
      }
      if (changed) setSearchParams(next, { replace: true });
    };

    const validate = async (id: string | null, kind: "missed" | "incoming"): Promise<string | null> => {
      if (!id) return null;
      if (!isValidUuid(id)) return null;
      try {
        const { data, error } = await supabase
          .from("dm_calls")
          .select("id, conversation_id, created_at, ended_at, status")
          .eq("id", id)
          .maybeSingle();
        if (error || !data) return null;
        if (data.conversation_id !== conversationId) return null;
        const refTs = (data as any).ended_at || (data as any).created_at;
        if (refTs) {
          const ageMs = Date.now() - new Date(refTs).getTime();
          if (ageMs > 24 * 60 * 60 * 1000) return null; // expired
        }
        if (kind === "incoming" && data.status && data.status !== "ringing") {
          return null;
        }
        return id;
      } catch {
        return null;
      }
    };

    (async () => {
      const [missedOk, incomingOk] = await Promise.all([
        validate(rawMissedCallId, "missed"),
        validate(rawIncomingCallId, "incoming"),
      ]);
      if (cancelled) return;
      setValidatedMissedCallId(missedOk);
      const toStrip: string[] = [];
      if (rawMissedCallId && !missedOk) toStrip.push("missed_call_id");
      if (rawIncomingCallId && !incomingOk) toStrip.push("incoming_call_id");
      if (toStrip.length) stripParams(toStrip);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawMissedCallId, rawIncomingCallId, conversationId]);

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

  // Deep-link: when arriving via `?missed_call_id=<id>` look up the call's
  // `ended_at` timestamp, then find the matching `[CALL:missed:0]` system
  // message (sent by the caller within a few seconds of `ended_at`) and
  // scroll/highlight it. Runs once per call_id and waits until both the
  // messages list and the call row are available.
  useEffect(() => {
    if (!missedCallId || !conversationId) return;
    if (scrolledMissedCallRef.current === missedCallId) return;
    if (!messages || messages.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const { data: callRow, error } = await supabase
          .from("dm_calls")
          .select("ended_at, caller_id, conversation_id, status")
          .eq("id", missedCallId)
          .maybeSingle();
        if (cancelled || error || !callRow) return;
        if (callRow.conversation_id !== conversationId) return;

        const endedAtMs = callRow.ended_at ? new Date(callRow.ended_at).getTime() : null;
        // Find the closest [CALL:missed:*] message from the caller.
        // dm_messages.created_at is written in the same RPC call that flips
        // the status, so the gap is < ~2s in practice. Use a 60s window to
        // be safe against clock skew.
        const candidates = messages.filter(
          (m) =>
            m.sender_id === callRow.caller_id &&
            typeof m.content === "string" &&
            /^\[CALL:missed:/.test(m.content),
        );
        if (candidates.length === 0) return;

        let target = candidates[candidates.length - 1];
        if (endedAtMs != null) {
          let bestDelta = Number.POSITIVE_INFINITY;
          for (const m of candidates) {
            const delta = Math.abs(new Date(m.created_at).getTime() - endedAtMs);
            if (delta < bestDelta) {
              bestDelta = delta;
              target = m;
            }
          }
          // Reject obviously unrelated matches.
          if (bestDelta > 60_000) return;
        }

        scrolledMissedCallRef.current = missedCallId;
        // Defer to next tick so the bubble is mounted by the time we scroll.
        requestAnimationFrame(() => {
          if (cancelled) return;
          handleScrollToMessage(target.id);
        });
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [missedCallId, conversationId, messages, handleScrollToMessage]);

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

  // Re-arms the auto-accept retry loop after a failure. Resets the dedupe
  // ref so the effect below re-enters, then re-adds auto_accept + call_id
  // to the URL (preserving any other params) so the same flow runs again.
  const retryAutoAccept = useCallback(
    (callId: string) => {
      if (!callId) return;
      autoAcceptedRef.current = null;
      setLastFailedCallId(null);
      setRejoinStatus("reconnecting");
      // 15s matches HARD_TIMEOUT_MS in the auto-accept effect below.
      setRejoinDeadlineAt(Date.now() + 15_000);
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set("auto_accept", "1");
          next.set("call_id", callId);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams, setLastFailedCallId],
  );

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
    // Cached server-side conversation_id for this callId. We refuse to
    // auto-join until the loaded conversationId matches this value, so a
    // race where another conversation finishes loading first can't pull
    // the user into the wrong thread.
    let expectedConvoId: string | null = null;
    let lookupInFlight = false;
    let lookupFailed = false;

    const stripCallParams = () => {
      // Use the functional form so we merge against the LATEST params,
      // not the snapshot captured when the effect ran. This preserves any
      // utm_*, ref, or other params that may have been added meanwhile.
      setSearchParams(
        (current) => stripCallDeepLinkParams(current),
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

    const failWithToast = (reason: "attempts" | "timeout" | "mismatch" | "lookup") => {
      autoAcceptedRef.current = null;
      setLastFailedCallId(callId);
      setRejoinStatus("failed");
      const description =
        reason === "timeout"
          ? "Took too long to load the conversation."
          : reason === "mismatch"
          ? "This call belongs to a different conversation."
          : reason === "lookup"
          ? "Couldn't verify the call. Please try again."
          : "We tried a few times but couldn't join.";
      toast.error("Couldn't reconnect to the call", {
        description,
        action: {
          label: "Try again",
          onClick: () => retryAutoAccept(callId),
        },
      });
    };

    const ensureLookup = () => {
      if (expectedConvoId || lookupFailed || lookupInFlight) return;

      // Fast path: in-memory / localStorage cache from a prior lookup.
      const cached = getCachedCallConversation(callId);
      if (cached) {
        expectedConvoId = cached;
        return;
      }

      // Slow path: route through the module-level dedupe registry so that
      // concurrent ensureLookup callers (rapid retry clicks, overlapping
      // poll ticks, multiple mounted ChatView instances) share ONE supabase
      // query for the same call_id instead of stampeding the database.
      lookupInFlight = true;
      dedupeCallConversationLookup(callId, async () => {
        const { data, error } = await supabase
          .from("dm_calls" as any)
          .select("conversation_id")
          .eq("id", callId)
          .maybeSingle() as any;
        if (error) {
          console.warn("auto_accept: call lookup failed", error);
          return null;
        }
        return (data?.conversation_id as string | undefined) ?? null;
      })
        .then((conversationId) => {
          lookupInFlight = false;
          if (done) return;
          if (!conversationId) {
            lookupFailed = true;
            failWithToast("lookup");
            stop({ strip: true });
            return;
          }
          expectedConvoId = conversationId;
        })
        .catch((err) => {
          lookupInFlight = false;
          if (done) return;
          lookupFailed = true;
          console.warn("auto_accept: call lookup threw", err);
          failWithToast("lookup");
          stop({ strip: true });
        });
    };

    const tryAccept = () => {
      if (done) return;
      attempts += 1;
      ensureLookup();
      // Only join when (a) we know which conversation the call belongs to,
      // (b) the currently-loaded conversation matches it, and (c) convo data
      // is ready. This prevents a misroute if a different convo loads first.
      if (
        expectedConvoId &&
        conversationId === expectedConvoId &&
        user &&
        convo &&
        (convo as any).id === expectedConvoId
      ) {
        setRejoinStatus(null);
        setLastFailedCallId(null);
        handleRejoinCall(callId, false);
        stop({ strip: true });
        return;
      }
      // If we've resolved a conversation but it's the wrong one, fail fast
      // — polling won't change which thread the user opened.
      if (expectedConvoId && conversationId && conversationId !== expectedConvoId) {
        console.warn("auto_accept: conversation mismatch", { conversationId, expectedConvoId });
        failWithToast("mismatch");
        stop({ strip: true });
        return;
      }
      // Surface the reconnecting banner once we've waited at least one tick
      // — avoids a flash for the common case where everything is ready on the
      // first synchronous attempt.
      setRejoinStatus("reconnecting");
      // Set/refresh the deadline used by the countdown banner. We anchor it
      // once at first surfacing so the displayed seconds tick down smoothly.
      setRejoinDeadlineAt((prev) => prev ?? Date.now() + HARD_TIMEOUT_MS);
      if (attempts >= MAX_ATTEMPTS) {
        console.warn("auto_accept: gave up after", attempts, "attempts");
        failWithToast("attempts");
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
          failWithToast("timeout");
        }
        stop({ strip: true });
      }, HARD_TIMEOUT_MS);
    }

    // Cleanup on unmount / dependency change.
    //
    // "Deep link handling cancelled" path: if the user leaves the page (or this
    // effect re-runs) BEFORE the join attempt resolves, we must:
    //   1. Stop pending timers so no late join fires against a stale conversation.
    //   2. Preserve auto_accept + call_id in the URL untouched, so navigating
    //      back (or the next mount) re-enters this effect and retries the join.
    //   3. Reset autoAcceptedRef for this callId so the early-return guard
    //      doesn't permanently swallow the intent on remount.
    //   4. Clear any "reconnecting" banner state — the cancelled attempt is
    //      no longer in flight and showing a stale spinner is misleading.
    return () => {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      if (!done) {
        // Attempt was cancelled mid-flight (unmount / nav / dep change).
        console.info("auto_accept: deep link handling cancelled, preserving params", { callId });
        if (autoAcceptedRef.current === callId) {
          autoAcceptedRef.current = null;
        }
        setRejoinStatus((prev) => (prev === "reconnecting" ? null : prev));
      }
    };
  }, [conversationId, user, convo, searchParams, setSearchParams, handleRejoinCall, retryAutoAccept]);



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

      {/* Auto-rejoin status banner — shown while we wait for conversation
          data to load before joining a call from a native deep link.
          Uses semantic tokens so it adapts to light/dark themes. */}
      {rejoinStatus === "reconnecting" && (
        <div
          role="status"
          aria-live="polite"
          className={`shrink-0 border-b px-4 py-2 flex items-center gap-2 ${
            isOffline
              ? "bg-warning/10 border-warning/20"
              : "bg-primary/10 border-primary/20"
          }`}
        >
          {isOffline ? (
            <WifiOff className="w-4 h-4 text-warning shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
          )}
          <p className="text-xs text-foreground flex-1">
            {isOffline
              ? "Offline — waiting for network…"
              : rejoinSecondsLeft != null && rejoinSecondsLeft > 0
                ? `Reconnecting… ${rejoinSecondsLeft}s`
                : "Reconnecting call…"}
          </p>
        </div>
      )}
      {rejoinStatus === "failed" && (
        <div
          role="status"
          aria-live="polite"
          className="shrink-0 bg-destructive/10 border-b border-destructive/20 px-4 py-2 flex items-center gap-2"
        >
          <X className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-xs text-foreground flex-1">
            Couldn't reconnect to the call.
          </p>
          {/* Primary action: re-run the auto-join retry loop. We always render
              this button (even if we've lost the call_id from a previous
              session), but disable it when there's nothing to retry so the
              user still gets a clear, consistent affordance instead of the
              banner silently having no actionable path. */}
          <button
            onClick={() => {
              const id = lastFailedCallIdRef.current;
              if (id) retryAutoAccept(id);
            }}
            disabled={!lastFailedCallIdRef.current}
            className="text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 px-3 py-1 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Try reconnecting
          </button>
          <button
            onClick={() => {
              setLastFailedCallId(null);
              setRejoinStatus(null);
            }}
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted/40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Missed-call banner — shown when the user deep-links into the
          conversation from a missed-call notification. Offers a quick
          "Call back" action and an "Open thread" action that just dismisses
          the banner so they can read the conversation. */}
      {missedCallId && !missedDismissed && (
        <div
          role="status"
          aria-live="polite"
          className="shrink-0 bg-destructive/10 border-b border-destructive/20 px-4 py-2 flex items-center gap-2"
        >
          <PhoneMissed className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-xs text-foreground flex-1 truncate">
            You missed a call from {otherName || "this contact"}.
          </p>
          <button
            onClick={() => {
              dismissMissedBanner();
              handleStartCall(false);
            }}
            disabled={calling}
            className="text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 px-3 py-1 rounded-md disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
          >
            {calling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Phone className="w-3 h-3" />}
            Call back
          </button>
          <button
            onClick={dismissMissedBanner}
            className="text-xs font-semibold text-foreground bg-muted hover:bg-muted/80 px-3 py-1 rounded-md"
          >
            Open thread
          </button>
          <button
            onClick={dismissMissedBanner}
            aria-label="Dismiss"
            className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted/40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pending request banner for recipient */}
      {isRecipientOfRequest && (
        <div className="shrink-0 bg-warning/10 border-b border-warning/20 px-4 py-3 flex items-center gap-3">
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
