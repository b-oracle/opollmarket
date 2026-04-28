import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { useQuery } from "@tanstack/react-query";
import { Phone, PhoneOff } from "lucide-react";
import { toast } from "sonner";
import { playRingtone } from "@/lib/sounds";
import {
  startIncomingCallVibration,
  stopVibration,
  vibrate,
  CALL_CONNECTED_PATTERN,
  CALL_ENDED_PATTERN,
} from "@/lib/haptics";
import { logCallEvent } from "@/lib/callEvents";
import { ensureMicrophonePermission } from "@/lib/mediaPermissions";

const VoiceCallOverlay = lazy(() => import("./VoiceCallOverlay"));

interface IncomingCall {
  id: string;
  conversation_id: string;
  caller_id: string;
  room_name: string;
  callerName: string;
  callerAvatar?: string;
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

  // Play ringtone + run the call vibration pattern when the banner appears.
  // The pattern fires an initial attention buzz, then loops a WhatsApp-style
  // ring cadence (1s on / 0.5s off / 1s on / 1.5s off). Works on Capacitor
  // native (Android/iOS via Haptics.vibrate) and web (navigator.vibrate).
  // Also tells useNativePush to stop its own foreground-FCM ring loop so we
  // don't double-buzz when the FCM data push and the realtime INSERT both
  // arrive (which is normal — push is the wake-up, realtime is the payload).
  useEffect(() => {
    let cancelVibration: (() => void) | null = null;
    if (incomingCall && !activeCall) {
      // Silence the FCM-driven foreground ring; the banner now owns vibration.
      try { window.dispatchEvent(new Event("dm-call-banner-dismissed")); } catch {}
      stopRingtoneRef.current = playRingtone();
      cancelVibration = startIncomingCallVibration();
    } else {
      if (stopRingtoneRef.current) { stopRingtoneRef.current(); stopRingtoneRef.current = null; }
      stopVibration();
    }
    return () => {
      if (stopRingtoneRef.current) { stopRingtoneRef.current(); stopRingtoneRef.current = null; }
      cancelVibration?.();
      stopVibration();
      // Notify the hook one more time so any leftover loop is cancelled.
      try { window.dispatchEvent(new Event("dm-call-banner-dismissed")); } catch {}
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
          logCallEvent(call.id, "received", { source: "realtime" });
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
      logCallEvent(incomingCall.id, "missed", { reason: "auto_dismiss_90s" });
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

  const handleAnswer = useCallback(async () => {
    if (!incomingCall || answering) return;
    setAnswering(true);
    // Kill ringtone immediately — don't wait for async answer flow
    if (stopRingtoneRef.current) { stopRingtoneRef.current(); stopRingtoneRef.current = null; }
    stopVibration();
    // Soft buzz to acknowledge the answer tap
    void vibrate(CALL_CONNECTED_PATTERN);

    try {
      const mic = await ensureMicrophonePermission();
      if (mic.ok === false) {
        logCallEvent(incomingCall.id, "failed", { stage: "mic_permission_preflight", reason: mic.reason, error_name: mic.errorName, error: mic.errorMessage });
        toast.error(mic.title, { description: mic.description });
        return;
      }
      logCallEvent(incomingCall.id, "accepted", { via: "banner_tap" });
      const { data, error } = await supabase.functions.invoke("dm-call-token", {
        body: { action: "answer", call_id: incomingCall.id },
      });

      if (error || data?.error) throw new Error(data?.error || "Failed to answer");

      setActiveCall({
        callId: incomingCall.id,
        conversationId: incomingCall.conversation_id,
        token: data.token,
        url: data.url,
        room: data.room,
        passphrase: data.e2ee_passphrase,
        otherName: incomingCall.callerName,
        otherAvatar: incomingCall.callerAvatar,
        isOutgoing: false,
      });
      setIncomingCall(null);
    } catch (err: any) {
      logCallEvent(incomingCall.id, "failed", { stage: "answer", error: err?.message });
      toast.error(err.message || "Failed to answer call");
    } finally {
      setAnswering(false);
    }
  }, [incomingCall, answering]);

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

    // Decisive buzz to confirm the decline action
    stopVibration();
    void vibrate(CALL_ENDED_PATTERN);

    try {
      logCallEvent(incomingCall.id, "declined", { via: "banner_tap" });
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

  // Cross-surface call action events (fired by useCallDeepLink when the user
  // taps Accept/Decline on the native lockscreen notification). Lets the
  // banner dismiss instantly without waiting on realtime.
  useEffect(() => {
    const onAction = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action?: string; call_id?: string } | undefined;
      if (!detail) return;
      if (detail.action === "decline" || detail.action === "missed" || detail.action === "ended") {
        // Only clear if the event matches the current call (or no id supplied).
        if (!detail.call_id || !incomingCall || detail.call_id === incomingCall.id) {
          setIncomingCall(null);
        }
      }
    };
    window.addEventListener("dm-call-action", onAction);
    return () => window.removeEventListener("dm-call-action", onAction);
  }, [incomingCall]);

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
