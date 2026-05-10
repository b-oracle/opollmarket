import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
import { readLatestCall, readCallerProfile, saveCallerProfile } from "@/hooks/useNativePush";
import { dismissCallNotifications } from "@/lib/callNotifications";

const VoiceCallOverlay = lazy(() => import("./VoiceCallOverlay"));
import IncomingCallScreen from "./IncomingCallScreen";

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
  const location = useLocation();
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const [answering, setAnswering] = useState(false);
  const [callMinimized, setCallMinimized] = useState(false);
  const [autoAcceptTick, setAutoAcceptTick] = useState(0);
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

  // Safety net: any time the route changes while there's no incoming or
  // active call (e.g. user navigated away from the call screen), make sure
  // no stale incoming-call notification is left in the tray.
  useEffect(() => {
    if (incomingCall || activeCall) return;
    void dismissCallNotifications(`route-change:${location.pathname}`);
  }, [location.pathname, incomingCall, activeCall]);

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

          const cached = readLatestCall();
          const cachedMatches = cached && cached.call_id === call.id;

          setIncomingCall({
            id: call.id,
            conversation_id: call.conversation_id,
            caller_id: call.caller_id,
            room_name: call.room_name,
            callerName:
              profile?.display_name ||
              (cachedMatches ? cached?.caller_name : undefined) ||
              "Unknown",
            callerAvatar:
              profile?.avatar_url ||
              (cachedMatches ? cached?.caller_avatar : undefined) ||
              undefined,
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
      void dismissCallNotifications("auto-dismiss-90s");
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
            void dismissCallNotifications(`status-${newStatus}`);
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
      void dismissCallNotifications("banner-accept");
    } catch (err: any) {
      logCallEvent(incomingCall.id, "failed", { stage: "answer", error: err?.message });
      toast.error(err.message || "Failed to answer call");
    } finally {
      setAnswering(false);
    }
  }, [incomingCall, answering]);

  // Auto-accept when arriving via the Android lockscreen deep link OR via
  // the web push notification "Accept" action (?auto_accept=1&call_id=…).
  //
  // We do NOT depend on the realtime INSERT having arrived first — when the
  // user accepts from the lockscreen, the realtime subscription is often
  // mounted milliseconds AFTER the deep link runs (or the row was already
  // delivered to a different tab). Instead we hydrate `incomingCall`
  // directly from the DB so the overlay can mount immediately.
  useEffect(() => {
    if (activeCall || answering) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("auto_accept") !== "1") return;
    const targetId = params.get("call_id");
    if (!targetId) return;
    if (incomingCall && incomingCall.id !== targetId) return;

    let cancelled = false;
    (async () => {
      // If realtime already populated incomingCall for this id, just answer.
      if (incomingCall && incomingCall.id === targetId) {
        const url = new URL(window.location.href);
        url.searchParams.delete("auto_accept");
        url.searchParams.delete("call_id");
        window.history.replaceState({}, "", url.toString());
        handleAnswer();
        return;
      }
      // Otherwise hydrate directly from the DB.
      const { data: call } = await supabase
        .from("dm_calls")
        .select("id, conversation_id, caller_id, room_name, status, callee_id")
        .eq("id", targetId)
        .maybeSingle();
      if (cancelled) return;
      if (!call || call.status !== "ringing" || (user && call.callee_id !== user.id)) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", call.caller_id)
        .maybeSingle();
      if (cancelled) return;
      // Fall back to the FCM payload we persisted in localStorage if the
      // profile fetch came back empty/blocked — otherwise the in-call overlay
      // ends up with an empty name and the "?" avatar fallback even though
      // the push notification displayed the right caller.
      const cached = readLatestCall();
      const cachedMatches = cached && cached.call_id === call.id;
      const callerName =
        profile?.display_name ||
        (cachedMatches ? cached?.caller_name : undefined) ||
        "Unknown";
      const callerAvatar =
        profile?.avatar_url ||
        (cachedMatches ? cached?.caller_avatar : undefined) ||
        undefined;
      setIncomingCall({
        id: call.id,
        conversation_id: call.conversation_id,
        caller_id: call.caller_id,
        room_name: call.room_name,
        callerName,
        callerAvatar,
      });
      logCallEvent(call.id, "received", { source: "deep_link" });
      // The next render of this effect (with incomingCall populated) will
      // strip the URL params and call handleAnswer().
    })();

    return () => { cancelled = true; };
  }, [incomingCall, activeCall, answering, handleAnswer, user, autoAcceptTick, location.search]);


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
    void dismissCallNotifications("banner-decline");
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

  // Tap-to-return: when the foreground-service notification is tapped it
  // re-launches the WebView with ?return_to_call=1 — un-minimise the overlay.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("return_to_call") !== "1") return;
    if (activeCall) setCallMinimized(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("return_to_call");
    window.history.replaceState({}, "", url.toString());
  }, [location.search, activeCall]);

  useEffect(() => {
    const onAction = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action?: string; call_id?: string } | undefined;
      if (!detail) return;
      if (detail.action === "decline" || detail.action === "missed" || detail.action === "ended") {
        // Only clear if the event matches the current call (or no id supplied).
        if (!detail.call_id || !incomingCall || detail.call_id === incomingCall.id) {
          setIncomingCall(null);
          void dismissCallNotifications(`call-${detail.action}`);
        }
      }
    };
    window.addEventListener("dm-call-action", onAction);
    return () => window.removeEventListener("dm-call-action", onAction);
  }, [incomingCall]);

  // Auto-decline via web-push deep link (?decline_call_id=…). Fires when the
  // user hit "Decline" on the OS notification before the page was open.
  useEffect(() => {
    if (!incomingCall || activeCall) return;
    const params = new URLSearchParams(window.location.search);
    const declineId = params.get("decline_call_id");
    if (!declineId || declineId !== incomingCall.id) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("decline_call_id");
    window.history.replaceState({}, "", url.toString());
    handleDecline();
  }, [incomingCall, activeCall, handleDecline]);

  // Listen for postMessage from public/push-sw.js when the user taps the
  // notification's Accept/Decline buttons. The SW navigates the tab AND
  // posts a message so we can act before navigation settles.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg || msg.type !== "dm-call-action") return;
      const intent = msg.intent as "answer" | "decline" | undefined;
      const cid = msg.call_id as string | undefined;
      if (intent === "answer") {
        // If we don't yet have the incomingCall hydrated (race with realtime),
        // forward to the URL-driven flow which fetches + answers atomically.
        if (!incomingCall && cid) {
          const url = new URL(window.location.href);
          url.searchParams.set("auto_accept", "1");
          url.searchParams.set("call_id", cid);
          window.history.replaceState({}, "", url.toString());
          // Trigger re-evaluation of the auto-accept effect.
          setAutoAcceptTick((t) => t + 1);
          return;
        }
        if (incomingCall && (!cid || cid === incomingCall.id)) handleAnswer();
      } else if (intent === "decline") {
        if (incomingCall && (!cid || cid === incomingCall.id)) handleDecline();
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [incomingCall, handleAnswer, handleDecline]);


  if (!isFeatureEnabled("voice_calls")) return null;

  return (
    <>
      {/* Full-screen incoming call screen — in-app equivalent of the
          Android lockscreen IncomingCallActivity. */}
      {incomingCall && !activeCall && (
        <IncomingCallScreen
          callerName={incomingCall.callerName}
          callerAvatar={incomingCall.callerAvatar}
          onAccept={handleAnswer}
          onDecline={handleDecline}
          answering={answering}
        />
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
            onClose={() => {
              setActiveCall(null);
              setCallMinimized(false);
              void dismissCallNotifications("active-call-closed");
            }}
          />
        </Suspense>
      )}
    </>
  );
};

export default IncomingCallBanner;
