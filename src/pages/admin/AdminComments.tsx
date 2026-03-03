import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface CommentRow {
  id: string;
  market_id: string;
  author_name: string;
  content: string;
  likes_count: number;
  created_at: string;
}

const AdminComments = () => {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchComments = async () => {
    const { data, error } = await supabase
      .from("comments")
      .select("id, market_id, author_name, content, likes_count, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error && data) setComments(data);
    setLoading(false);
  };

  useEffect(() => { fetchComments(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this comment?")) return;
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (error) toast.error("Failed to delete");
    else { toast.success("Comment deleted"); fetchComments(); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Comments ({comments.length})</h2>
      <div className="space-y-2">
        {comments.map((c) => (
          <div key={c.id} className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold">@{c.author_name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
                <span className="text-[10px] text-muted-foreground">❤️ {c.likes_count}</span>
              </div>
              <p className="text-sm text-foreground/80 truncate">{c.content}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Market: {c.market_id}</p>
            </div>
            <button
              onClick={() => handleDelete(c.id)}
              className="p-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {comments.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm">No comments found</div>
        )}
      </div>
    </div>
  );
};

export default AdminComments;
