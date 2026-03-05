import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  ImageIcon,
  FileText,
  Tag,
  Calendar,
  Plus,
  X,
  Loader2,
  Upload,
  BarChart3,
  Target,
  CheckCircle2,
  Video,
} from "lucide-react";

import CategoryIcon from "@/components/CategoryIcon";
import { isYouTubeUrl, getYouTubeId } from "@/components/YouTubeEmbed";

const CATEGORIES = [
  "Crypto", "AI & Tech", "Science", "Economy",
  "Entertainment", "Sports", "Politics", "Other",
];

const AdminCreateMarket = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [endDate, setEndDate] = useState("");
  const [resolutionSource, setResolutionSource] = useState("");
  const [initialLiquidity, setInitialLiquidity] = useState("100");
  const [marketType, setMarketType] = useState<"binary" | "multi">("binary");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [trending, setTrending] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");

  // Image state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [shakeField, setShakeField] = useState<string | null>(null);

  const touch = (field: string) => setTouched((t) => ({ ...t, [field]: true }));
  const shake = (field: string) => {
    setShakeField(field);
    setTimeout(() => setShakeField(null), 500);
  };

  // Field-level validation
  const errors = {
    title: title.trim().length > 0 && title.trim().length < 10 ? "Min 10 characters" : title.trim().length === 0 ? "Required" : "",
    description: description.trim().length > 0 && description.trim().length < 10 ? "Min 10 characters" : description.trim().length === 0 ? "Required" : "",
    category: !category ? "Select a category" : "",
    endDate: !endDate ? "Required" : "",
    resolutionSource: resolutionSource.trim().length > 0 && resolutionSource.trim().length < 5 ? "Min 5 characters" : resolutionSource.trim().length === 0 ? "Required" : "",
    options: marketType === "multi" && options.filter((o) => o.trim()).length < 2 ? "At least 2 options required" : "",
  };

  const fieldError = (field: keyof typeof errors) => touched[field] ? errors[field] : "";
  const inputBorder = (field: keyof typeof errors) =>
    fieldError(field)
      ? "border-destructive focus:ring-destructive/30"
      : "border-border focus:ring-primary/30";
  const shakeClass = (field: string) => shakeField === field ? "animate-shake" : "";

  const addOption = () => {
    if (options.length < 6) setOptions([...options, ""]);
  };
  const removeOption = (idx: number) => {
    if (options.length > 2) setOptions(options.filter((_, i) => i !== idx));
  };
  const updateOption = (idx: number, val: string) => {
    setOptions(options.map((o, i) => (i === idx ? val : o)));
  };

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
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return null;
    setUploadingImage(true);
    const ext = imageFile.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage
      .from("market-images")
      .upload(fileName, imageFile, { contentType: imageFile.type });
    setUploadingImage(false);
    if (error) {
      console.error("Image upload error:", error);
      toast.error("Failed to upload image");
      return null;
    }
    const { data: urlData } = supabase.storage
      .from("market-images")
      .getPublicUrl(fileName);
    return urlData.publicUrl;
  };

  const isValid =
    title.trim().length >= 10 &&
    description.trim().length >= 10 &&
    category &&
    endDate &&
    resolutionSource.trim().length >= 5 &&
    (marketType === "binary" || options.filter((o) => o.trim()).length >= 2);

  const handleSubmit = async () => {
    // Touch all fields on submit attempt
    const allFields = ["title", "description", "category", "endDate", "resolutionSource", "options"];
    setTouched(allFields.reduce((acc, f) => ({ ...acc, [f]: true }), {}));

    if (!isValid || !user) {
      // Shake first invalid field
      const firstInvalid = allFields.find((f) => errors[f as keyof typeof errors]);
      if (firstInvalid) shake(firstInvalid);
      return;
    }
    setSubmitting(true);

    try {
      // Upload image if present
      let imageUrl: string | null = null;
      if (imageFile) {
        imageUrl = await uploadImage();
        if (!imageUrl) { setSubmitting(false); return; }

        // Moderate uploaded image
        try {
          const { data: imgModData } = await supabase.functions.invoke("moderate-image", {
            body: { image_url: imageUrl },
          });
          if (imgModData?.flagged) {
            await supabase.from("moderation_logs").insert({
              content_type: "image",
              user_id: user.id,
              flagged_content: imageUrl,
              reason: imgModData.reason || "Flagged by AI",
              category: imgModData.category || "nsfw",
            });
            toast.error(imgModData.reason || "This image was flagged as inappropriate");
            setSubmitting(false);
            return;
          }
        } catch (err) {
          console.error("Image moderation check failed, proceeding:", err);
        }
      }

      // Create market
      const { data, error } = await supabase
        .from("markets")
        .insert({
          creator_wallet: user.id,
          creator_name: user.user_metadata?.display_name || user.email?.split("@")[0] || "Admin",
          title: title.trim(),
          description: description.trim(),
          category,
          end_date: endDate,
          resolution_source: resolutionSource.trim(),
          initial_liquidity: parseFloat(initialLiquidity) || 100,
          liquidity: parseFloat(initialLiquidity) || 100,
          market_type: marketType,
          image_url: imageUrl,
          video_url: mediaType === "video" && videoUrl.trim() && isYouTubeUrl(videoUrl.trim()) ? videoUrl.trim() : null,
          trending,
          status: "active",
        })
        .select("id")
        .maybeSingle();

      if (error) throw error;

      // Save options for multi markets
      if (marketType === "multi" && data?.id) {
        const validOptions = options.filter((o) => o.trim());
        const equalPrice = Math.round((1 / validOptions.length) * 100) / 100;
        await supabase.from("market_options").insert(
          validOptions.map((label, i) => ({
            market_id: data.id,
            label: label.trim(),
            price: equalPrice,
            sort_order: i,
          }))
        );
      }

      toast.success("Market created successfully!");
      navigate("/admin/markets");
    } catch (err: any) {
      console.error("Create market error:", err);
      toast.error(err?.message || "Failed to create market");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl pb-10">
      <div>
        <h2 className="text-2xl font-bold">Create Market</h2>
        <p className="text-sm text-muted-foreground">Create a new prediction market as an admin.</p>
      </div>

      {/* Market Type */}
      <div className="bg-card border border-border rounded-xl p-5">
        <label className="flex items-center gap-2 text-sm font-semibold mb-3">
          <BarChart3 className="w-4 h-4 text-primary" />
          Market Type
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMarketType("binary")}
            className={`p-3 rounded-xl border-2 text-center text-sm font-medium transition-all ${
              marketType === "binary"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-primary/30 text-muted-foreground"
            }`}
          >
            <Target className="w-5 h-5 mx-auto mb-1" />
            Binary (Yes / No)
          </button>
          <button
            onClick={() => setMarketType("multi")}
            className={`p-3 rounded-xl border-2 text-center text-sm font-medium transition-all ${
              marketType === "multi"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-primary/30 text-muted-foreground"
            }`}
          >
            <BarChart3 className="w-5 h-5 mx-auto mb-1" />
            Multiple Choice
          </button>
        </div>
      </div>

      {/* Title & Description */}
      <div className={`bg-card border border-border rounded-xl p-5 space-y-4`}>
        <div className={shakeClass("title")}>
          <label className="flex items-center gap-2 text-sm font-semibold mb-2">
            <FileText className="w-4 h-4 text-primary" />
            Market Question
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => touch("title")}
            placeholder="Will Bitcoin hit $150K before July 2026?"
            maxLength={120}
            className={`w-full bg-muted/50 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 transition-colors ${inputBorder("title")}`}
          />
          <div className="flex justify-between mt-1">
            {fieldError("title") ? (
              <p className="text-[11px] text-destructive">{fieldError("title")}</p>
            ) : <span />}
            <p className="text-[10px] text-muted-foreground">{title.length}/120</p>
          </div>
        </div>
        <div className={shakeClass("description")}>
          <label className="text-sm font-semibold mb-2 block">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => touch("description")}
            placeholder="Provide context and resolution criteria..."
            rows={3}
            className={`w-full bg-muted/50 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 resize-none transition-colors ${inputBorder("description")}`}
          />
          {fieldError("description") && (
            <p className="text-[11px] text-destructive mt-1">{fieldError("description")}</p>
          )}
        </div>
      </div>

      {/* Options for multi */}
      <AnimatePresence>
        {marketType === "multi" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className={`bg-card border rounded-xl p-5 ${shakeClass("options")} ${fieldError("options") ? "border-destructive" : "border-border"}`}
          >
            <label className="text-sm font-semibold mb-3 block">Options (2–6)</label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    className={`flex-1 bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30`}
                    onBlur={() => touch("options")}
                  />
                  {options.length > 2 && (
                    <button onClick={() => removeOption(i)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 6 && (
              <button onClick={addOption} className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80">
                <Plus className="w-3.5 h-3.5" /> Add Option
              </button>
            )}
            {fieldError("options") && (
              <p className="text-[11px] text-destructive mt-2">{fieldError("options")}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Media Upload */}
      <div className="bg-card border border-border rounded-xl p-5">
        <label className="flex items-center gap-2 text-sm font-semibold mb-3">
          {mediaType === "video" ? <Video className="w-4 h-4 text-primary" /> : <ImageIcon className="w-4 h-4 text-primary" />}
          Cover Media
        </label>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            onClick={() => setMediaType("image")}
            className={`p-2.5 rounded-xl border-2 text-center text-xs font-medium transition-all ${
              mediaType === "image"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-primary/30 text-muted-foreground"
            }`}
          >
            <ImageIcon className="w-4 h-4 mx-auto mb-0.5" />
            Image
          </button>
          <button
            onClick={() => setMediaType("video")}
            className={`p-2.5 rounded-xl border-2 text-center text-xs font-medium transition-all ${
              mediaType === "video"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-primary/30 text-muted-foreground"
            }`}
          >
            <Video className="w-4 h-4 mx-auto mb-0.5" />
            YouTube Video
          </button>
        </div>

        {mediaType === "image" ? (
          <>
            {imagePreview ? (
              <div className="relative rounded-xl overflow-hidden">
                <img src={imagePreview} alt="Preview" className="w-full h-40 object-cover rounded-xl" />
                <button
                  onClick={removeImage}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-32 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 hover:border-primary/40 hover:bg-primary/5 transition-all"
              >
                <Upload className="w-6 h-6 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Click to upload (max 5MB)</span>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
          </>
        ) : (
          <div className="space-y-3">
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {videoUrl && isYouTubeUrl(videoUrl) && (
              <div className="rounded-xl overflow-hidden aspect-video">
                <iframe
                  src={`https://www.youtube.com/embed/${getYouTubeId(videoUrl)}?rel=0`}
                  className="w-full h-full"
                  title="YouTube preview"
                  allowFullScreen
                  loading="lazy"
                />
              </div>
            )}
            {videoUrl && !isYouTubeUrl(videoUrl) && (
              <p className="text-xs text-destructive">Please enter a valid YouTube URL</p>
            )}
          </div>
        )}
      </div>

      {/* Category & Settings */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className={shakeClass("category")}>
          <label className="flex items-center gap-2 text-sm font-semibold mb-3">
            <Tag className="w-4 h-4 text-primary" />
            Category
          </label>
          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl ${fieldError("category") ? "ring-1 ring-destructive p-1" : ""}`}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => { setCategory(cat); touch("category"); }}
                className={`p-2 rounded-xl border text-center text-xs font-medium transition-all ${
                  category === cat
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-primary/30 text-muted-foreground"
                }`}
              >
                <span className="block mb-0.5"><CategoryIcon category={cat} className="w-4 h-4 mx-auto" /></span>
                {cat}
              </button>
            ))}
          </div>
          {fieldError("category") && (
            <p className="text-[11px] text-destructive mt-1.5">{fieldError("category")}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className={shakeClass("endDate")}>
            <label className="flex items-center gap-2 text-sm font-semibold mb-2">
              <Calendar className="w-4 h-4 text-primary" />
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              onBlur={() => touch("endDate")}
              min={new Date().toISOString().split("T")[0]}
              className={`w-full bg-muted/50 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 transition-colors ${inputBorder("endDate")}`}
            />
            {fieldError("endDate") && (
              <p className="text-[11px] text-destructive mt-1">{fieldError("endDate")}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-semibold mb-2 block">Initial Liquidity</label>
            <input
              type="number"
              value={initialLiquidity}
              onChange={(e) => setInitialLiquidity(e.target.value)}
              placeholder="100"
              min={0}
              className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className={shakeClass("resolutionSource")}>
          <label className="text-sm font-semibold mb-2 block">Resolution Source</label>
          <input
            type="text"
            value={resolutionSource}
            onChange={(e) => setResolutionSource(e.target.value)}
            onBlur={() => touch("resolutionSource")}
            placeholder="e.g. CoinGecko price data, official announcement..."
            className={`w-full bg-muted/50 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 transition-colors ${inputBorder("resolutionSource")}`}
          />
          {fieldError("resolutionSource") && (
            <p className="text-[11px] text-destructive mt-1">{fieldError("resolutionSource")}</p>
          )}
        </div>

        {/* Trending toggle */}
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-semibold">Mark as Trending</p>
            <p className="text-xs text-muted-foreground">Shows in the trending section on the homepage</p>
          </div>
          <button
            onClick={() => setTrending(!trending)}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              trending ? "bg-primary" : "bg-muted"
            }`}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                trending ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>



      {/* Submit */}
      <div className="flex gap-3">
        <button
          onClick={() => navigate("/admin/markets")}
          className="flex-1 py-3.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors active:scale-[0.98]"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!isValid || submitting}
          className="flex-1 py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {uploadingImage ? "Uploading Image..." : "Creating..."}
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Create Market
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default AdminCreateMarket;
