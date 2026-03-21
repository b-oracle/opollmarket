import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Image, Send, Loader2, BarChart3, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";

const BG_COLORS = [
  "#1a1a2e", "#16213e", "#0f3460", "#533483",
  "#e94560", "#1b1b2f", "#162447", "#1f4068",
  "#e43f5a", "#119da4", "#0c7b93", "#27496d",
];

interface StoryCreatorProps {
  open: boolean;
  onClose: () => void;
  preLinkedMarketId?: string;
  preLinkedMarketTitle?: string;
  preContent?: string;
  preImageUrl?: string;
}

interface MarketResult {
  id: string;
  title: string;
  image_url: string | null;
  yes_price: number;
  no_price: number;
}

const StoryCreator = ({ open, onClose, preLinkedMarketId, preLinkedMarketTitle, preContent, preImageUrl }: StoryCreatorProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [bgColor, setBgColor] = useState(BG_COLORS[0]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<MarketResult | null>(null);
  const [marketSearchOpen, setMarketSearchOpen] = useState(false);
  const [marketQuery, setMarketQuery] = useState("");
  const [marketResults, setMarketResults] = useState<MarketResult[]>([]);
  const [searching, setSearching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [justPosted, setJustPosted] = useState(false);
  const [storyCount, setStoryCount] = useState(0);

  // Pre-link market/content/image when opened from share modal
  useEffect(() => {
    if (open && preLinkedMarketId && !selectedMarket) {
      supabase
        .from("markets")
        .select("id, title, image_url, yes_price, no_price")
        .eq("id", preLinkedMarketId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setSelectedMarket(data as MarketResult);
        });
    }

    if (open && preContent && !content) {
      setContent(preContent);
    }

    if (open && preImageUrl && !imagePreview) {
      setImageFile(null);
      setImagePreview(preImageUrl);
    }
  }, [open, preLinkedMarketId, preContent, preImageUrl, selectedMarket, content, imagePreview]);

  if (!user) return null;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
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


  const resetForm = () => {
    setContent("");
    setImageFile(null);
    setImagePreview(null);
    setSelectedMarket(null);
    setBgColor(BG_COLORS[Math.floor(Math.random() * BG_COLORS.length)]);
    setMarketSearchOpen(false);
    setMarketQuery("");
    setMarketResults([]);
  };

  const handlePost = async () => {
    if (!content.trim() && !imageFile && !imagePreview) return;
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
      } else if (imagePreview && /^https?:\/\//i.test(imagePreview)) {
        image_url = imagePreview;
      }

      const { error } = await supabase.from("stories").insert({
        user_id: user.id,
        content: content.trim() || null,
        image_url,
        background_color: image_url ? null : bgColor,
        market_id: selectedMarket?.id || null,
      });
      if (error) throw error;

      setStoryCount((c) => c + 1);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      setJustPosted(true);
      setTimeout(() => setJustPosted(false), 2000);
      toast.success("Story posted! Add another or close.");
    } catch (err: any) {
      toast.error(err.message || "Failed to post story");
    } finally {
      setPosting(false);
    }
  };

  const handleClose = () => {
    resetForm();
    setStoryCount(0);
    setJustPosted(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center"
        >
          <div className="absolute inset-0 bg-background/95 backdrop-blur-xl" onClick={handleClose} />

          <div className="relative z-10 flex flex-col h-full w-full lg:h-auto lg:max-h-[90vh] lg:max-w-lg lg:rounded-2xl lg:border lg:border-border lg:bg-background lg:shadow-2xl lg:overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ paddingTop: `calc(0.75rem + env(safe-area-inset-top, 0px))` }}>
              <button onClick={handleClose} className="w-9 h-9 rounded-full glass flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
              <div className="text-center">
                <h3 className="text-sm font-bold">Create Story</h3>
                {storyCount > 0 && (
                  <span className="text-[10px] text-muted-foreground">{storyCount} story{storyCount > 1 ? "ies" : ""} posted</span>
                )}
              </div>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handlePost}
                disabled={posting || (!content.trim() && !imageFile && !imagePreview)}
                className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5"
              >
                {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {justPosted ? "Next" : "Share"}
              </motion.button>
            </div>

            {/* Preview */}
            <div className="flex-1 flex items-center justify-center px-6 py-4 lg:py-6">
              <div
                className="w-full max-w-[240px] md:max-w-[300px] lg:max-w-[260px] aspect-[9/16] rounded-2xl overflow-hidden relative"
                style={{ backgroundColor: imagePreview ? "hsl(var(--background))" : bgColor }}
              >
                {imagePreview ? (
                  <div className="h-full w-full flex flex-col">
                    <div className="flex-1 min-h-0 bg-black">
                      <img src={imagePreview} alt="Story" className="w-full h-full object-cover" />
                    </div>
                    <div className="shrink-0 bg-background/95 border-t border-border/40 px-4 py-3">
                      <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Add a caption..."
                        maxLength={200}
                        className="w-full min-h-[72px] bg-transparent text-foreground text-sm leading-relaxed text-center font-semibold resize-none focus:outline-none placeholder:text-muted-foreground break-words"
                      />
                    </div>
                  </div>
                ) : (
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Type your story..."
                    maxLength={200}
                    className="absolute inset-0 w-full h-full bg-transparent text-white text-center text-lg font-bold p-6 resize-none focus:outline-none placeholder:text-white/40 flex items-center justify-center"
                    style={{ textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
                  />
                )}
                {/* Market preview on story */}
                {selectedMarket && (
                  <div className="absolute bottom-4 left-3 right-3 bg-black/60 backdrop-blur-md rounded-xl p-2.5 flex items-center gap-2.5 border border-white/10">
                    {selectedMarket.image_url && (
                      <img src={selectedMarket.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-[10px] font-semibold truncate">{selectedMarket.title}</p>
                      <div className="flex gap-2 mt-0.5">
                        <span className="text-emerald-400 text-[9px] font-bold">Yes {Math.round(Number(selectedMarket.yes_price) * 100)}¢</span>
                        <span className="text-red-400 text-[9px] font-bold">No {Math.round(Number(selectedMarket.no_price) * 100)}¢</span>
                      </div>
                    </div>
                    <button onClick={() => setSelectedMarket(null)} className="text-white/50 hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="px-4 space-y-3 shrink-0 pb-4 lg:pb-6" style={{ paddingBottom: `calc(5rem + env(safe-area-inset-bottom, 0px))` }}>
              {/* Background colors */}
              {!imagePreview && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar px-1 py-1">
                  {BG_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setBgColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-all shrink-0 ${bgColor === c ? "border-primary scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              )}

              {/* Market search picker */}
              {marketSearchOpen && (
                <div className="bg-muted rounded-xl p-3 space-y-2 max-w-md mx-auto w-full">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      value={marketQuery}
                      onChange={(e) => handleMarketSearch(e.target.value)}
                      placeholder="Search markets..."
                      className="pl-8 h-8 text-xs"
                      autoFocus
                    />
                  </div>
                  {searching && <p className="text-[10px] text-muted-foreground text-center">Searching…</p>}
                  {marketResults.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setSelectedMarket(m); setMarketSearchOpen(false); setMarketQuery(""); setMarketResults([]); }}
                      className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-background/60 transition-colors text-left"
                    >
                      {m.image_url && <img src={m.image_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />}
                      <span className="text-xs font-medium truncate flex-1">{m.title}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex justify-center gap-3">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl glass text-sm font-medium hover:bg-muted transition-colors"
                >
                  <Image className="w-4 h-4" />
                  {imagePreview ? "Change Image" : "Add Image"}
                </button>
                <button
                  onClick={() => setMarketSearchOpen(!marketSearchOpen)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl glass text-sm font-medium hover:bg-muted transition-colors ${selectedMarket ? "ring-1 ring-primary" : ""}`}
                >
                  <BarChart3 className="w-4 h-4" />
                  {selectedMarket ? "Change Market" : "Link Market"}
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
