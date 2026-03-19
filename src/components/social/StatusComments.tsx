import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import { Loader2, Send, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import NftBadge, { type VerificationLevel } from "@/components/NftBadge";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface StatusCommentsProps {
  statusId: string;
}

const StatusComments = ({ statusId }: StatusCommentsProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["status-comments", statusId],
    queryFn: async () => {
      const { data } = await supabase
        .from("status_comments")
        .select("*")
        .eq("status_id", statusId)
        .order("created_at", { ascending: true })
        .limit(50);
      return data || [];
    },
  });

  const authorIds = [...new Set(comments.map((c: any) => c.user_id))];
  const { data: profileMap = new Map() } = useQuery({
    queryKey: ["status-comment-profiles", authorIds.join(",")],
    queryFn: async () => {
      if (authorIds.length === 0) return new Map();
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, verification_level")
        .in("id", authorIds.slice(0, 50));
      return new Map((data || []).map((p: any) => [p.id, p]));
    },
    enabled: authorIds.length > 0,
  });

  const handleSubmit = async () => {
    if (!user || !text.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("status_comments").insert({
        status_id: statusId,
        user_id: user.id,
        content: text.trim(),
      });
      if (error) throw error;
      setText("");
      queryClient.invalidateQueries({ queryKey: ["status-comments", statusId] });
      queryClient.invalidateQueries({ queryKey: ["status-feed"] });
    } catch {
      toast.error("Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    const { error } = await supabase.from("status_comments").delete().eq("id", commentId);
    if (error) { toast.error("Failed to delete"); return; }
    queryClient.invalidateQueries({ queryKey: ["status-comments", statusId] });
    queryClient.invalidateQueries({ queryKey: ["status-feed"] });
  };

  return (
    <div className="space-y-2 pt-1">
      {isLoading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        comments.map((c: any, i: number) => {
          const prof = (profileMap as Map<string, any>).get(c.user_id);
          const name = prof?.display_name || "Anonymous";
          const vLevel = (prof?.verification_level || "none") as VerificationLevel;
          return (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className="flex gap-2 group"
            >
              <div
                className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 overflow-hidden flex items-center justify-center shrink-0 cursor-pointer"
                onClick={() => navigate(`/user/${c.user_id}`)}
              >
                {prof?.avatar_url ? (
                  <img src={prof.avatar_url} alt={name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] font-bold text-primary">{name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="bg-muted/50 rounded-lg px-2.5 py-1.5">
                  <span
                    className="text-[11px] font-semibold cursor-pointer hover:underline inline-flex items-center gap-0.5"
                    onClick={() => navigate(`/user/${c.user_id}`)}
                  >
                    {name}
                    {vLevel !== "none" && <NftBadge level={vLevel} size={11} />}
                  </span>
                  <p className="text-xs whitespace-pre-wrap break-words">{c.content}</p>
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5 px-1">
                  {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                </p>
              </div>
              {user?.id === c.user_id && (
                <button
                  onClick={() => handleDelete(c.id)}
                  className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </motion.div>
          );
        })
      )}

      {/* Comment input */}
      {user && (
        <div className="flex gap-2 items-center pt-1">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
            placeholder="Write a comment..."
            maxLength={280}
            className="flex-1 bg-muted/50 border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || !text.trim()}
            className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"
          >
            {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          </button>
        </div>
      )}
    </div>
  );
};

export default StatusComments;
