import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Loader2, Phone, PhoneIncoming, PhoneOff, PhoneMissed, CheckCircle2,
  XCircle, AlertTriangle, RefreshCw, Clock, LogIn, Search, ChevronDown, ChevronRight,
  BellOff, Hourglass,
} from "lucide-react";

type CallEvent = {
  id: string;
  call_id: string;
  conversation_id: string | null;
  event_type: string;
  actor_id: string | null;
  source: string;
  metadata: Record<string, any> | null;
  created_at: string;
};

type CallSummary = {
  call_id: string;
  conversation_id: string | null;
  events: CallEvent[];
  first_at: string;
  last_at: string;
  participants: Set<string>;
  outcome: string;
};

const EVENT_META: Record<string, { label: string; icon: typeof Phone; tone: string }> = {
  received:    { label: "Received",          icon: PhoneIncoming, tone: "text-blue-400 bg-blue-400/10" },
  accepted:    { label: "Accepted",          icon: CheckCircle2,  tone: "text-emerald-400 bg-emerald-400/10" },
  declined:    { label: "Declined",          icon: PhoneOff,      tone: "text-destructive bg-destructive/10" },
  joined:      { label: "Joined",            icon: LogIn,         tone: "text-emerald-400 bg-emerald-400/10" },
  ended:       { label: "Ended",             icon: PhoneOff,      tone: "text-muted-foreground bg-muted" },
  failed:      { label: "Failed",            icon: XCircle,       tone: "text-destructive bg-destructive/10" },
  missed:      { label: "Missed",            icon: PhoneMissed,   tone: "text-amber-400 bg-amber-400/10" },
  rejoin:      { label: "Rejoin",            icon: RefreshCw,     tone: "text-blue-400 bg-blue-400/10" },
  timeout:     { label: "Timeout",           icon: Clock,         tone: "text-amber-400 bg-amber-400/10" },
  no_answer:   { label: "Timeout (no answer)", icon: Hourglass,   tone: "text-orange-400 bg-orange-400/10" },
  cancelled:   { label: "Cancelled",         icon: AlertTriangle, tone: "text-amber-400 bg-amber-400/10" },
  muted:       { label: "Muted",             icon: BellOff,       tone: "text-purple-400 bg-purple-400/10" },
};

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, {
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

// A `timeout` event whose metadata says `via: "no_answer"` is reported as the
// distinct "no_answer" outcome so admins can separate unanswered rings from
// other kinds of timeout (e.g. no remote track for 60s).
const isNoAnswer = (e: CallEvent) =>
  e.event_type === "timeout" && (e.metadata as any)?.via === "no_answer";

const deriveOutcome = (events: CallEvent[]): string => {
  const types = events.map((e) => e.event_type);
  if (types.includes("ended")) return "ended";
  if (types.includes("failed")) return "failed";
  if (types.includes("declined")) return "declined";
  if (types.includes("missed")) return "missed";
  if (events.some(isNoAnswer)) return "no_answer";
  if (types.includes("cancelled")) return "cancelled";
  if (types.includes("timeout")) return "timeout";
  if (types.includes("joined")) return "in_call";
  if (types.includes("accepted")) return "accepted";
  return "ringing";
};

const AdminCallEvents = () => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: events = [], isLoading, refetch, isFetching } = useQuery<CallEvent[]>({
    queryKey: ["admin-call-events"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("dm_call_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as CallEvent[];
    },
    refetchInterval: 15_000,
  });

  const summaries = useMemo<CallSummary[]>(() => {
    const map = new Map<string, CallEvent[]>();
    for (const ev of events) {
      const arr = map.get(ev.call_id) ?? [];
      arr.push(ev);
      map.set(ev.call_id, arr);
    }
    const list: CallSummary[] = [];
    map.forEach((evs, callId) => {
      const sorted = [...evs].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      const participants = new Set<string>();
      sorted.forEach((e) => { if (e.actor_id) participants.add(e.actor_id); });
      list.push({
        call_id: callId,
        conversation_id: sorted[0]?.conversation_id ?? null,
        events: sorted,
        first_at: sorted[0]?.created_at,
        last_at: sorted[sorted.length - 1]?.created_at,
        participants,
        outcome: deriveOutcome(sorted),
      });
    });
    return list.sort(
      (a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime(),
    );
  }, [events]);

  const filtered = summaries.filter((s) => {
    if (filter !== "all" && s.outcome !== filter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      s.call_id.toLowerCase().includes(q) ||
      (s.conversation_id ?? "").toLowerCase().includes(q) ||
      Array.from(s.participants).some((p) => p.toLowerCase().includes(q))
    );
  });

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Phone className="w-6 h-6 text-primary" /> Call Events
          </h1>
          <p className="text-sm text-muted-foreground">
            Lifecycle log for DM voice/video calls — last 500 events. Auto-refreshes every 15s.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by call_id, conversation_id, or actor_id"
            className="pl-9"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-2 rounded-md bg-background border border-input text-sm"
        >
          <option value="all">All outcomes</option>
          <option value="ended">Ended</option>
          <option value="in_call">In call</option>
          <option value="accepted">Accepted (no join)</option>
          <option value="ringing">Ringing</option>
          <option value="missed">Missed</option>
          <option value="declined">Declined</option>
          <option value="cancelled">Cancelled</option>
          <option value="failed">Failed</option>
          <option value="timeout">Timeout</option>
          <option value="muted">Muted</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          No call events found.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => {
            const isOpen = expanded.has(s.call_id);
            const outcomeMeta = EVENT_META[s.outcome] ?? EVENT_META.ended;
            const Icon = outcomeMeta.icon;
            return (
              <div
                key={s.call_id}
                className="rounded-lg border border-border bg-card overflow-hidden"
              >
                <button
                  onClick={() => toggle(s.call_id)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-muted/40 transition-colors text-left"
                >
                  {isOpen
                    ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <span className={`px-2 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 ${outcomeMeta.tone}`}>
                    <Icon className="w-3.5 h-3.5" />
                    {outcomeMeta.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-mono text-foreground truncate">
                      {s.call_id}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {s.events.length} event{s.events.length === 1 ? "" : "s"} · {s.participants.size} participant{s.participants.size === 1 ? "" : "s"} · last {fmt(s.last_at)}
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border bg-background/40 p-3 space-y-2">
                    {s.conversation_id && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-semibold">Conversation:</span> <span className="font-mono">{s.conversation_id}</span>
                      </div>
                    )}
                    <ol className="space-y-1.5">
                      {s.events.map((ev) => {
                        const meta = EVENT_META[ev.event_type] ?? { label: ev.event_type, icon: Phone, tone: "text-muted-foreground bg-muted" };
                        const EvIcon = meta.icon;
                        return (
                          <li key={ev.id} className="flex items-start gap-2 text-xs">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 shrink-0 ${meta.tone}`}>
                              <EvIcon className="w-3 h-3" />
                              {meta.label}
                            </span>
                            <span className="text-muted-foreground shrink-0">{fmt(ev.created_at)}</span>
                            <span className="text-muted-foreground shrink-0">[{ev.source}]</span>
                            {ev.actor_id && (
                              <span className="font-mono text-muted-foreground truncate">{ev.actor_id.slice(0, 8)}…</span>
                            )}
                            {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                              <code className="text-foreground/70 truncate">
                                {JSON.stringify(ev.metadata)}
                              </code>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminCallEvents;
