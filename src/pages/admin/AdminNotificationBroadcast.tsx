import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Megaphone, Send, Clock, Users, Shield, CheckCircle, XCircle,
  Loader2, ChevronDown, ChevronUp, Search, X, UserCheck, Bell,
} from "lucide-react";
import AdminPagination from "@/components/admin/AdminPagination";

type TargetType = "all_users" | "by_role" | "by_verification" | "manual";

interface BroadcastRecord {
  id: string;
  title: string;
  message: string;
  type: string;
  target_type: TargetType;
  target_filter: any;
  send_push: boolean;
  scheduled_at: string | null;
  status: string;
  sent_at: string | null;
  recipients_count: number;
  created_by: string;
  created_at: string;
}

const ROLES = ["admin", "moderator", "support", "super_admin"];
const VERIFICATION_LEVELS = ["none", "blue", "gold"];
const NOTIF_TYPES = ["info", "warning", "promo", "referral"];

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  sent: "bg-green-500/10 text-green-500 border-green-500/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
};

const AdminNotificationBroadcast = () => {
  const { user } = useAuth();

  // Compose state
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [notifType, setNotifType] = useState("info");
  const [targetType, setTargetType] = useState<TargetType>("all_users");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [manualUserIds, setManualUserIds] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<{ id: string; display_name: string; email: string }[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sendPush, setSendPush] = useState(true);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [sending, setSending] = useState(false);

  // History state
  const [broadcasts, setBroadcasts] = useState<BroadcastRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const fetchHistory = async () => {
    setHistoryLoading(true);
    const { data } = await supabase
      .from("admin_notification_broadcasts" as any)
      .select("*")
      .order("created_at", { ascending: false });
    setBroadcasts((data as any) || []);
    setHistoryLoading(false);
  };

  useEffect(() => { fetchHistory(); }, []);

  const searchUsers = async (term: string) => {
    if (term.length < 2) { setUserResults([]); return; }
    setSearchLoading(true);
    const { data } = await supabase.rpc("admin_search_profiles", { _q: term });
    setUserResults(((data as any[]) || []).slice(0, 10) as any);
    setSearchLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => searchUsers(userSearch), 300);
    return () => clearTimeout(timer);
  }, [userSearch]);

  const addManualUser = (userId: string) => {
    if (!manualUserIds.includes(userId)) {
      setManualUserIds([...manualUserIds, userId]);
    }
    setUserSearch("");
    setUserResults([]);
  };

  const removeManualUser = (userId: string) => {
    setManualUserIds(manualUserIds.filter((id) => id !== userId));
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error("Title and message are required");
      return;
    }
    if (targetType === "by_role" && selectedRoles.length === 0) {
      toast.error("Select at least one role");
      return;
    }
    if (targetType === "by_verification" && selectedLevels.length === 0) {
      toast.error("Select at least one verification level");
      return;
    }
    if (targetType === "manual" && manualUserIds.length === 0) {
      toast.error("Add at least one user");
      return;
    }

    setSending(true);
    try {
      const targetFilter: any = {};
      if (targetType === "by_role") targetFilter.roles = selectedRoles;
      if (targetType === "by_verification") targetFilter.levels = selectedLevels;
      if (targetType === "manual") targetFilter.user_ids = manualUserIds;

      // Create broadcast record
      const { data: insertData, error: insertErr } = await supabase
        .from("admin_notification_broadcasts" as any)
        .insert({
          title: title.trim(),
          message: message.trim(),
          type: notifType,
          target_type: targetType,
          target_filter: targetFilter,
          send_push: sendPush,
          scheduled_at: scheduleEnabled && scheduledAt ? new Date(scheduledAt).toISOString() : null,
          status: scheduleEnabled && scheduledAt ? "pending" : "pending",
          created_by: user?.id,
        })
        .select("id")
        .single();

      if (insertErr) throw insertErr;

      const broadcastId = (insertData as any)?.id;

      if (!scheduleEnabled || !scheduledAt) {
        // Send immediately
        const { data, error } = await supabase.functions.invoke("send-admin-broadcast", {
          body: { broadcast_id: broadcastId },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success(`Broadcast sent to ${data.recipients_count} users!`);
      } else {
        toast.success("Broadcast scheduled successfully!");
      }

      // Reset form
      setTitle("");
      setMessage("");
      setNotifType("info");
      setTargetType("all_users");
      setSelectedRoles([]);
      setSelectedLevels([]);
      setManualUserIds([]);
      setSendPush(true);
      setScheduleEnabled(false);
      setScheduledAt("");
      fetchHistory();
    } catch (err: any) {
      toast.error(err.message || "Failed to send broadcast");
    } finally {
      setSending(false);
    }
  };

  const paginated = useMemo(() => broadcasts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [broadcasts, page]);

  const targetLabel = (b: BroadcastRecord) => {
    if (b.target_type === "all_users") return "All Users";
    if (b.target_type === "by_role") return `Roles: ${(b.target_filter?.roles || []).join(", ")}`;
    if (b.target_type === "by_verification") return `Verification: ${(b.target_filter?.levels || []).join(", ")}`;
    if (b.target_type === "manual") return `${(b.target_filter?.user_ids || []).length} selected users`;
    return b.target_type;
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <Megaphone className="w-6 h-6 text-primary" />
        Notification Broadcasts
      </h2>

      {/* Compose Section */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <Send className="w-4 h-4 text-primary" />
          Compose Broadcast
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Platform Update 🚀"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              maxLength={100}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <select
              value={notifType}
              onChange={(e) => setNotifType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            >
              {NOTIF_TYPES.map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Your broadcast message..."
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none"
            maxLength={500}
          />
          <p className="text-[10px] text-muted-foreground text-right">{message.length}/500</p>
        </div>

        {/* Target Selection */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Users className="w-3 h-3" /> Target Audience
          </label>
          <div className="flex flex-wrap gap-2">
            {([
              { key: "all_users", label: "All Users", icon: Users },
              { key: "by_role", label: "By Role", icon: Shield },
              { key: "by_verification", label: "By Verification", icon: UserCheck },
              { key: "manual", label: "Manual Selection", icon: Search },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setTargetType(opt.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  targetType === opt.key
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                <opt.icon className="w-3 h-3" />
                {opt.label}
              </button>
            ))}
          </div>

          {/* Role selector */}
          {targetType === "by_role" && (
            <div className="flex flex-wrap gap-2 mt-2">
              {ROLES.map((role) => (
                <button
                  key={role}
                  onClick={() => setSelectedRoles(
                    selectedRoles.includes(role)
                      ? selectedRoles.filter((r) => r !== role)
                      : [...selectedRoles, role]
                  )}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    selectedRoles.includes(role)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/50 text-muted-foreground border-border"
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          )}

          {/* Verification level selector */}
          {targetType === "by_verification" && (
            <div className="flex flex-wrap gap-2 mt-2">
              {VERIFICATION_LEVELS.map((level) => (
                <button
                  key={level}
                  onClick={() => setSelectedLevels(
                    selectedLevels.includes(level)
                      ? selectedLevels.filter((l) => l !== level)
                      : [...selectedLevels, level]
                  )}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    selectedLevels.includes(level)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/50 text-muted-foreground border-border"
                  }`}
                >
                  {level === "none" ? "Unverified" : level.charAt(0).toUpperCase() + level.slice(1)}
                </button>
              ))}
            </div>
          )}

          {/* Manual user picker */}
          {targetType === "manual" && (
            <div className="space-y-2 mt-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm"
                />
              </div>

              {searchLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}

              {userResults.length > 0 && (
                <div className="bg-muted/50 border border-border rounded-lg max-h-40 overflow-y-auto">
                  {userResults.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => addManualUser(u.id)}
                      disabled={manualUserIds.includes(u.id)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex justify-between items-center disabled:opacity-50"
                    >
                      <span>{u.display_name || "Unknown"} <span className="text-muted-foreground">({u.email})</span></span>
                      {manualUserIds.includes(u.id) && <CheckCircle className="w-3 h-3 text-green-500" />}
                    </button>
                  ))}
                </div>
              )}

              {manualUserIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {manualUserIds.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[10px] font-mono px-2 py-0.5 rounded-full">
                      {id.slice(0, 8)}…
                      <button onClick={() => removeManualUser(id)} className="hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Options Row */}
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={sendPush}
              onChange={(e) => setSendPush(e.target.checked)}
              className="rounded border-border"
            />
            <Bell className="w-3 h-3 text-muted-foreground" />
            Also send push notification
          </label>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={scheduleEnabled}
              onChange={(e) => setScheduleEnabled(e.target.checked)}
              className="rounded border-border"
            />
            <Clock className="w-3 h-3 text-muted-foreground" />
            Schedule for later
          </label>

          {scheduleEnabled && (
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs"
              min={new Date().toISOString().slice(0, 16)}
            />
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={sending || !title.trim() || !message.trim()}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {scheduleEnabled && scheduledAt ? "Schedule Broadcast" : "Send Now"}
        </button>
      </div>

      {/* Broadcast History */}
      <div className="space-y-3">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          Broadcast History
        </h3>

        {historyLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : broadcasts.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
            No broadcasts sent yet
          </div>
        ) : (
          <div className="space-y-2">
            {paginated.map((bc) => {
              const isExpanded = expandedId === bc.id;
              return (
                <div key={bc.id} className="bg-card border border-border rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : bc.id)}
                    className="w-full text-left p-4 flex flex-col sm:flex-row sm:items-center gap-2 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Megaphone className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="text-sm font-bold truncate max-w-[300px]">{bc.title}</span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${statusColors[bc.status] || statusColors.pending}`}>
                          {bc.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span>{targetLabel(bc)}</span>
                        <span>{bc.recipients_count} recipients</span>
                        <span>{format(new Date(bc.created_at), "MMM d, HH:mm")}</span>
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-muted-foreground block mb-0.5 font-medium">Message</span>
                          <p className="text-foreground">{bc.message}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground block mb-0.5 font-medium">Type</span>
                          <span className="text-foreground capitalize">{bc.type}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block mb-0.5 font-medium">Push Sent</span>
                          <span className="text-foreground">{bc.send_push ? "Yes" : "No"}</span>
                        </div>
                        {bc.scheduled_at && (
                          <div>
                            <span className="text-muted-foreground block mb-0.5 font-medium">Scheduled For</span>
                            <span className="text-foreground">{format(new Date(bc.scheduled_at), "MMM d, yyyy HH:mm")}</span>
                          </div>
                        )}
                        {bc.sent_at && (
                          <div>
                            <span className="text-muted-foreground block mb-0.5 font-medium">Sent At</span>
                            <span className="text-foreground">{format(new Date(bc.sent_at), "MMM d, yyyy HH:mm:ss")}</span>
                          </div>
                        )}
                      </div>

                      <div className={`rounded-lg p-2.5 text-xs flex items-start gap-2 ${
                        bc.status === "sent"
                          ? "bg-green-500/5 border border-green-500/10"
                          : bc.status === "failed"
                          ? "bg-destructive/5 border border-destructive/10"
                          : "bg-yellow-500/5 border border-yellow-500/10"
                      }`}>
                        {bc.status === "sent" ? (
                          <>
                            <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                            <p className="text-muted-foreground">
                              Successfully delivered to <strong className="text-green-500">{bc.recipients_count}</strong> users.
                            </p>
                          </>
                        ) : bc.status === "failed" ? (
                          <>
                            <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                            <p className="text-muted-foreground">Broadcast failed — no matching recipients found.</p>
                          </>
                        ) : (
                          <>
                            <Clock className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                            <p className="text-muted-foreground">
                              Scheduled for {bc.scheduled_at ? format(new Date(bc.scheduled_at), "MMM d, yyyy HH:mm") : "processing"}.
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <AdminPagination page={page} totalItems={broadcasts.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>
    </div>
  );
};

export default AdminNotificationBroadcast;
