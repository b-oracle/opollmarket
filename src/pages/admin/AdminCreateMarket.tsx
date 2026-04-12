import { useState, useRef, useEffect, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
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
  Eye,
  EyeOff,
  Zap,
  Trophy,
  Sparkles,
  Twitter,
  Mic,
  MicOff,
} from "lucide-react";

import CategoryIcon from "@/components/CategoryIcon";
import ReactMarkdown from "react-markdown";
import FixtureSearch from "@/components/FixtureSearch";
import { isYouTubeUrl, getYouTubeId } from "@/components/YouTubeEmbed";
import { isPriceAutoResolveCategory, getAssetsForCategory, getAssetClassLabel, getResolutionSource } from "@/data/assetClasses";

const CATEGORIES = [
  "Crypto", "Commodities", "Forex", "AI & Tech", "Science", "Economy",
  "Entertainment", "Sports", "Politics", "Twitter/X", "Other",
];

const AdminCreateMarket = () => {
  const navigate = useNavigate();
  const { user, displayName } = useAuth();
  const { isFeatureEnabled } = useFeatureToggles();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [endDate, setEndDate] = useState("");
  const [resolutionSource, setResolutionSource] = useState("");
  const [initialLiquidity, setInitialLiquidity] = useState("100");
  const [initialVolume, setInitialVolume] = useState("0");
  const [initialTraders, setInitialTraders] = useState("0");
  const [marketType, setMarketType] = useState<"binary" | "multi">("binary");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [trending, setTrending] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [details, setDetails] = useState("");
  const [showDetailsPreview, setShowDetailsPreview] = useState(false);

  // Auto-resolve state
  const [autoResolve, setAutoResolve] = useState(false);
  const [autoResolveAsset, setAutoResolveAsset] = useState("BTC");
  const [autoResolveOperator, setAutoResolveOperator] = useState("at_or_above");
  const [autoResolveTargetPrice, setAutoResolveTargetPrice] = useState("");
  const [autoResolveTime, setAutoResolveTime] = useState("00:00");

  // Sports auto-resolve state
  const [sportType, setSportType] = useState("football");
  const [sportMatchId, setSportMatchId] = useState("");
  const [sportPredictedOutcome, setSportPredictedOutcome] = useState("");
  const [sportLeague, setSportLeague] = useState("");
  const [selectedFixtureData, setSelectedFixtureData] = useState<{ homeTeam: string; awayTeam: string; date: string; league: string; venue: string } | null>(null);

  // Twitter engagement market state
  const [twitterMetricType, setTwitterMetricType] = useState<"likes" | "replies" | "retweets" | "tweets">("likes");
  const [twitterResourceId, setTwitterResourceId] = useState("");
  const [twitterBrackets, setTwitterBrackets] = useState<string[]>(["0-19", "20-39", "40-59", "60-79", "80-99", "> 99"]);

  const generateSportsAutoFill = (fixture: { homeTeam: string; awayTeam: string; date: string; league: string; venue: string }, outcome: string) => {
    const matchDate = (() => { try { return new Date(fixture.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return fixture.date; } })();
    const isMma = sportType === "mma";
    let newTitle: string;
    let newDesc: string;
    if (isMma) {
      if (outcome.includes(fixture.homeTeam)) {
        newTitle = `Will ${fixture.homeTeam} beat ${fixture.awayTeam} on ${matchDate}?`;
        newDesc = `This market resolves YES if ${fixture.homeTeam} defeats ${fixture.awayTeam} in their ${fixture.league || "UFC"} fight scheduled for ${matchDate}. It resolves NO otherwise.`;
      } else if (outcome.includes(fixture.awayTeam)) {
        newTitle = `Will ${fixture.awayTeam} beat ${fixture.homeTeam} on ${matchDate}?`;
        newDesc = `This market resolves YES if ${fixture.awayTeam} defeats ${fixture.homeTeam} in their ${fixture.league || "UFC"} fight scheduled for ${matchDate}. It resolves NO otherwise.`;
      } else if (outcome) {
        newTitle = `Will "${outcome}" happen in ${fixture.homeTeam} vs ${fixture.awayTeam} on ${matchDate}?`;
        newDesc = `This market resolves YES if the condition "${outcome}" is met in the ${fixture.league || "UFC"} fight between ${fixture.homeTeam} and ${fixture.awayTeam} on ${matchDate}.`;
      } else {
        newTitle = `Will ${fixture.homeTeam} beat ${fixture.awayTeam} on ${matchDate}?`;
        newDesc = `This market resolves YES if ${fixture.homeTeam} defeats ${fixture.awayTeam} in their ${fixture.league || "UFC"} fight scheduled for ${matchDate}. It resolves NO otherwise.`;
      }
    } else if (outcome === "home_win") {
      newTitle = `Will ${fixture.homeTeam} beat ${fixture.awayTeam} on ${matchDate}?`;
      newDesc = `This market resolves YES if ${fixture.homeTeam} defeats ${fixture.awayTeam} in their ${fixture.league || sportType} match scheduled for ${matchDate}. It resolves NO otherwise (including a draw).`;
    } else if (outcome === "away_win") {
      newTitle = `Will ${fixture.awayTeam} beat ${fixture.homeTeam} on ${matchDate}?`;
      newDesc = `This market resolves YES if ${fixture.awayTeam} defeats ${fixture.homeTeam} in their ${fixture.league || sportType} match scheduled for ${matchDate}. It resolves NO otherwise (including a draw).`;
    } else if (outcome === "draw") {
      newTitle = `Will ${fixture.homeTeam} vs ${fixture.awayTeam} end in a draw on ${matchDate}?`;
      newDesc = `This market resolves YES if the ${fixture.league || sportType} match between ${fixture.homeTeam} and ${fixture.awayTeam} on ${matchDate} ends in a draw. It resolves NO if either team wins.`;
    } else if (outcome) {
      newTitle = `Will "${outcome.replace(/_/g, " ")}" happen in ${fixture.homeTeam} vs ${fixture.awayTeam} on ${matchDate}?`;
      newDesc = `This market resolves YES if the condition "${outcome.replace(/_/g, " ")}" is met in the ${fixture.league || sportType} match between ${fixture.homeTeam} and ${fixture.awayTeam} on ${matchDate}.`;
    } else {
      newTitle = `Will ${fixture.homeTeam} beat ${fixture.awayTeam} on ${matchDate}?`;
      newDesc = `This market resolves YES if ${fixture.homeTeam} defeats ${fixture.awayTeam} in their ${fixture.league || sportType} match scheduled for ${matchDate}. It resolves NO otherwise.`;
    }
    setTitle(newTitle);
    setDescription(newDesc);
  };

  const priceAssets = getAssetsForCategory(category);
  const OPERATORS = [
    { value: "at_or_above", label: "Reaches or exceeds" },
    { value: "above", label: "Closes above" },
    { value: "at_or_below", label: "Drops to or below" },
    { value: "below", label: "Closes below" },
  ];
  const SPORT_TYPES = [
    { value: "football", label: "Football (Soccer)", enabled: true },
    { value: "mma", label: "MMA / UFC", enabled: true },
    { value: "basketball", label: "Basketball", enabled: false },
    { value: "nfl", label: "American Football", enabled: false },
    { value: "baseball", label: "Baseball", enabled: false },
    { value: "hockey", label: "Hockey", enabled: false },
    { value: "formula1", label: "Formula 1", enabled: false },
    { value: "rugby", label: "Rugby", enabled: false },
    { value: "volleyball", label: "Volleyball", enabled: false },
    { value: "handball", label: "Handball", enabled: false },
  ];
  const isMmaSport = sportType === "mma";
  const OUTCOME_TYPES = isMmaSport
    ? [
        { value: selectedFixtureData ? `${selectedFixtureData.homeTeam} Win` : "fighter1_win", label: selectedFixtureData?.homeTeam || "Fighter 1" },
        { value: selectedFixtureData ? `${selectedFixtureData.awayTeam} Win` : "fighter2_win", label: selectedFixtureData?.awayTeam || "Fighter 2" },
      ]
    : [
        { value: "home_win", label: "Home Win" },
        { value: "away_win", label: "Away Win" },
        { value: "draw", label: "Draw" },
      ];

  // AI generation state
  const [aiGenerationCost, setAiGenerationCost] = useState(0.5);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [generatingDetails, setGeneratingDetails] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [pendingAiType, setPendingAiType] = useState<"description" | "details" | "image" | null>(null);

  // AI Agent state
  const [aiAgentOpen, setAiAgentOpen] = useState(false);
  const [aiAgentPrompt, setAiAgentPrompt] = useState("");
  const [aiAgentLoading, setAiAgentLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const toggleVoiceInput = useCallback(() => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition is not supported in your browser");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    let finalTranscript = "";
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setAiAgentPrompt((prev) => finalTranscript || (prev + interim ? prev : interim));
    };
    recognition.onend = () => {
      setIsListening(false);
      if (finalTranscript) setAiAgentPrompt(finalTranscript);
    };
    recognition.onerror = (e: any) => {
      setIsListening(false);
      if (e.error !== "aborted") toast.error("Voice input error: " + e.error);
    };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  const handleAiAgent = async () => {
    if (!user) { toast.error("Sign in first"); return; }
    if (!aiAgentPrompt.trim()) { toast.error("Enter a prompt"); return; }
    setAiAgentLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-create-market", {
        body: { prompt: aiAgentPrompt.trim() },
      });
      if (error) { toast.error("AI generation failed"); return; }
      if (data?.error) { toast.error(data.error); return; }
      const m = data.market;
      if (!m) { toast.error("No market data returned"); return; }
      setTitle(m.title || "");
      setDescription(m.description || "");
      setDetails(m.details || "");
      setCategory(m.category || "");
      setEndDate(m.endDate || "");
      setResolutionSource(m.resolutionSource || "");
      setMarketType(m.marketType === "multi" ? "multi" : "binary");
      if (m.options?.length) setOptions(m.options);
      if (m.autoResolve) {
        setAutoResolve(true);
        if (m.autoResolveAsset) setAutoResolveAsset(m.autoResolveAsset);
        if (m.autoResolveOperator) setAutoResolveOperator(m.autoResolveOperator);
        if (m.autoResolveTargetPrice) setAutoResolveTargetPrice(String(m.autoResolveTargetPrice));
      }
      if (m.sportType) setSportType(m.sportType);
      if (m.sportPredictedOutcome) setSportPredictedOutcome(m.sportPredictedOutcome);
      setAiAgentOpen(false);
      toast.success(`Market generated! $${(data.cost ?? 0).toFixed(2)} charged.`);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setAiAgentLoading(false);
    }
  };

  // Image state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [shakeField, setShakeField] = useState<string | null>(null);

  // Load AI generation cost
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("public_commission_settings" as any)
        .select("ai_generation_cost")
        .limit(1)
        .single();
      if (data) setAiGenerationCost(Number((data as any).ai_generation_cost ?? 0.5));
    })();
  }, []);

  // AI content generation handler
  const handleAiGenerate = async (genType: "description" | "details" | "image") => {
    if (!user) { toast.error("Sign in to use AI generation"); return; }
    if (!title.trim()) { toast.error("Enter a market question first"); return; }

    const setLoading = genType === "description" ? setGeneratingDesc : genType === "details" ? setGeneratingDetails : setGeneratingImage;
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("generate-market-content", {
        body: {
          type: genType,
          title: title.trim(),
          category: category || undefined,
          marketType,
          options: marketType !== "binary" ? options.filter(o => o.trim()) : undefined,
        },
      });

      if (error) {
        const msg = typeof data === "object" && data?.error ? data.error : error.message || "AI generation failed";
        toast.error(msg);
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      if (genType === "description" && data?.content) {
        setDescription(data.content);
        toast.success(`Description generated! ($${data.cost || aiGenerationCost} charged)`);
      } else if (genType === "details" && data?.content) {
        setDetails(data.content);
        toast.success(`Details generated! ($${data.cost || aiGenerationCost} charged)`);
      } else if (genType === "image" && data?.imageUrl) {
        setImagePreview(data.imageUrl);
        setImageFile(null);
        toast.success(`Cover image generated! ($${data.cost || aiGenerationCost} charged)`);
      } else {
        toast.error("No content was generated");
      }
    } catch (err: any) {
      toast.error(err.message || "AI generation failed");
    } finally {
      setLoading(false);
    }
  };

  const touch = (field: string) => setTouched((t) => ({ ...t, [field]: true }));
  const shake = (field: string) => {
    setShakeField(field);
    setTimeout(() => setShakeField(null), 500);
  };

  // Field-level validation
  const hasImage = !!imageFile || (!!imagePreview && !imagePreview.startsWith("blob:"));
  const errors = {
    title: title.trim().length > 0 && title.trim().length < 10 ? "Min 10 characters" : title.trim().length === 0 ? "Required" : "",
    description: description.trim().length > 0 && description.trim().length < 10 ? "Min 10 characters" : description.trim().length === 0 ? "Required" : "",
    details: details.trim().length === 0 ? "Required" : details.trim().length < 20 ? "Min 20 characters" : "",
    category: !category ? "Select a category" : "",
    endDate: !endDate ? "Required" : (category === "Twitter/X" && twitterResourceId.trim() && new Date(endDate) > new Date(Date.now() + 5 * 86400000)) ? "Twitter/X markets: max 5 days" : "",
    resolutionSource: resolutionSource.trim().length > 0 && resolutionSource.trim().length < 5 ? "Min 5 characters" : resolutionSource.trim().length === 0 ? "Required" : "",
    options: marketType === "multi" && options.filter((o) => o.trim()).length < 2 ? "At least 2 options required" : "",
    image: !hasImage ? "Cover image is required" : "",
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
    if (!imageFile || !user) return null;
    setUploadingImage(true);
    const { compressImage, webpExtension } = await import("@/lib/imageCompression");
    const compressed = await compressImage(imageFile, "market-banner");
    const ext = webpExtension();
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage
      .from("market-images")
      .upload(fileName, compressed, { contentType: compressed.type });
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
    details.trim().length >= 20 &&
    category &&
    endDate &&
    resolutionSource.trim().length >= 5 &&
    (marketType === "binary" || options.filter((o) => o.trim()).length >= 2) &&
    hasImage;

  const handleSubmit = async () => {
    const allFields = ["title", "description", "details", "category", "endDate", "resolutionSource", "options", "image"];
    setTouched(allFields.reduce((acc, f) => ({ ...acc, [f]: true }), {}));

    if (!isValid || !user) {
      // Shake first invalid field
      const firstInvalid = allFields.find((f) => errors[f as keyof typeof errors]);
      if (firstInvalid) shake(firstInvalid);
      return;
    }
    setSubmitting(true);

    try {
      // Upload image if present (file upload or AI-generated URL)
      let imageUrl: string | null = null;
      if (imageFile) {
        imageUrl = await uploadImage();
        if (!imageUrl) { setSubmitting(false); return; }
      } else if (imagePreview && !imagePreview.startsWith("blob:")) {
        imageUrl = imagePreview;
      }

      if (imageUrl) {

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
      const isTwitterMarket = category === "Twitter/X" && twitterResourceId.trim();
      const autoResolveDeadline = (autoResolve || isTwitterMarket) && endDate && autoResolveTime
        ? new Date(`${endDate}T${autoResolveTime}:00Z`).toISOString()
        : null;

      const effectiveMarketType = isTwitterMarket ? "multi" : (autoResolve ? "binary" : marketType);

      const { data, error } = await supabase
        .from("markets")
        .insert({
          creator_wallet: user.id,
          creator_name: displayName,
          title: title.trim(),
          description: description.trim(),
          category: isTwitterMarket ? "Entertainment" : category,
          end_date: endDate,
          resolution_source: resolutionSource.trim(),
          initial_liquidity: parseFloat(initialLiquidity) || 100,
          liquidity: parseFloat(initialLiquidity) || 100,
          volume: 0,
          participants: 0,
          simulated_volume: parseFloat(initialVolume) || 0,
          simulated_participants: parseInt(initialTraders) || 0,
          market_type: effectiveMarketType,
          image_url: imageUrl,
          video_url: mediaType === "video" && videoUrl.trim() && isYouTubeUrl(videoUrl.trim()) ? videoUrl.trim() : null,
          details: details.trim() || null,
          trending,
          status: "active",
          auto_resolve: autoResolve || !!isTwitterMarket,
          auto_resolve_asset: autoResolve && isPriceAutoResolveCategory(category) ? autoResolveAsset : null,
          auto_resolve_target_price: autoResolve && isPriceAutoResolveCategory(category) ? parseFloat(autoResolveTargetPrice) : null,
          auto_resolve_operator: autoResolve && isPriceAutoResolveCategory(category) ? autoResolveOperator : null,
          auto_resolve_deadline: autoResolveDeadline,
          sport_type: autoResolve && category === "Sports" ? sportType : null,
          sport_match_id: autoResolve && category === "Sports" ? sportMatchId : null,
          sport_predicted_outcome: autoResolve && category === "Sports" ? sportPredictedOutcome : null,
          sport_league: autoResolve && category === "Sports" ? sportLeague || null : null,
          twitter_metric_type: isTwitterMarket ? twitterMetricType : null,
          twitter_resource_id: isTwitterMarket ? twitterResourceId.trim() : null,
          twitter_current_count: 0,
        } as any)
        .select("id")
        .maybeSingle();

      if (error) throw error;

      // Save options for multi markets or Twitter bracket markets
      const shouldSaveOptions = (effectiveMarketType === "multi" && data?.id);
      if (shouldSaveOptions) {
        const optionLabels = isTwitterMarket
          ? twitterBrackets.filter((b) => b.trim())
          : options.filter((o) => o.trim());
        const equalPrice = Math.round((1 / optionLabels.length) * 100) / 100;
        await supabase.from("market_options").insert(
          optionLabels.map((label, i) => ({
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
    <>
    <div className="space-y-6 max-w-2xl pb-10">
      <div>
        <h2 className="text-2xl font-bold">Create Market</h2>
        <p className="text-sm text-muted-foreground">Create a new prediction market via the System-Mod Engine.</p>
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

      {/* AI Agent Section */}
      {isFeatureEnabled("ai_market_creation") && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setAiAgentOpen(!aiAgentOpen)}
            className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold hover:bg-muted/30 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              AI Market Agent — Create from Prompt
            </span>
            <span className="text-xs text-muted-foreground">{aiAgentOpen ? "▲" : "▼"}</span>
          </button>
          <AnimatePresence>
            {aiAgentOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-5 pb-4 space-y-3">
                  <p className="text-[11px] text-muted-foreground">
                    Describe the market and AI will fill in all fields. Cost: ${aiGenerationCost.toFixed(2)}
                  </p>
                  <textarea
                    value={aiAgentPrompt}
                    onChange={(e) => setAiAgentPrompt(e.target.value)}
                    placeholder="e.g. Create an auto resolve market: Will Tyson Fury fight Anthony Joshua before December 2026?"
                    rows={3}
                    className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-none"
                    maxLength={500}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleVoiceInput}
                      className={`flex items-center justify-center w-10 h-10 rounded-xl border transition-all ${
                        isListening
                          ? "bg-destructive/10 border-destructive text-destructive animate-pulse"
                          : "bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                      title={isListening ? "Stop listening" : "Voice input"}
                    >
                      {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={handleAiAgent}
                      disabled={aiAgentLoading || !aiAgentPrompt.trim()}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {aiAgentLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                      {aiAgentLoading ? "Generating..." : `Generate Market — $${aiGenerationCost.toFixed(2)}`}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

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
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold">Description</label>
            {isFeatureEnabled("ai_generate_description") && (
              <button
                type="button"
                onClick={() => setPendingAiType("description")}
                disabled={generatingDesc || !title.trim()}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {generatingDesc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Generate (${aiGenerationCost})
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mb-1.5">Type manually for free, or use AI to generate for a fee.</p>
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

        {/* More Details (Markdown) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="w-4 h-4 text-primary" />
              More Details <span className="text-xs font-normal text-destructive">*</span>
            </label>
            <div className="flex items-center gap-2">
              {isFeatureEnabled("ai_generate_details") && (
                <button
                  type="button"
                  onClick={() => setPendingAiType("details")}
                  disabled={generatingDetails || !title.trim()}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {generatingDetails ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Generate (${aiGenerationCost})
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowDetailsPreview(!showDetailsPreview)}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                {showDetailsPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showDetailsPreview ? "Edit" : "Preview"}
              </button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mb-1.5">Type manually for free, or use AI to generate for a fee.</p>
          {showDetailsPreview ? (
            <div className="bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm min-h-[100px] prose prose-sm dark:prose-invert max-w-none">
              {details.trim() ? (
                <ReactMarkdown>{details}</ReactMarkdown>
              ) : (
                <p className="text-muted-foreground italic">Nothing to preview</p>
              )}
            </div>
          ) : (
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value.slice(0, 2000))}
              placeholder="Add supplementary details, links, or resolution criteria using Markdown..."
              rows={4}
              className={`w-full bg-muted/50 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 resize-none transition-colors ${
                fieldError("details" as any) ? "border-destructive focus:ring-destructive/30" : "border-border focus:ring-primary/30"
              }`}
            />
          )}
          <div className="flex justify-between mt-1">
            {fieldError("details" as any) && <p className="text-[10px] text-destructive">{fieldError("details" as any)}</p>}
            <p className="text-[10px] text-muted-foreground ml-auto">{details.length}/2000</p>
          </div>
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
          Cover Media <span className="text-xs font-normal text-destructive">*</span>
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
              <div className="space-y-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-32 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 hover:border-primary/40 hover:bg-primary/5 transition-all"
                >
                  <Upload className="w-6 h-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Click to upload (max 5MB)</span>
                </button>
                {isFeatureEnabled("ai_generate_image") && (
                  <button
                    type="button"
                    onClick={() => setPendingAiType("image")}
                    disabled={generatingImage || !title.trim()}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {generatingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {generatingImage ? "Generating..." : `✨ Generate Cover Image ($${aiGenerationCost})`}
                  </button>
                )}
                <p className="text-[10px] text-muted-foreground">Upload your own for free, or use AI to generate for a fee.</p>
              </div>
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

        {/* Auto-Resolve Toggle (Crypto only) */}
        {isPriceAutoResolveCategory(category) && (
          <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <Zap className="w-4 h-4 text-primary" />
                  Auto-Resolve by Price
                </label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Automatically resolves when a live price condition is met
                </p>
              </div>
              <button
                onClick={() => {
                  const next = !autoResolve;
                  setAutoResolve(next);
                  if (next) {
                    setMarketType("binary");
                    const defaultAsset = priceAssets[0]?.symbol || autoResolveAsset;
                    setAutoResolveAsset(defaultAsset);
                    setResolutionSource(getResolutionSource(category, defaultAsset));
                  }
                }}
                className={`w-11 h-6 rounded-full transition-colors relative ${autoResolve ? "bg-primary" : "bg-muted"}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${autoResolve ? "translate-x-[22px]" : "translate-x-0.5"}`} />
              </button>
            </div>

            {autoResolve && (
              <div className="space-y-3 pt-2 border-t border-border/50">
                <div>
                  <label className="text-xs font-semibold mb-1.5 block">{getAssetClassLabel(category)}</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {priceAssets.map((a) => (
                      <button
                        key={a.symbol}
                        onClick={() => {
                          setAutoResolveAsset(a.symbol);
                          setResolutionSource(getResolutionSource(category, a.symbol));
                        }}
                        className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          autoResolveAsset === a.symbol
                            ? "bg-primary/15 border border-primary/40 text-primary"
                            : "bg-muted/50 border border-border text-muted-foreground hover:text-foreground"
                        }`}
                        title={a.label}
                      >
                        {a.symbol}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1.5 block">Condition</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {OPERATORS.map((op) => (
                      <button
                        key={op.value}
                        onClick={() => setAutoResolveOperator(op.value)}
                        className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          autoResolveOperator === op.value
                            ? "bg-primary/15 border border-primary/40 text-primary"
                            : "bg-muted/50 border border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {op.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1.5 block">Target Price (USD)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    <input
                      type="number"
                      value={autoResolveTargetPrice}
                      onChange={(e) => setAutoResolveTargetPrice(e.target.value)}
                      placeholder="e.g. 150000"
                      className="w-full bg-muted/50 border border-border rounded-xl pl-7 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      min="0"
                      step="any"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1.5 block">Resolution Deadline Time (UTC)</label>
                  <input
                    type="time"
                    value={autoResolveTime}
                    onChange={(e) => setAutoResolveTime(e.target.value)}
                    className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                {autoResolveTargetPrice && endDate && (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                    <p className="text-xs font-medium text-primary">
                      ⚡ Resolves YES if {autoResolveAsset} {OPERATORS.find(o => o.value === autoResolveOperator)?.label.toLowerCase()} {category === "Forex" ? "" : "$"}{Number(autoResolveTargetPrice).toLocaleString()} by {endDate} {autoResolveTime} UTC
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Auto-Resolve Toggle (Sports only) */}
        {category === "Sports" && (
          <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <Trophy className="w-4 h-4 text-primary" />
                  Auto-Resolve by Match Result
                </label>
                <p className="text-[10px] text-muted-foreground mt-0.5">Automatically resolves when the match finishes</p>
              </div>
              <button onClick={() => { const next = !autoResolve; setAutoResolve(next); if (next) { setMarketType("binary"); setResolutionSource(`Auto-resolved via live ${sportType} match result`); } }}
                className={`w-11 h-6 rounded-full transition-colors relative ${autoResolve ? "bg-primary" : "bg-muted"}`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${autoResolve ? "translate-x-[22px]" : "translate-x-0.5"}`} />
              </button>
            </div>
            {autoResolve && (
              <div className="space-y-3 pt-2 border-t border-border/50">
                <div>
                  <label className="text-xs font-semibold mb-1.5 block">Sport</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {SPORT_TYPES.map((s) => (
                      <button key={s.value} disabled={!s.enabled} onClick={() => { if (!s.enabled) return; setSportType(s.value); setResolutionSource(`Auto-resolved via live ${s.label} match result`); }}
                        className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${!s.enabled ? "bg-muted/30 border border-border/50 text-muted-foreground/40 cursor-not-allowed" : sportType === s.value ? "bg-primary/15 border border-primary/40 text-primary" : "bg-muted/50 border border-border text-muted-foreground hover:text-foreground"}`}
                        title={!s.enabled ? "Coming soon" : undefined}>{s.label}{!s.enabled && <span className="ml-1 text-[9px] opacity-60">Soon</span>}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1.5 block">{isMmaSport ? "Event (optional)" : "League (optional)"}</label>
                  <input type="text" value={sportLeague} onChange={(e) => setSportLeague(e.target.value)} placeholder={isMmaSport ? "e.g. UFC 315, Bellator 300" : "e.g. Premier League, La Liga"} className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <FixtureSearch
                  sportType={sportType}
                  isMma={isMmaSport}
                  selectedFixtureId={sportMatchId}
                  onSelect={(fixture) => {
                    setSportMatchId(fixture.id);
                    if (fixture.league) setSportLeague(fixture.league);
                    if (fixture.id && fixture.homeTeam && fixture.awayTeam) {
                      const fixtureInfo = { homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam, date: fixture.date, league: fixture.league, venue: fixture.venue };
                      setSelectedFixtureData(fixtureInfo);
                      generateSportsAutoFill(fixtureInfo, sportPredictedOutcome);
                      const matchDate = (() => { try { return new Date(fixture.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return fixture.date; } })();
                      if (!details.trim()) {
                        setDetails(isMmaSport
                          ? `**Fight Details**\n- **Fighter 1:** ${fixture.homeTeam}\n- **Fighter 2:** ${fixture.awayTeam}\n- **Date:** ${matchDate}\n- **Event:** ${fixture.league || "TBD"}\n\n**Resolution**\nThis market will be auto-resolved based on the official fight result (Fight ID: ${fixture.id}).`
                          : `**Match Details**\n- **Home:** ${fixture.homeTeam}\n- **Away:** ${fixture.awayTeam}\n- **Date:** ${matchDate}\n- **League:** ${fixture.league || "TBD"}\n${fixture.venue ? `- **Venue:** ${fixture.venue}\n` : ""}\n**Resolution**\nThis market will be auto-resolved based on the official match result from API-Football (Match ID: ${fixture.id}).`);
                      }
                      if (!endDate && fixture.date) {
                        try { setEndDate(new Date(fixture.date).toISOString().split("T")[0]); } catch {}
                      }
                    }
                  }}
                />
                <div>
                  <label className="text-xs font-semibold mb-1.5 block">Predicted Outcome</label>
                  <div className={`grid ${isMmaSport ? 'grid-cols-2' : 'grid-cols-3'} gap-1.5 mb-2`}>
                    {OUTCOME_TYPES.map((o) => (
                      <button key={o.value} onClick={() => {
                        setSportPredictedOutcome(o.value);
                        if (selectedFixtureData) generateSportsAutoFill(selectedFixtureData, o.value);
                      }}
                        className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${sportPredictedOutcome === o.value ? "bg-primary/15 border border-primary/40 text-primary" : "bg-muted/50 border border-border text-muted-foreground hover:text-foreground"}`}>{o.label}</button>
                    ))}
                  </div>
                  <input type="text" value={sportPredictedOutcome} onChange={(e) => {
                    setSportPredictedOutcome(e.target.value);
                    if (selectedFixtureData) generateSportsAutoFill(selectedFixtureData, e.target.value);
                  }} placeholder={isMmaSport ? "Or custom: e.g. KO/TKO, submission" : "Or custom: over 2.5, btts, team name"} className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1.5 block">Resolution Deadline Time (UTC)</label>
                  <input type="time" value={autoResolveTime} onChange={(e) => setAutoResolveTime(e.target.value)} className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                {sportMatchId && sportPredictedOutcome && endDate && (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                    <p className="text-xs font-medium text-primary">🏆 Resolves YES if "{sportPredictedOutcome.replace(/_/g, " ")}" in {SPORT_TYPES.find(s => s.value === sportType)?.label} match #{sportMatchId} by {endDate} {autoResolveTime} UTC</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Twitter/X Engagement Market Template */}
        {category === "Twitter/X" && (
          <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <Twitter className="w-4 h-4 text-primary" />
                  Twitter Engagement Market
                </label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Auto-resolves by fetching live X/Twitter metrics at deadline
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-border/50">
              <div>
                <label className="text-xs font-semibold mb-1.5 block">Metric Type</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(["likes", "replies", "retweets", "tweets"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        setTwitterMetricType(m);
                        setAutoResolve(true);
                        setMarketType("multi");
                        setResolutionSource(`Auto-resolved via X API (${m} count)`);
                      }}
                      className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                        twitterMetricType === m
                          ? "bg-primary/15 border border-primary/40 text-primary"
                          : "bg-muted/50 border border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {m === "likes" ? "❤️" : m === "replies" ? "💬" : m === "retweets" ? "🔁" : "🐦"} {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold mb-1.5 block">
                  {twitterMetricType === "tweets" ? "User ID" : "Tweet ID"}
                </label>
                <input
                  type="text"
                  value={twitterResourceId}
                  onChange={(e) => setTwitterResourceId(e.target.value.trim())}
                  placeholder={twitterMetricType === "tweets" ? "e.g. 44196397 (Elon Musk)" : "e.g. 1234567890123456789"}
                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {twitterMetricType === "tweets"
                    ? "The numeric User ID from X (use a lookup tool to find it)"
                    : "The tweet ID from the URL (the numeric part after /status/)"}
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold mb-1.5 block">Range Brackets</label>
                <div className="space-y-1.5">
                  {twitterBrackets.map((bracket, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={bracket}
                        onChange={(e) => {
                          const newBrackets = [...twitterBrackets];
                          newBrackets[i] = e.target.value;
                          setTwitterBrackets(newBrackets);
                        }}
                        placeholder="e.g. 80-99"
                        className="flex-1 bg-muted/50 border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      {twitterBrackets.length > 2 && (
                        <button onClick={() => setTwitterBrackets(twitterBrackets.filter((_, j) => j !== i))} className="p-1 text-muted-foreground hover:text-destructive">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {twitterBrackets.length < 8 && (
                    <button
                      onClick={() => setTwitterBrackets([...twitterBrackets, ""])}
                      className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 mt-1"
                    >
                      <Plus className="w-3 h-3" /> Add bracket
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold mb-1.5 block">Resolution Deadline Time (UTC)</label>
                <input
                  type="time"
                  value={autoResolveTime}
                  onChange={(e) => setAutoResolveTime(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {twitterResourceId && endDate && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                  <p className="text-xs font-medium text-primary">
                    🐦 Resolves based on {twitterMetricType} count for {twitterMetricType === "tweets" ? "user" : "tweet"} #{twitterResourceId} at {endDate} {autoResolveTime} UTC
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Brackets: {twitterBrackets.filter(b => b.trim()).join(" | ")}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

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
              max={category === "Twitter/X" && twitterResourceId.trim() ? new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0] : undefined}
              className={`w-full bg-muted/50 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 transition-colors ${inputBorder("endDate")}`}
            />
            {category === "Twitter/X" && twitterResourceId.trim() && (
              <p className="text-[10px] text-amber-500 mt-1">⚠️ Twitter/X markets limited to 5 days max</p>
            )}
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

        {/* Simulated Initial Stats */}
        <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <BarChart3 className="w-4 h-4 text-primary" />
            Simulated Initial Stats
          </label>
          <p className="text-[11px] text-muted-foreground -mt-1">
            Set initial volume and trader count to make the market appear active. These are display-only values.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Initial Volume ($)</label>
              <input
                type="number"
                value={initialVolume}
                onChange={(e) => setInitialVolume(e.target.value)}
                placeholder="0"
                min={0}
                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Initial Traders</label>
              <input
                type="number"
                value={initialTraders}
                onChange={(e) => setInitialTraders(e.target.value)}
                placeholder="0"
                min={0}
                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
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

    <AlertDialog open={!!pendingAiType} onOpenChange={(open) => { if (!open) setPendingAiType(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm AI Generation</AlertDialogTitle>
          <AlertDialogDescription>
            This will generate {pendingAiType === "image" ? "a cover image" : pendingAiType === "details" ? "detailed content" : "a description"} using AI.
            <span className="block mt-2 font-semibold text-foreground">${aiGenerationCost.toFixed(2)} will be charged.</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => { const t = pendingAiType; setPendingAiType(null); if (t) handleAiGenerate(t); }}>
            Generate — ${aiGenerationCost.toFixed(2)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

export default AdminCreateMarket;
