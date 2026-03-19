import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Image, Loader2, Send, X } from "lucide-react";
import { motion } from "framer-motion";

const MAX_CHARS = 280;

const StatusComposer = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handlePost = async () => {
    const trimmed = content.trim();
    if (!trimmed && !imageFile) return;
    if (trimmed.length > MAX_CHARS) return;

    setPosting(true);
    try {
      let image_url: string | null = null;

      if (imageFile) {
        const ext = imageFile.name.split(".").pop() || "jpg";
        const path = `${user.id}/status-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("social-media")
          .upload(path, imageFile, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("social-media").getPublicUrl(path);
        image_url = urlData.publicUrl;
      }

      const { error } = await supabase.from("status_updates").insert({
        user_id: user.id,
        content: trimmed,
        image_url,
      });
      if (error) throw error;

      setContent("");
      removeImage();
      queryClient.invalidateQueries({ queryKey: ["status-feed"] });
      queryClient.invalidateQueries({ queryKey: ["activity-statuses"] });
      toast.success("Posted!");
    } catch (err: any) {
      toast.error(err.message || "Failed to post");
    } finally {
      setPosting(false);
    }
  };

  const charsLeft = MAX_CHARS - content.length;
  const overLimit = charsLeft < 0;

  return (
    <div className="glass rounded-xl p-3 space-y-2">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What's happening?"
        rows={2}
        className="w-full bg-transparent text-sm placeholder:text-muted-foreground resize-none focus:outline-none"
        maxLength={MAX_CHARS + 10}
      />

      {imagePreview && (
        <div className="relative inline-block">
          <img src={imagePreview} alt="Preview" className="h-24 rounded-lg object-cover" />
          <button
            onClick={removeImage}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground"
          >
            <Image className="w-4 h-4" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
          <span className={`text-[10px] font-medium ${overLimit ? "text-destructive" : charsLeft <= 20 ? "text-yellow-500" : "text-muted-foreground"}`}>
            {charsLeft}
          </span>
        </div>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handlePost}
          disabled={posting || (!content.trim() && !imageFile) || overLimit}
          className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5 transition-colors"
        >
          {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Post
        </motion.button>
      </div>
    </div>
  );
};

export default StatusComposer;
