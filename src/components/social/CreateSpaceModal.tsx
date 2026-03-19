import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Radio, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface CreateSpaceModalProps {
  open: boolean;
  onClose: () => void;
}

const CreateSpaceModal = ({ open, onClose }: CreateSpaceModalProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  if (!user) return null;

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      // Create the space
      const { data: space, error } = await supabase
        .from("spaces")
        .insert({ host_id: user.id, title: trimmed })
        .select("id")
        .single();
      if (error) throw error;

      // Join as host
      await supabase.from("space_participants").insert({
        space_id: space.id,
        user_id: user.id,
        role: "host",
      });

      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      toast.success("Space started! 🎙️");
      setTitle("");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to create space");
    } finally {
      setCreating(false);
    }
  };

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
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[71] bg-background rounded-t-2xl border-t border-border p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Radio className="w-5 h-5 text-primary" />
                Start a Space
              </h3>
              <button onClick={onClose} className="w-8 h-8 rounded-full glass flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What do you want to talk about?"
              maxLength={100}
              className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
            />

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleCreate}
              disabled={creating || !title.trim()}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
              Go Live
            </motion.button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CreateSpaceModal;
