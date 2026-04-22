import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { useQuery } from "@tanstack/react-query";
import { Phone, PhoneOff } from "lucide-react";
import { toast } from "sonner";
import { playRingtone } from "@/lib/sounds";

const VoiceCallOverlay = lazy(() => import("./VoiceCallOverlay"));

interface IncomingCall {
  id: string;
  conversation_id: string;
  caller_id: string;
  room_name: string;
  callerName: string;
  callerAvatar?: string;
}

interface NativeCallPayload {
  callId?: string;
  conversationId?: string;
  callerId?: string;
  callerName?: string;
  callerAvatar?: string;
  action?: "accept" | "decline";
}

interface ActiveCallState {
  callId: string;
  conversationId: string;
  token: string;
  url: string;
  room: string;
  passphrase: string;
  otherName: string;
  otherAvatar?: string;
  isOutgoing: boolean;
  startWithVideo?: boolean;
}

const ACTIVE_CALL_STORAGE_KEY = "dm-active-call";

const IncomingCallBanner = () => {
  const { user } = useAuth();
  const { isFeatureEnabled } = useFeatureToggles();
  const navigate = useNavigate();
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const [answering, setAnswering] = useState(false);
  const [callMinimized, setCallMinimized] = useState(false);
  const stopRingtoneRef = useRef<(() => void) | null>(null);

  // On mount, check for a stored active call — but DON'T restore it.
  // Restored tokens are almost certainly expired, leading to silent failures.
  // Instead, just clear the stale session data.
  useEffect(() => {
    try {
      window.sessionStorage.removeItem(ACTIVE_CALL_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      if (!activeCall) {
        window.sessionStorage.removeItem(ACTIVE_CALL_STORAGE_KEY);
        return;
      }
      window.sessionStorage.setItem(
        ACTIVE_CALL_STORAGE_KEY,
        JSON.stringify({ activeCall, callMinimized })
      );
    } catch {
      // ignore persistence issues
    }
  }, [activeCall, callMinimized]);

  // Play ringtone when incoming call appears
  useEffect(() => {
    let vibrateInterval: ReturnType<typeof setInterval> | null = null;
    if (incomingCall && !activeCall) {
      stopRingtoneRef.current = playRingtone();
      // Vibrate pattern: 500ms on, 500ms off, repeating
      if (navigator.vibrate) {
        navigator.vibrate([500, 500, 500, 500, 500]);
        vibrateInterval = setInterval(() => {
          navigator.vibrate([500, 500, 500, 500, 500]);
        }, 3000);
      }
    } else {
      if (stopRingtoneRef.current) { stopRingtoneRef.current(); stopRingtoneRef.current = null; }
      if (navigator.vibrate) navigator.vibrate(0);
    }
    return () => {
      if (stopRingtoneRef.current) { stopRingtoneRef.current(); stopRingtoneRef.current = null; }
      if (vibrateInterval) clearInterval(vibrateInterval);
      if (navigator.vibrate) navigator.vibrate(0);
    };
  }, [incomingCall, activeCall]);

  // Subscribe to new incoming calls
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("incoming-calls")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dm_calls",
          filter: `callee_id=eq.${user.id}`,
        },
        async (payload: any) => {
          const call = payload.new;
          if (call.status !== "ringing") return;

          // Fetch caller profile
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name, avatar_url")
            .eq("id", call.caller_id)
            .maybeSingle();

          setIncomingCall({
            id: call.id,
            conversation_id: call.conversation_id,
            caller_id: call.caller_id,
            room_name: call.room_name,
            callerName: profile?.display_name || "Unknown",
            callerAvatar: profile?.avatar_url || undefined,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Listen for call status changes (e.g., caller cancels) + auto-dismiss after 90s
  useEffect(() => {
    if (!incomingCall) return;

    // Auto-dismiss after 90 seconds (matches caller's auto-cancel timeout)
    const dismissTimer = setTimeout(() => {
      setIncomingCall(null);
    }, 90_000);

    const channel = supabase
      .channel(`incoming-call-status-${incomingCall.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dm_calls",
          filter: `id=eq.${incomingCall.id}`,
        },
        (payload: any) => {
          const newStatus = payload.new?.status;
          if (newStatus === "missed" || newStatus === "ended" || newStatus === "declined") {
            setIncomingCall(null);
          }
        }
      )
      .subscribe();

    return () => {
      clearTimeout(dismissTimer);
      supabase.removeChannel(channel);
    };
  }, [incomingCall?.id]);

  const answerCallById = useCallback(async (params: {
    callId: string;
    conversationId?: string;
    callerName?: string;
    callerAvatar?: string;
  }) => {
    const { callId } = params;
    const { data, error } = await supabase.functions.invoke("dm-call-token", {
      body: { action: "answer", call_id: callId },
    });
    if (error || data?.error) throw new Error(data?.error || "Failed to answer");

    let conversationId = params.conversationId;
    let callerName = params.callerName || "Unknown";
    let callerAvatar = params.callerAvatar;

    if (!conversationId) {
      const { data: callRow } = await supabase
        .from("dm_calls")
        .select("conversation_id, caller_id")
        .eq("id", callId)
        .maybeSingle();
      conversationId = callRow?.conversation_id;

      if (callRow?.caller_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("id", callRow.caller_id)
          .maybeSingle();
        callerName = profile?.display_name || callerName;
        callerAvatar = profile?.avatar_url || callerAvatar;
      }
    }

    if (!conversationId) throw new Error("Missing conversation id for call");

    setActiveCall({
      callId,
      conversationId,
      token: data.token,
      url: data.url,
      room: data.room,
      passphrase: data.e2ee_passphrase,
      otherName: callerName,
      otherAvatar: callerAvatar,
      isOutgoing: false,
    });
    setIncomingCall(null);
    setCallMinimized(false);
  }, []);

  const handleAnswer = useCallback(async () => {
    if (!incomingCall || answering) return;
    setAnswering(true);
    // Kill ringtone immediately — don't wait for async answer flow
    if (stopRingtoneRef.current) { stopRingtoneRef.current(); stopRingtoneRef.current = null; }
    if (navigator.vibrate) navigator.vibrate(0);

    try {
      await answerCallById({
        callId: incomingCall.id,
        conversationId: incomingCall.conversation_id,
        callerName: incomingCall.callerName,
        callerAvatar: incomingCall.callerAvatar,
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to answer call");
    } finally {
      setAnswering(false);
    }
  }, [incomingCall, answering, answerCallById]);

  // Auto-accept when arriving via the Android lockscreen deep link
  // (?auto_accept=1&call_id=…). Fires once the realtime subscription has
  // populated `incomingCall` and the caller matches.
  useEffect(() => {
    if (!incomingCall || activeCall || answering) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("auto_accept") !== "1") return;
    const targetId = params.get("call_id");
    if (targetId && targetId !== incomingCall.id) return;
    // Clean the query so a back/forward doesn't re-trigger.
    const url = new URL(window.location.href);
    url.searchParams.delete("auto_accept");
    url.searchParams.delete("call_id");
    window.history.replaceState({}, "", url.toString());
    handleAnswer();
  }, [incomingCall, activeCall, answering, handleAnswer]);

  const handleDecline = useCallback(async () => {
    if (!incomingCall) return;

    try {
      await supabase.functions.invoke("dm-call-token", {
        body: { action: "decline", call_id: incomingCall.id },
      });
    } catch { /* ignore */ }

    setIncomingCall(null);
  }, [incomingCall]);

  // Expose a way for ChatView to start an outgoing call
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      setCallMinimized(false);
      setActiveCall(e.detail);
    };
    window.addEventListener("start-voice-call" as any, handler);
    return () => window.removeEventListener("start-voice-call" as any, handler);
  }, []);

  useEffect(() => {
    const onNativeIncoming = (event: Event) => {
      const detail = (event as CustomEvent<NativeCallPayload>).detail;
      if (!detail?.callId) return;
      setIncomingCall({
        id: detail.callId,
        conversation_id: detail.conversationId || "",
        caller_id: detail.callerId || "",
        room_name: "",
        callerName: detail.callerName || "Unknown",
        callerAvatar: detail.callerAvatar,
      });
    };

    const onNativeAction = async (event: Event) => {
      const detail = (event as CustomEvent<NativeCallPayload>).detail;
      if (!detail?.callId || !detail?.action) return;

      if (detail.action === "decline") {
        try {
          await supabase.functions.invoke("dm-call-token", {
            body: { action: "decline", call_id: detail.callId },
          });
        } catch {
          // ignore
        }
        setIncomingCall(null);
        return;
      }

      setAnswering(true);
      try {
        await answerCallById({
          callId: detail.callId,
          conversationId: detail.conversationId,
          callerName: detail.callerName,
          callerAvatar: detail.callerAvatar,
        });
      } catch (err: any) {
        toast.error(err.message || "Failed to answer call");
      } finally {
        setAnswering(false);
      }
    };

    window.addEventListener("native-incoming-call", onNativeIncoming);
    window.addEventListener("native-call-action", onNativeAction);
    return () => {
      window.removeEventListener("native-incoming-call", onNativeIncoming);
      window.removeEventListener("native-call-action", onNativeAction);
    };
  }, [answerCallById]);

  if (!isFeatureEnabled("voice_calls")) return null;

  return (
    <>
      {/* Incoming call banner */}
      {incomingCall && !activeCall && (
        <div className="fixed top-0 left-0 right-0 z-[9998] bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3 animate-in slide-in-from-top" style={{ paddingTop: "max(0.75rem, var(--safe-top))" }}>
          <div
            className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
            onClick={() => navigate(`/messages/${incomingCall.conversation_id}`)}
          >
            <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center overflow-hidden shrink-0">
              {incomingCall.callerAvatar ? (
                <img src={incomingCall.callerAvatar} className="w-full h-full object-cover" alt="" />
              ) : (
                <span className="text-sm font-bold">{incomingCall.callerName.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{incomingCall.callerName}</p>
              <p className="text-xs opacity-80">Incoming voice call · Tap to open</p>
            </div>
          </div>
          <button
            onClick={handleDecline}
            className="w-10 h-10 rounded-full bg-destructive flex items-center justify-center shrink-0 active:scale-95 transition-transform"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
          <button
            onClick={handleAnswer}
            disabled={answering}
            className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 active:scale-95 transition-transform"
          >
            <Phone className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Active call overlay */}
      {activeCall && (
        <Suspense fallback={null}>
          <VoiceCallOverlay
            callId={activeCall.callId}
            conversationId={activeCall.conversationId}
            token={activeCall.token}
            livekitUrl={activeCall.url}
            roomName={activeCall.room}
            e2eePassphrase={activeCall.passphrase}
            isOutgoing={activeCall.isOutgoing}
            otherUserName={activeCall.otherName}
            otherUserAvatar={activeCall.otherAvatar}
            startWithVideo={activeCall.startWithVideo}
            minimized={callMinimized}
            onMinimize={() => setCallMinimized(true)}
            onMaximize={() => setCallMinimized(false)}
            onClose={() => { setActiveCall(null); setCallMinimized(false); }}
          />
        </Suspense>
      )}
    </>
  );
};

export default IncomingCallBanner;
