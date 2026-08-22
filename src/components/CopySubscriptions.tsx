import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Zap, ShieldCheck, ToggleLeft, ToggleRight, Loader2, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { resolveAvatarUrl } from "@/lib/avatarUrl";

interface CopySubscription {
  id: string;
  target_user_id: string;
  copy_predictions: boolean;
  copy_quick_trades: boolean;
  auto_copy: boolean;
  max_amount: number;
  target_name: string;
  target_avatar: string | null;
}

const CopySubscriptions = () => {
  const { user } = useAuth();
  const [subs, setSubs] = useState<CopySubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchSubs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("copy_settings")
      .select("*")
      .eq("user_id", user.id);

    if (!data || data.length === 0) {
      setSubs([]);
      setLoading(false);
      return;
    }

    // Enrich with profile names
    const enriched: CopySubscription[] = [];
    for (const row of data) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", row.target_user_id)
        .single();

      enriched.push({
        id: row.id,
        target_user_id: row.target_user_id,
        copy_predictions: row.copy_predictions,
        copy_quick_trades: row.copy_quick_trades,
        auto_copy: row.auto_copy,
        max_amount: Number(row.max_amount),
        target_name: profile?.display_name || "Unknown Trader",
        target_avatar: profile?.avatar_url || null,
      });
    }

    setSubs(enriched);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  const toggleField = async (sub: CopySubscription, field: "copy_predictions" | "copy_quick_trades" | "auto_copy") => {
    if (!user) return;
    setUpdating(sub.id + field);
    const newVal = !sub[field];

    const updatePayload: { copy_predictions?: boolean; copy_quick_trades?: boolean; auto_copy?: boolean; updated_at: string } = {
      updated_at: new Date().toISOString(),
    };
    updatePayload[field] = newVal;

    const { error } = await supabase
      .from("copy_settings")
      .update(updatePayload)
      .eq("id", sub.id)
      .eq("user_id", user.id);

    if (error) {
      toast.error("Failed to update");
    } else {
      setSubs(prev => prev.map(s => s.id === sub.id ? { ...s, [field]: newVal } : s));
      toast.success("Updated");
    }
    setUpdating(null);
  };

  const removeSub = async (sub: CopySubscription) => {
    if (!user) return;
    setUpdating(sub.id + "delete");

    const { error } = await supabase
      .from("copy_settings")
      .delete()
      .eq("id", sub.id)
      .eq("user_id", user.id);

    if (error) {
      toast.error("Failed to remove");
    } else {
      setSubs(prev => prev.filter(s => s.id !== sub.id));
      toast.success(`Stopped copying ${sub.target_name}`);
    }
    setUpdating(null);
  };

  const isActive = (sub: CopySubscription) => sub.copy_predictions || sub.copy_quick_trades;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (subs.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <Users className="w-7 h-7 text-primary" />
        </div>
        <h3 className="font-bold mb-1">No Copy Subscriptions</h3>
        <p className="text-sm text-muted-foreground">
          Visit a trader's profile and enable copy trading to automatically mirror their trades.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3">
      {subs.map((sub, i) => (
        <motion.div
          key={sub.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="glass rounded-xl overflow-hidden"
        >
          {/* Header row */}
          <button
            onClick={() => setExpanded(expanded === sub.id ? null : sub.id)}
            className="w-full flex items-center gap-3 p-3 text-left"
          >
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
              {sub.target_avatar ? (
                <img src={resolveAvatarUrl(sub.target_avatar)} alt="" className="w-full h-full object-cover" />
              ) : (
                <Users className="w-4 h-4 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{sub.target_name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                  isActive(sub)
                    ? "bg-primary/15 text-primary border-primary/20"
                    : "bg-muted text-muted-foreground border-border"
                }`}>
                  {isActive(sub) ? "Active" : "Paused"}
                </span>
                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                  sub.auto_copy
                    ? "bg-primary/15 text-primary border-primary/20"
                    : "bg-muted text-muted-foreground border-border"
                }`}>
                  {sub.auto_copy ? <><Zap className="w-2.5 h-2.5" /> Auto</> : <><ShieldCheck className="w-2.5 h-2.5" /> Manual</>}
                </span>
                <span className="text-[10px] text-muted-foreground">Max ${sub.max_amount}</span>
              </div>
            </div>
            {expanded === sub.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>

          {/* Expanded controls */}
          <AnimatePresence>
            {expanded === sub.id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-3 pb-3 space-y-2 border-t border-border pt-3">
                  {/* Copy Predictions */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Copy Predictions</span>
                    <button
                      onClick={() => toggleField(sub, "copy_predictions")}
                      disabled={updating === sub.id + "copy_predictions"}
                      className="transition-colors"
                    >
                      {updating === sub.id + "copy_predictions" ? (
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      ) : sub.copy_predictions ? (
                        <ToggleRight className="w-7 h-7 text-primary" />
                      ) : (
                        <ToggleLeft className="w-7 h-7 text-muted-foreground" />
                      )}
                    </button>
                  </div>

                  {/* Copy Quick Trades */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Copy Quick Trades</span>
                    <button
                      onClick={() => toggleField(sub, "copy_quick_trades")}
                      disabled={updating === sub.id + "copy_quick_trades"}
                      className="transition-colors"
                    >
                      {updating === sub.id + "copy_quick_trades" ? (
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      ) : sub.copy_quick_trades ? (
                        <ToggleRight className="w-7 h-7 text-primary" />
                      ) : (
                        <ToggleLeft className="w-7 h-7 text-muted-foreground" />
                      )}
                    </button>
                  </div>

                  {/* Auto Copy */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-muted-foreground">Auto Copy</span>
                      <p className="text-[10px] text-muted-foreground/70">
                        {sub.auto_copy ? "Trades copy instantly" : "You approve each trade"}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleField(sub, "auto_copy")}
                      disabled={updating === sub.id + "auto_copy"}
                      className="transition-colors"
                    >
                      {updating === sub.id + "auto_copy" ? (
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      ) : sub.auto_copy ? (
                        <ToggleRight className="w-7 h-7 text-primary" />
                      ) : (
                        <ToggleLeft className="w-7 h-7 text-muted-foreground" />
                      )}
                    </button>
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => removeSub(sub)}
                    disabled={updating === sub.id + "delete"}
                    className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 transition-colors"
                  >
                    {updating === sub.id + "delete" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    Stop Copying
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  );
};

export default CopySubscriptions;
