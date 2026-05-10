import { useQuery } from "@tanstack/react-query";
import { getAvatarInitials } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface CallRecord {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  status: string;
  duration_seconds: number | null;
  created_at: string;
  other_user?: { display_name: string; avatar_url: string | null };
}

const CallHistoryTab = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: calls = [], isLoading } = useQuery({
    queryKey: ["dm-call-history", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("dm_calls" as any)
        .select("*")
        .or(`caller_id.eq.${user.id},callee_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(50) as any;

      if (!data || data.length === 0) return [];

      const otherIds = [...new Set(data.map((c: any) =>
        c.caller_id === user.id ? c.callee_id : c.caller_id
      ))];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", otherIds as string[]);

      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

      return data.map((c: any) => {
        const otherId = c.caller_id === user.id ? c.callee_id : c.caller_id;
        return { ...c, other_user: profileMap.get(otherId) || { display_name: "User", avatar_url: null } };
      }) as CallRecord[];
    },
    enabled: !!user,
    staleTime: 15_000,
  });

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const getCallIcon = (call: CallRecord) => {
    const isOutgoing = call.caller_id === user?.id;
    if (call.status === "missed" || call.status === "declined") {
      return <PhoneMissed className="w-4 h-4 text-destructive" />;
    }
    if (call.status === "ended") {
      return isOutgoing
        ? <PhoneOutgoing className="w-4 h-4 text-emerald-500" />
        : <PhoneIncoming className="w-4 h-4 text-emerald-500" />;
    }
    return <Phone className="w-4 h-4 text-muted-foreground" />;
  };

  const getCallLabel = (call: CallRecord) => {
    const isOutgoing = call.caller_id === user?.id;
    switch (call.status) {
      case "ended": return isOutgoing ? "Outgoing call" : "Incoming call";
      case "missed": return isOutgoing ? "Cancelled" : "Missed call";
      case "declined": return "Declined";
      case "ringing": return "Ringing...";
      case "active": return "Ongoing";
      default: return call.status;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
        <Phone className="w-12 h-12 opacity-30" />
        <p className="text-sm">No call history</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {calls.map((call) => (
        <button
          key={call.id}
          onClick={() => navigate(`/messages/${call.conversation_id}`)}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors text-left"
        >
          <div className="w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
            {call.other_user?.avatar_url ? (
              <img src={call.other_user.avatar_url} className="w-full h-full object-cover" alt="" />
            ) : (
              <span className="text-sm font-bold text-primary">
                {(call.other_user?.display_name || "?").charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold truncate">
                {call.other_user?.display_name || "User"}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {formatDistanceToNow(new Date(call.created_at), { addSuffix: true })}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {getCallIcon(call)}
              <span className={`text-xs ${
                call.status === "missed" || call.status === "declined"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}>
                {getCallLabel(call)}
              </span>
              {call.duration_seconds ? (
                <span className="text-xs text-muted-foreground">
                  · {formatDuration(call.duration_seconds)}
                </span>
              ) : null}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};

export default CallHistoryTab;
