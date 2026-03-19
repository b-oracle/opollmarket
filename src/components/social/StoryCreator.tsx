import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Image, Send, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const BG_COLORS = [
  "#1a1a2e", "#16213e", "#0f3460", "#533483",
  "#e94560", "#1b1b2f", "#162447", "#1f4068",
  "#e43f5a", "#119da4", "#0c7b93", "#27496d",
];

interface StoryCreatorProps {
  open: boolean;
  onClose: () => void;
}

const StoryCreator = ({ open, onClose }: StoryCreatorProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [bgColor, setBgColor] = useState(BG_COLORS[0]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handlePost = async () => {
    if (!content.trim() && !imageFile) return;
    setPosting(true);
    try {
      let image_url: string | null = null;
      if (imageFile) {
        const ext = imageFile.name.split(".").pop() || "jpg";
        const path = `${user.id}/story-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("social-media").upload(path, imageFile, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("social-media").getPublicUrl(path);
        image_url = urlData.publicUrl;
      }

      const { error } = await supabase.from("stories").insert({
        user_id: user.id,
        content: content.trim() || null,
        image_url,
        background_color: imageFile ? null : bgColor,
      });
      if (error) throw error;

      setContent("");
      setImageFile(null);
      setImagePreview(null);
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      toast.success("Story posted!");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to post story");
    } finally {
      setPosting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex flex-col"
        >
          <div className="absolute inset-0 bg-background/95 backdrop-blur-xl" onClick={onClose} />

          <div className="relative z-10 flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 shrink-0">
              <button onClick={onClose} className="w-9 h-9 rounded-full glass flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-sm font-bold">Create Story</h3>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handlePost}
                disabled={posting || (!content.trim() && !imageFile)}
                className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5"
              >
                {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Share
              </motion.button>
            </div>

            {/* Preview */}
            <div className="flex-1 flex items-center justify-center px-6 py-4">
              <div
                className="w-full max-w-sm aspect-[9/16] rounded-2xl overflow-hidden flex items-center justify-center relative"
                style={{ backgroundColor: imagePreview ? "#000" : bgColor }}
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="Story" className="w-full h-full object-cover" />
                ) : null}
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Type your story..."
                  maxLength={200}
                  className="absolute inset-0 w-full h-full bg-transparent text-white text-center text-lg font-bold p-6 resize-none focus:outline-none placeholder:text-white/40 flex items-center justify-center"
                  style={{ textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
                />
              </div>
            </div>

            {/* Controls */}
            <div className="px-4 pb-6 space-y-3 shrink-0">
              {/* Background colors */}
              {!imagePreview && (
                <div className="flex gap-2 justify-center flex-wrap">
                  {BG_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setBgColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${bgColor === c ? "border-primary scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              )}
              <div className="flex justify-center">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl glass text-sm font-medium hover:bg-muted transition-colors"
                >
                  <Image className="w-4 h-4" />
                  {imagePreview ? "Change Image" : "Add Image"}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default StoryCreator;
