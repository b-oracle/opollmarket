import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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

const IncomingCallBanner = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [activeCall, setActiveCall] = useState<{
    callId: string;
    conversationId: string;
    token: string;
    url: string;
    room: string;
    passphrase: string;
    otherName: string;
    otherAvatar?: string;
    isOutgoing: boolean;
  } | null>(null);
  const [answering, setAnswering] = useState(false);
  const stopRingtoneRef = useRef<(() => void) | null>(null);

  // Play ringtone when incoming call appears
  useEffect(() => {
    if (incomingCall && !activeCall) {
      stopRingtoneRef.current = playRingtone();
    } else {
      if (stopRingtoneRef.current) { stopRingtoneRef.current(); stopRingtoneRef.current = null; }
    }
    return () => {
      if (stopRingtoneRef.current) { stopRingtoneRef.current(); stopRingtoneRef.current = null; }
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

  // Listen for call status changes (e.g., caller cancels)
  useEffect(() => {
    if (!incomingCall) return;

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
      supabase.removeChannel(channel);
    };
  }, [incomingCall?.id]);

  const handleAnswer = useCallback(async () => {
    if (!incomingCall || answering) return;
    setAnswering(true);

    try {
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
      toast.error(err.message || "Failed to answer call");
    } finally {
      setAnswering(false);
    }
  }, [incomingCall, answering]);

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
      setActiveCall(e.detail);
    };
    window.addEventListener("start-voice-call" as any, handler);
    return () => window.removeEventListener("start-voice-call" as any, handler);
  }, []);

  return (
    <>
      {/* Incoming call banner */}
      {incomingCall && !activeCall && (
        <div className="fixed top-0 left-0 right-0 z-[9998] bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3 animate-in slide-in-from-top" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
          <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center overflow-hidden shrink-0">
            {incomingCall.callerAvatar ? (
              <img src={incomingCall.callerAvatar} className="w-full h-full object-cover" alt="" />
            ) : (
              <span className="text-sm font-bold">{incomingCall.callerName.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{incomingCall.callerName}</p>
            <p className="text-xs opacity-80">Incoming voice call...</p>
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
            onClose={() => setActiveCall(null)}
          />
        </Suspense>
      )}
    </>
  );
};

export default IncomingCallBanner;
