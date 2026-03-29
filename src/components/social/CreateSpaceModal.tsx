import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Radio, Loader2, Calendar, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import MarketTagSelector, { type MarketTag } from "./MarketTagSelector";

interface CreateSpaceModalProps {
  open: boolean;
  onClose: () => void;
}

const CreateSpaceModal = ({ open, onClose }: CreateSpaceModalProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<"live" | "scheduled">("live");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");

  if (!user) return null;

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;

    if (mode === "scheduled") {
      if (!scheduledDate || !scheduledTime) {
        toast.error("Please set a date and time");
        return;
      }
      const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`);
      if (scheduledAt <= new Date()) {
        toast.error("Scheduled time must be in the future");
        return;
      }
    }

    setCreating(true);
    try {
      const insertData: any = {
        host_id: user.id,
        title: trimmed,
      };

      if (mode === "scheduled") {
        insertData.status = "scheduled";
        insertData.scheduled_at = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
      }

      const { data: space, error } = await supabase
        .from("spaces" as any)
        .insert(insertData)
        .select("id")
        .single();
      if (error) throw error;

      if (mode === "live") {
        // Join as host immediately
        await supabase.from("space_participants").insert({
          space_id: (space as any).id,
          user_id: user.id,
          role: "host",
        });
        toast.success("Space started! 🎙️");
      } else {
        toast.success("Space scheduled! 📅");
      }

      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      setTitle("");
      setScheduledDate("");
      setScheduledTime("");
      setMode("live");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to create space");
    } finally {
      setCreating(false);
    }
  };

  // Get min datetime (now)
  const now = new Date();
  const minDate = now.toISOString().split("T")[0];
  const minTime = scheduledDate === minDate
    ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    : "00:00";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[70]"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-[71] flex items-end lg:items-center lg:justify-center pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="pointer-events-auto w-full bg-background p-6 space-y-4 rounded-t-2xl border-t border-border lg:max-w-md lg:rounded-2xl lg:border lg:shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Radio className="w-5 h-5 text-primary" />
                  {mode === "live" ? "Start a Space" : "Schedule a Space"}
                </h3>
                <button onClick={onClose} className="w-8 h-8 rounded-full glass flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Mode toggle */}
              <div className="flex gap-2 p-1 bg-muted/50 rounded-lg">
                <button
                  onClick={() => setMode("live")}
                  className={`flex-1 py-2 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                    mode === "live" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  Go Live Now
                </button>
                <button
                  onClick={() => setMode("scheduled")}
                  className={`flex-1 py-2 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                    mode === "scheduled" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  Schedule
                </button>
              </div>

              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What do you want to talk about?"
                maxLength={100}
                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
              />

              {mode === "scheduled" && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                      <Calendar className="w-3 h-3 shrink-0" /> Date
                    </label>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      min={minDate}
                      className="block w-full appearance-none bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3 shrink-0" /> Time
                    </label>
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      min={minTime}
                      className="block w-full appearance-none bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
              )}

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleCreate}
                disabled={creating || !title.trim() || (mode === "scheduled" && (!scheduledDate || !scheduledTime))}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : mode === "live" ? (
                  <Radio className="w-4 h-4" />
                ) : (
                  <Calendar className="w-4 h-4" />
                )}
                {mode === "live" ? "Go Live" : "Schedule Space"}
              </motion.button>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CreateSpaceModal;
