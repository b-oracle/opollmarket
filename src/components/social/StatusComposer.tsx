import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { useCommissionSettings } from "@/hooks/useCommissionSettings";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Image, Loader2, Send, X, BarChart3, Search, Sparkles, Wand2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { optimizedImageUrl } from "@/lib/optimizedImage";

const MAX_CHARS = 280;

interface MarketResult {
  id: string;
  title: string;
  image_url: string | null;
  yes_price: number;
  no_price: number;
}

const StatusComposer = () => {
  const { user } = useAuth();
  const { isFeatureEnabled } = useFeatureToggles();
  const { data: commissionSettings } = useCommissionSettings();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [aiImageUrl, setAiImageUrl] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<MarketResult | null>(null);
  const [marketSearchOpen, setMarketSearchOpen] = useState(false);
  const [marketQuery, setMarketQuery] = useState("");
  const [marketResults, setMarketResults] = useState<MarketResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const showImageUpload = isFeatureEnabled("status_image_upload");
  const showAiGeneration = isFeatureEnabled("ai_social_generation");
  const aiCost = commissionSettings?.ai_generation_cost ?? 0.5;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setAiImageUrl(null);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setAiImageUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleMarketSearch = async (q: string) => {
    setMarketQuery(q);
    if (q.trim().length < 2) { setMarketResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from("markets")
      .select("id, title, image_url, yes_price, no_price")
      .ilike("title", `%${q.trim()}%`)
      .in("status", ["active", "ended"])
      .order("created_at", { ascending: false })
      .limit(5);
    setMarketResults((data as MarketResult[]) || []);
    setSearching(false);
  };

  const selectMarket = (market: MarketResult) => {
    setSelectedMarket(market);
    setMarketSearchOpen(false);
    setMarketQuery("");
    setMarketResults([]);
  };

  const removeMarket = () => {
    setSelectedMarket(null);
  };

  const handleGenerateCaption = async () => {
    const topic = selectedMarket?.title || content.trim();
    if (!topic) {
      toast.error("Link a market or type something first");
      return;
    }
    setGeneratingCaption(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-social-content", {
        body: {
          type: "caption",
          market_title: selectedMarket?.title || null,
          market_category: null,
          user_hint: content.trim() || null,
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      if (data?.content) {
        setContent(data.content);
        toast.success(`Caption generated ($${data.cost || aiCost})`);
        queryClient.invalidateQueries({ queryKey: ["balance"] });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to generate caption");
    } finally {
      setGeneratingCaption(false);
    }
  };

  const handleGenerateImage = async () => {
    const text = content.trim() || selectedMarket?.title;
    if (!text) {
      toast.error("Write a caption first to generate an image");
      return;
    }
    setGeneratingImage(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-social-content", {
        body: {
          type: "image",
          caption: text,
          market_title: selectedMarket?.title || null,
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      if (data?.imageUrl) {
        setAiImageUrl(data.imageUrl);
        setImagePreview(data.imageUrl);
        setImageFile(null);
        toast.success(`Image generated ($${data.cost || aiCost})`);
        queryClient.invalidateQueries({ queryKey: ["balance"] });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to generate image");
    } finally {
      setGeneratingImage(false);
    }
  };

  const handlePost = async () => {
    const trimmed = content.trim();
    if (!trimmed && !imageFile && !aiImageUrl && !selectedMarket) return;
    if (trimmed.length > MAX_CHARS) return;

    setPosting(true);
    try {
      let image_url: string | null = null;

      if (aiImageUrl) {
        image_url = aiImageUrl;
      } else if (imageFile) {
        const { compressImage, webpExtension } = await import("@/lib/imageCompression");
        const compressed = await compressImage(imageFile, "social");
        const ext = webpExtension();
        const path = `${user.id}/status-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("social-media")
          .upload(path, compressed, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("social-media").getPublicUrl(path);
        image_url = urlData.publicUrl;
      } else if (selectedMarket?.image_url) {
        image_url = selectedMarket.image_url;
      }

      const { error } = await supabase.from("status_updates").insert({
        user_id: user.id,
        content: trimmed || (selectedMarket ? selectedMarket.title : ""),
        image_url,
        market_id: selectedMarket?.id || null,
      } as any);
      if (error) throw error;

      setContent("");
      removeImage();
      removeMarket();
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
        placeholder={selectedMarket ? "What do you think about this market?" : "What's happening?"}
        rows={2}
        className="w-full bg-transparent text-sm placeholder:text-muted-foreground resize-none focus:outline-none"
        maxLength={MAX_CHARS + 10}
      />

      {/* Selected market preview */}
      <AnimatePresence>
        {selectedMarket && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="relative rounded-lg border border-border overflow-hidden"
          >
            <div className="flex items-center gap-2 p-2 bg-muted/30">
              {selectedMarket.image_url && (
                <img src={optimizedImageUrl(selectedMarket.image_url, "thumb")} alt="" className="w-10 h-10 rounded object-cover shrink-0" loading="lazy" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{selectedMarket.title}</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="text-emerald-500">Yes {Math.round(selectedMarket.yes_price * 100)}¢</span>
                  <span className="text-rose-500">No {Math.round(selectedMarket.no_price * 100)}¢</span>
                </div>
              </div>
              <button
                onClick={removeMarket}
                className="w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Market search dropdown */}
      <AnimatePresence>
        {marketSearchOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-1"
          >
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={marketQuery}
                onChange={(e) => handleMarketSearch(e.target.value)}
                placeholder="Search markets..."
                className="h-8 text-xs pl-7 bg-muted/30"
                autoFocus
              />
              {searching && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            </div>
            {marketResults.length > 0 && (
              <div className="rounded-lg border border-border bg-popover overflow-hidden max-h-40 overflow-y-auto">
                {marketResults.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => selectMarket(m)}
                    className="w-full flex items-center gap-2 p-2 hover:bg-muted/50 transition-colors text-left"
                  >
                    {m.image_url && (
                      <img src={optimizedImageUrl(m.image_url, "thumb")} alt="" className="w-8 h-8 rounded object-cover shrink-0" loading="lazy" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{m.title}</p>
                      <div className="flex gap-2 text-[10px] text-muted-foreground">
                        <span className="text-emerald-500">Yes {Math.round(m.yes_price * 100)}¢</span>
                        <span className="text-rose-500">No {Math.round(m.no_price * 100)}¢</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

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
        <div className="flex items-center gap-1">
          {/* Link Market button */}
          <button
            onClick={() => {
              setMarketSearchOpen(!marketSearchOpen);
              if (marketSearchOpen) { setMarketQuery(""); setMarketResults([]); }
            }}
            className={`w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors ${
              selectedMarket ? "text-primary" : "text-muted-foreground"
            }`}
            title="Link market"
          >
            <BarChart3 className="w-4 h-4" />
          </button>

          {/* AI Caption button */}
          {showAiGeneration && (
            <button
              onClick={handleGenerateCaption}
              disabled={generatingCaption || (!content.trim() && !selectedMarket)}
              className="relative w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground disabled:opacity-40"
              title={`AI Caption ($${aiCost})`}
            >
              {generatingCaption ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            </button>
          )}

          {/* AI Image button */}
          {showAiGeneration && (
            <button
              onClick={handleGenerateImage}
              disabled={generatingImage || (!content.trim() && !selectedMarket)}
              className="relative w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground disabled:opacity-40"
              title={`AI Image ($${aiCost})`}
            >
              {generatingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            </button>
          )}

          {/* Image upload */}
          {showImageUpload && (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground"
              >
                <Image className="w-4 h-4" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
            </>
          )}

          <span className={`text-[10px] font-medium ml-1 ${overLimit ? "text-destructive" : charsLeft <= 20 ? "text-yellow-500" : "text-muted-foreground"}`}>
            {charsLeft}
          </span>
        </div>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handlePost}
          disabled={posting || (!content.trim() && !imageFile && !aiImageUrl && !selectedMarket) || overLimit}
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
