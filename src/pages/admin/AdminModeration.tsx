import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, XCircle, Eye, MessageSquare, ShoppingBag, Image, User, Filter } from "lucide-react";
import { toast } from "sonner";
import AdminPagination from "@/components/admin/AdminPagination";
import { motion, AnimatePresence } from "framer-motion";
import { useAdminContext } from "./AdminLayout";

interface ModerationLog {
  id: string;
  content_type: string;
  content_id: string | null;
  user_id: string | null;
  flagged_content: string | null;
  reason: string;
  category: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
  created_at: string;
}

type ContentFilter = "all" | "comment" | "market" | "image" | "display_name";
type StatusFilter = "all" | "pending" | "approved" | "rejected";

const contentTypeConfig: Record<string, { icon: typeof MessageSquare; label: string; colorClass: string }> = {
  comment: { icon: MessageSquare, label: "Comment", colorClass: "text-blue-400 bg-blue-400/10" },
  market: { icon: ShoppingBag, label: "Market", colorClass: "text-amber-400 bg-amber-400/10" },
  image: { icon: Image, label: "Image", colorClass: "text-purple-400 bg-purple-400/10" },
  display_name: { icon: User, label: "Display Name", colorClass: "text-emerald-400 bg-emerald-400/10" },
};

const statusConfig: Record<string, { label: string; colorClass: string }> = {
  pending: { label: "Pending", colorClass: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  approved: { label: "Approved", colorClass: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  rejected: { label: "Rejected", colorClass: "text-destructive bg-destructive/10 border-destructive/20" },
};

const PAGE_SIZE = 20;

const AdminModeration = () => {
  const [logs, setLogs] = useState<ModerationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [contentFilter, setContentFilter] = useState<ContentFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [processing, setProcessing] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("moderation_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (!error && data) setLogs(data as ModerationLog[]);
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, []);

  const filteredLogs = useMemo(() => {
    let result = logs;
    if (contentFilter !== "all") result = result.filter(l => l.content_type === contentFilter);
    if (statusFilter !== "all") result = result.filter(l => l.status === statusFilter);
    return result;
  }, [logs, contentFilter, statusFilter]);

  const paginatedLogs = useMemo(() =>
    filteredLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
  [filteredLogs, page]);

  const pendingCount = useMemo(() => logs.filter(l => l.status === "pending").length, [logs]);

  const handleReview = async (id: string, action: "approved" | "rejected") => {
    setProcessing(true);
    const { error } = await supabase
      .from("moderation_logs")
      .update({
        status: action,
        admin_note: adminNote.trim() || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      toast.error("Failed to update");
    } else {
      toast.success(`Content ${action}`);
      setReviewingId(null);
      setAdminNote("");
      fetchLogs();
    }
    setProcessing(false);
  };

  const getTypeConfig = (type: string) => contentTypeConfig[type] || contentTypeConfig.comment;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Content Moderation</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Review flagged content across the platform
          </p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-400/10 border border-amber-400/20 self-start sm:self-auto">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-semibold text-amber-400">{pendingCount} Pending</span>
          </div>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {(["comment", "market", "image", "display_name"] as const).map(type => {
          const config = getTypeConfig(type);
          const count = logs.filter(l => l.content_type === type).length;
          const Icon = config.icon;
          return (
            <button
              key={type}
              onClick={() => { setContentFilter(contentFilter === type ? "all" : type); setPage(1); }}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                contentFilter === type
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-card hover:bg-muted/50"
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.colorClass}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="text-lg font-bold">{count}</p>
                <p className="text-[10px] text-muted-foreground">{config.label}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
        {(["all", "pending", "approved", "rejected"] as StatusFilter[]).map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              statusFilter === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Logs list */}
      <div className="space-y-2">
        <AnimatePresence>
          {paginatedLogs.map(log => {
            const typeConfig = getTypeConfig(log.content_type);
            const TypeIcon = typeConfig.icon;
            const sConfig = statusConfig[log.status] || statusConfig.pending;

            return (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-card border border-border rounded-xl p-4"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${typeConfig.colorClass}`}>
                    <TypeIcon className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-semibold">{typeConfig.label}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${sConfig.colorClass}`}>
                        {sConfig.label}
                      </span>
                      {log.category && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                          {log.category}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {new Date(log.created_at).toLocaleDateString()} {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Flagged content */}
                    {log.flagged_content && (
                      <div className="bg-muted/50 rounded-lg p-2.5 mb-2">
                        {log.content_type === "image" ? (
                          <div className="flex items-center gap-2">
                            <Image className="w-4 h-4 text-muted-foreground shrink-0" />
                            <a
                              href={log.flagged_content}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline truncate"
                            >
                              View Image
                            </a>
                          </div>
                        ) : (
                          <p className="text-sm text-foreground/80 break-words">{log.flagged_content}</p>
                        )}
                      </div>
                    )}

                    {/* Reason */}
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold">Reason:</span> {log.reason || "No reason provided"}
                    </p>

                    {/* Admin note if reviewed */}
                     {log.admin_note && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-semibold">Mod note:</span> {log.admin_note}
                      </p>
                    )}

                    {/* Review actions */}
                    {log.status === "pending" && (
                      <div className="mt-3">
                        {reviewingId === log.id ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={adminNote}
                              onChange={e => setAdminNote(e.target.value)}
                              placeholder="Optional mod note..."
                              className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                            <div className="flex gap-2">
                              <button
                                disabled={processing}
                                onClick={() => handleReview(log.id, "approved")}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                Approve
                              </button>
                              <button
                                disabled={processing}
                                onClick={() => handleReview(log.id, "rejected")}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 transition-colors disabled:opacity-50"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Reject
                              </button>
                              <button
                                onClick={() => { setReviewingId(null); setAdminNote(""); }}
                                className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setReviewingId(log.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Review
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredLogs.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <CheckCircle className="w-10 h-10 mx-auto mb-3 text-emerald-400/50" />
            <p className="text-sm font-medium">No flagged content</p>
            <p className="text-xs mt-1">All clear! No moderation issues found.</p>
          </div>
        )}
      </div>

      <AdminPagination page={page} totalItems={filteredLogs.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default AdminModeration;
