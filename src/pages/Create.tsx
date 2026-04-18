import LogoLoader from "@/components/LogoLoader";
import { useUserBalance } from "@/hooks/useUserBalance";
import { useQueryClient } from "@tanstack/react-query";
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
import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { useFilteredConnectors } from "@/hooks/useFilteredConnectors";
import { useNavigate, useLocation } from "react-router-dom";
import { bsc } from "wagmi/chains";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import {
  TrendingUp,
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
  Wallet,
  Coins,
  ImageIcon,
  Upload,
  ArrowRight,
  Calendar,
  FileText,
  Tag,
  DollarSign,
  AlertTriangle,
  Loader2,
  Sparkles,
  Share2,
  MessageSquare,
  Plus,
  X,
  Video,
  BarChart3,
  Target,
  LogIn,
  User,
  Eye,
  EyeOff,
  Zap,
  Trophy,
  Mic,
  
} from "lucide-react";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import CategoryIcon from "@/components/CategoryIcon";
import DepositWithdrawModal from "@/components/DepositWithdrawModal";
import SwapModal from "@/components/SwapModal";
import FixtureSearch from "@/components/FixtureSearch";
import { isPriceAutoResolveCategory, getAssetsForCategory, getAssetClassLabel, getResolutionSource } from "@/data/assetClasses";

/** Progress bar with estimated time remaining for market creation */
const SubmitProgressBar = ({ completedSteps, startTime, estimatedTotalSec }: {
  completedSteps: Set<number>;
  startTime: number;
  estimatedTotalSec: number;
}) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startTime) return;
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 500);
    return () => clearInterval(iv);
  }, [startTime]);

  const stepProgress = (completedSteps.size / 5) * 100;
  const timeProgress = Math.min((elapsed / estimatedTotalSec) * 100, 95);
  const progress = Math.max(stepProgress, timeProgress);
  const remaining = Math.max(0, estimatedTotalSec - elapsed);

  return (
    <div className="w-full max-w-xs space-y-1.5">
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={{ width: "0%" }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{Math.round(progress)}% complete</span>
        <span>~{remaining}s remaining</span>
      </div>
    </div>
  );
};

const CATEGORIES = [
  "Crypto", "Commodities", "Forex", "AI & Tech", "Science", "Economy",
  "Entertainment", "Sports", "Politics", "Twitter/X", "Other",
];

type GateStatus = "idle" | "checking" | "passed" | "failed";

interface GateCheck {
  label: string;
  icon: React.ReactNode;
  status: GateStatus;
  detail?: string;
}

const DetailsField = ({ details, setDetails, error, touched: fieldTouched, onBlur, shakeClass, onGenerate, generating, aiCost }: { details: string; setDetails: (v: string) => void; error?: string | null; touched?: boolean; onBlur?: () => void; shakeClass?: string; onGenerate?: () => void; generating?: boolean; aiCost?: number }) => {
  const [preview, setPreview] = useState(false);
  return (
    <div className={`glass rounded-xl p-4 ${shakeClass || ""} ${fieldTouched && error ? "border-destructive/50" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="w-4 h-4 text-primary" />
          More Details <span className="text-xs font-normal text-destructive">*</span>
        </label>
        <div className="flex items-center gap-2">
          {onGenerate && (
            <button
              type="button"
              onClick={onGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Generate (${(aiCost ?? 0.5).toFixed(2)})
            </button>
          )}
          {details.trim() && (
            <button
              type="button"
              onClick={() => setPreview(!preview)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {preview ? "Edit" : "Preview"}
            </button>
          )}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground mb-1.5">Type manually for free, or use AI to generate for a fee.</p>
      {preview ? (
        <div className="bg-muted/50 border border-border rounded-xl px-4 py-3 min-h-[5rem] text-xs text-muted-foreground leading-relaxed">
          <ReactMarkdown
            components={{
              h1: ({ children }) => <h3 className="text-sm font-bold text-foreground mt-3 mb-1">{children}</h3>,
              h2: ({ children }) => <h4 className="text-xs font-bold text-foreground mt-2.5 mb-1">{children}</h4>,
              h3: ({ children }) => <h5 className="text-xs font-semibold text-foreground mt-2 mb-0.5">{children}</h5>,
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
              li: ({ children }) => <li>{children}</li>,
              a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{children}</a>,
              strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
              em: ({ children }) => <em>{children}</em>,
              code: ({ children }) => <code className="bg-muted px-1 py-0.5 rounded text-[10px]">{children}</code>,
            }}
          >{details}</ReactMarkdown>
        </div>
      ) : (
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          onBlur={onBlur}
          placeholder="Provide extra context, background info, or rules that help participants make informed predictions."
          rows={3}
          className={`w-full bg-muted/50 border rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 transition-all resize-none ${
            fieldTouched && error ? "border-destructive focus:ring-destructive/30" : "border-border focus:ring-primary/30"
          }`}
          maxLength={2000}
        />
      )}
      <div className="flex justify-between mt-1.5">
        {fieldTouched && error ? (
          <p className="text-[10px] text-destructive">{error}</p>
        ) : <span />}
        <p className={`text-[10px] ${details.length > 1800 ? "text-destructive" : "text-muted-foreground"}`}>{details.length}/2000</p>
      </div>
    </div>
  );
};

const Create = () => {
  const { address, isConnected } = useAccount();
  const { open } = useAppKit();
  const { connect, connectors, isPending } = useFilteredConnectors();
  const { user, loading: authLoading, displayName } = useAuth();
  const { isFeatureEnabled } = useFeatureToggles();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { balance, totalBalance, isLoading: balanceLoading } = useUserBalance();

  // Gate thresholds & settings from DB
  const [minTokenBalance, setMinTokenBalance] = useState(10_000_000);
  const [minNftBalance, setMinNftBalance] = useState(1);
  const [tokenContractAddress, setTokenContractAddress] = useState("");
  const [nftContractAddress, setNftContractAddress] = useState("");
  const [nftBuyUrl, setNftBuyUrl] = useState("");
  const [marketCreationFee, setMarketCreationFee] = useState(50);
  const [tokenDecimals, setTokenDecimals] = useState(18);
  const [blueMaxFreeMarkets, setBlueMaxFreeMarkets] = useState(5);
  const [goldMaxFreeMarkets, setGoldMaxFreeMarkets] = useState(20);
  const [verificationLevel, setVerificationLevel] = useState("none");
  const [unlimitedMarkets, setUnlimitedMarkets] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [activeMarketCount, setActiveMarketCount] = useState(0);
  const [exceededFreeLimit, setExceededFreeLimit] = useState(false);
  const [aiGenerationCost, setAiGenerationCost] = useState(0.5);
  const [creatorFeePercent, setCreatorFeePercent] = useState(3);
  const [creatorFeeBluePercent, setCreatorFeeBluePercent] = useState(3);
  const [creatorFeeGoldPercent, setCreatorFeeGoldPercent] = useState(3);
  const [predictionFeePercent, setPredictionFeePercent] = useState(10);
  const [autoResolveFee, setAutoResolveFee] = useState(0);
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
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setAiAgentPrompt(transcript);
    };
    recognition.onend = () => {
      setIsListening(false);
    };
    recognition.onerror = (e: any) => {
      setIsListening(false);
      if (e.error !== "aborted") toast.error("Voice input error: " + e.error);
    };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  // Boost & Broadcast add-ons at creation
  const [creationBoost, setCreationBoost] = useState(false);
  const [creationBoostTier, setCreationBoostTier] = useState<"flash" | "standard" | "whale">("flash");
  const [creationBroadcast, setCreationBroadcast] = useState(false);
  const [boostTierPrices, setBoostTierPrices] = useState<Record<string, number>>({ flash: 20, standard: 50, whale: 150 });
  const BOOST_TIER_HOURS: Record<string, number> = { flash: 12, standard: 24, whale: 168 };
  const [broadcastPriceVal, setBroadcastPriceVal] = useState(5);
  const [minLiquidity, setMinLiquidity] = useState(10);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("public_commission_settings" as any)
        .select("*")
        .limit(1)
        .single();
      if (data) {
        const d = data as any;
        setMinTokenBalance(Number(d.min_token_balance) || 10_000_000);
        setMinNftBalance(Number(d.min_nft_balance) || 1);
        setTokenContractAddress(d.token_contract_address || "");
        setNftContractAddress(d.nft_contract_address || "");
        setNftBuyUrl(d.nft_buy_url || "");
        setMarketCreationFee(Number(d.market_creation_fee) || 50);
        setTokenDecimals(Number(d.token_decimals) ?? 18);
        setBlueMaxFreeMarkets(Number(d.blue_max_free_markets) || 5);
        setGoldMaxFreeMarkets(Number(d.gold_max_free_markets) || 20);
        setAiGenerationCost(Number(d.ai_generation_cost ?? 0.5));
        setAutoResolveFee(Number(d.auto_resolve_fee ?? 0));
        setCreatorFeePercent(Number(d.creator_fee_percent ?? 3));
        setCreatorFeeBluePercent(Number(d.creator_fee_blue_percent ?? 3));
        setCreatorFeeGoldPercent(Number(d.creator_fee_gold_percent ?? 3));
        setPredictionFeePercent(Number((data as any).prediction_fee_percent ?? 10));
        setBoostTierPrices({
          flash: Number((data as any).boost_flash_price ?? 20),
          standard: Number((data as any).boost_standard_price ?? 50),
          whale: Number((data as any).boost_whale_price ?? 150),
        });
        setBroadcastPriceVal(Number((data as any).broadcast_price ?? 5));
        setMinLiquidity(Number((data as any).min_liquidity ?? 10));
      }
      setSettingsLoaded(true);
    })();
  }, []);

  // Fetch user verification level and active market count
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: profile }, { count }] = await Promise.all([
        supabase.from("profiles").select("verification_level, unlimited_markets").eq("id", user.id).maybeSingle(),
        supabase.from("markets").select("id", { count: "exact", head: true }).eq("creator_wallet", user.id).in("status", ["active", "pending"]),
      ]);
      const vLevel = (profile as any)?.verification_level || "none";
      setVerificationLevel(vLevel);
      setUnlimitedMarkets(!!(profile as any)?.unlimited_markets);
      setActiveMarketCount(count || 0);
    })();
  }, [user]);

  // Gate state
  const [gateChecks, setGateChecks] = useState<GateCheck[]>([]);
  const [gatePassed, setGatePassed] = useState(false);
  const [gateRunning, setGateRunning] = useState(false);
  const [gateFinished, setGateFinished] = useState(false);
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [showConnectors, setShowConnectors] = useState(false);
  const [feeBypass, setFeeBypass] = useState(false);
  const [depositModalOpen, setDepositModalOpen] = useState(false);

  // Escrow state
  const [escrowId, setEscrowId] = useState<string | null>(null);
  const [showFeeConfirm, setShowFeeConfirm] = useState(false);
  const [feeBypassLoading, setFeeBypassLoading] = useState(false);

  // Draft state
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftLoading, setDraftLoading] = useState(true);
  const [draftBannerDraft, setDraftBannerDraft] = useState<{ id: string; title: string } | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<number | null>(null);

  // Form state — restore from localStorage on mount (persists across tab close / browser crash)
  const getStored = (key: string, fallback: string) => {
    try { return localStorage.getItem(`create_${key}`) ?? fallback; } catch { return fallback; }
  };
  const getStoredJson = <T,>(key: string, fallback: T): T => {
    try { const v = localStorage.getItem(`create_${key}`); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  };

  const [title, setTitle] = useState(() => getStored("title", ""));
  const [description, setDescription] = useState(() => getStored("description", ""));
  const [details, setDetails] = useState(() => getStored("details", ""));
  const [category, setCategory] = useState(() => getStored("category", ""));
  const [endDate, setEndDate] = useState(() => getStored("endDate", ""));
  const [resolutionSource, setResolutionSource] = useState(() => getStored("resolutionSource", ""));
  const [initialLiquidity, setInitialLiquidity] = useState(() => getStored("initialLiquidity", ""));
  const [step, setStep] = useState(() => getStoredJson("step", 1));
  const [marketType, setMarketType] = useState<"binary" | "multi" | "range">(() => getStoredJson("marketType", "binary"));
  const [options, setOptions] = useState<string[]>(() => getStoredJson("options", ["", ""]));
  const [videoUrl, setVideoUrl] = useState(() => getStored("videoUrl", ""));

  // Scroll to top on step change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    document.getElementById("root")?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  }, [step]);

  // Persist form state to localStorage
  useEffect(() => {
    const fields: Record<string, string> = {
      title, description, details, category, endDate, resolutionSource, initialLiquidity, videoUrl,
    };
    Object.entries(fields).forEach(([k, v]) => { try { localStorage.setItem(`create_${k}`, v); } catch {} });
    try { localStorage.setItem("create_step", JSON.stringify(step)); } catch {}
    try { localStorage.setItem("create_marketType", JSON.stringify(marketType)); } catch {}
    try { localStorage.setItem("create_options", JSON.stringify(options)); } catch {}
  }, [title, description, details, category, endDate, resolutionSource, initialLiquidity, step, marketType, options, videoUrl]);

  const clearFormStorage = () => {
    ["title", "description", "details", "category", "endDate", "resolutionSource", "initialLiquidity", "videoUrl", "step", "marketType", "options"]
      .forEach((k) => { try { localStorage.removeItem(`create_${k}`); } catch {} });
  };

  // Check for existing drafts on mount (or auto-resume from Portfolio navigation)
  useEffect(() => {
    if (!user) { setDraftLoading(false); return; }
    const resumeId = (location.state as any)?.resumeDraftId;
    (async () => {
      if (resumeId) {
        // Auto-resume a specific draft passed from Portfolio
        const { data } = await supabase
          .from("markets")
          .select("*, market_options!market_options_market_id_fkey(id, label, sort_order)")
          .eq("id", resumeId)
          .maybeSingle();
        if (data) {
          resumeDraft(data);
          setDraftLoading(false);
          // Clear the state so refresh doesn't re-trigger
          window.history.replaceState({}, document.title);
          return;
        }
      }
      const { data } = await supabase
        .from("markets")
        .select("id, title, description, details, category, end_date, resolution_source, initial_liquidity, market_type, video_url, image_url, auto_resolve, auto_resolve_asset, auto_resolve_operator, auto_resolve_target_price, auto_resolve_deadline, sport_type, sport_match_id, sport_predicted_outcome, sport_league, twitter_resource_id, twitter_metric_type, market_options!market_options_market_id_fkey(id, label, sort_order)")
        .eq("creator_wallet", user.id)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setDraftBannerDraft({ id: data.id, title: data.title || "Untitled Draft" });
      }
      setDraftLoading(false);
    })();
  }, [user]);

  const resumeDraft = useCallback(async (draft: any) => {
    // Populate all form fields from draft
    setTitle(draft.title || "");
    setDescription(draft.description || "");
    setDetails(draft.details || "");
    setCategory(draft.category || "");
    setEndDate(draft.end_date || "");
    setResolutionSource(draft.resolution_source === "TBD" ? "" : (draft.resolution_source || ""));
    setInitialLiquidity(draft.initial_liquidity > 0 ? String(draft.initial_liquidity) : "");
    setMarketType((draft.market_type as "binary" | "multi" | "range") || "binary");
    setVideoUrl(draft.video_url || "");
    if (draft.image_url) setImagePreview(draft.image_url);
    if (draft.auto_resolve) {
      setAutoResolve(true);
      if (draft.auto_resolve_asset) setAutoResolveAsset(draft.auto_resolve_asset);
      if (draft.auto_resolve_operator) setAutoResolveOperator(draft.auto_resolve_operator);
      if (draft.auto_resolve_target_price) setAutoResolveTargetPrice(String(draft.auto_resolve_target_price));
      if (draft.auto_resolve_deadline) {
        try { setAutoResolveTime(new Date(draft.auto_resolve_deadline).toISOString().slice(11, 16)); } catch {}
      }
    }
    if (draft.sport_type) setSportType(draft.sport_type);
    if (draft.sport_match_id) setSportMatchId(draft.sport_match_id);
    if (draft.sport_predicted_outcome) setSportPredictedOutcome(draft.sport_predicted_outcome);
    if (draft.sport_league) setSportLeague(draft.sport_league);
    if (draft.twitter_resource_id) setTwitterResourceId(draft.twitter_resource_id);
    if (draft.twitter_metric_type) setTwitterMetricType(draft.twitter_metric_type);

    // Load options
    const opts = draft.market_options as any[];
    if (opts && opts.length > 0) {
      setOptions(opts.sort((a: any, b: any) => a.sort_order - b.sort_order).map((o: any) => o.label));
    }
    setDraftId(draft.id);
    setDraftBannerDraft(null);
    setStep(1);
    toast.success("Draft loaded — continue where you left off!");
  }, []);

  const handleResumeDraft = useCallback(async () => {
    if (!draftBannerDraft || !user) return;
    const { data } = await supabase
      .from("markets")
      .select("*, market_options!market_options_market_id_fkey(id, label, sort_order)")
      .eq("id", draftBannerDraft.id)
      .maybeSingle();
    if (data) resumeDraft(data);
  }, [draftBannerDraft, user, resumeDraft]);

  const handleDiscardDraft = useCallback(async () => {
    if (!draftBannerDraft) return;
    // Delete options first, then market
    await supabase.from("market_options").delete().eq("market_id", draftBannerDraft.id);
    await supabase.from("markets").delete().eq("id", draftBannerDraft.id);
    setDraftBannerDraft(null);
    setDraftId(null);
    toast.success("Draft discarded");
  }, [draftBannerDraft]);

  // saveDraft is defined after image/auto-resolve state declarations below

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
  // Exact kickoff timestamp (ISO) for sports markets — used as the authoritative auto_resolve_deadline (betting cutoff)
  const [sportKickoffISO, setSportKickoffISO] = useState<string | null>(null);

  // Twitter/X auto-resolve state
  const [twitterResourceId, setTwitterResourceId] = useState("");
  const [twitterMetricType, setTwitterMetricType] = useState<"likes" | "retweets" | "replies" | "impressions" | "posts">("likes");

  const priceAssets = getAssetsForCategory(category);

  const generateSportsAutoFill = (fixture: { homeTeam: string; awayTeam: string; date: string; league: string; venue: string }, outcome: string) => {
    const matchDate = (() => { try { return new Date(fixture.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return fixture.date; } })();
    const isMma = sportType === "mma";
    let newTitle: string;
    let newDesc: string;
    if (isMma) {
      // MMA-specific: outcomes are "[Fighter] Win"
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
  // AI Agent: generate entire market from prompt
  const handleAiAgent = async () => {
    if (!user) { toast.error("Sign in to use AI market creation"); return; }
    if (!aiAgentPrompt.trim()) { toast.error("Enter a prompt describing your market"); return; }
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
      setMarketType(m.marketType || "binary");
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
      toast.success(`Market generated! $${(data.cost ?? 0).toFixed(2)} charged. Review and edit below.`);
      queryClient.invalidateQueries({ queryKey: ["user-balance"] });
    } catch (err) {
      toast.error("Something went wrong");
    } finally {
      setAiAgentLoading(false);
    }
  };

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
        setImageFile(null); // Clear any file since we have a URL now
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

  // Image upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

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
    const { compressImage } = await import("@/lib/imageCompression");
    const compressed = await compressImage(imageFile, "market-banner");
    // Derive extension from the actual compressed file type
    const ext = compressed.type === "image/webp" ? "webp" : compressed.type === "image/jpeg" ? "jpg" : compressed.name.split(".").pop() || "jpg";
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage
      .from("market-images")
      .upload(fileName, compressed, { contentType: compressed.type });
    if (error) {
      console.error("Image upload error:", error);
      toast.error("Failed to upload image. Please try a different image format (JPG or PNG).");
      return null;
    }
    const { data: urlData } = supabase.storage.from("market-images").getPublicUrl(fileName);
    return urlData.publicUrl;
  };

  const isSubmittingRef = useRef(false);

  const saveDraft = useCallback(async (silent = false) => {
    if (!user) { if (!silent) toast.error("Sign in to save drafts"); return; }
    // Prevent auto-save from running during submission (race condition causes duplicate options)
    if (silent && isSubmittingRef.current) return;
    if (!silent) setSavingDraft(true);
    try {
      let imageUrl: string | null = imagePreview?.startsWith("blob:") ? null : (imagePreview || null);
      if (imageFile && imagePreview?.startsWith("blob:")) {
        imageUrl = await uploadImage();
      }

      const today = new Date().toISOString().split("T")[0];
      const draftData: any = {
        creator_wallet: user.id,
        creator_name: displayName,
        title: title.trim() || "Untitled Draft",
        description: description.trim() || "Draft market — no description yet.",
        details: details.trim() || null,
        video_url: videoUrl.trim() || null,
        image_url: imageUrl,
        category: category || "Other",
        end_date: endDate || today,
        resolution_source: resolutionSource.trim() || "TBD",
        initial_liquidity: initialLiquidity ? parseFloat(initialLiquidity) : 0,
        liquidity: initialLiquidity ? parseFloat(initialLiquidity) : 0,
        market_type: marketType,
        status: "draft",
        auto_resolve: autoResolve,
        auto_resolve_asset: autoResolve && isPriceAutoResolveCategory(category) ? autoResolveAsset : null,
        auto_resolve_target_price: autoResolve && isPriceAutoResolveCategory(category) && autoResolveTargetPrice ? parseFloat(autoResolveTargetPrice) : null,
        auto_resolve_operator: autoResolve && isPriceAutoResolveCategory(category) ? autoResolveOperator : null,
        auto_resolve_deadline: autoResolve
          ? (category === "Sports" && sportKickoffISO
              ? sportKickoffISO
              : (endDate && autoResolveTime ? new Date(`${endDate}T${autoResolveTime}:00Z`).toISOString() : null))
          : null,
        sport_type: autoResolve && category === "Sports" ? sportType : null,
        sport_match_id: autoResolve && category === "Sports" ? sportMatchId : null,
        sport_predicted_outcome: autoResolve && category === "Sports" ? sportPredictedOutcome : null,
        sport_league: autoResolve && category === "Sports" ? sportLeague || null : null,
        twitter_resource_id: autoResolve && category === "Twitter/X" ? twitterResourceId || null : null,
        twitter_metric_type: autoResolve && category === "Twitter/X" ? twitterMetricType : null,
      };

      let savedId = draftId;
      if (draftId) {
        const { error } = await supabase.from("markets").update(draftData).eq("id", draftId);
        if (error) throw error;
      } else {
        // Check draft limit based on verification level
        const [{ count: existingDrafts }, { data: profileData }, { data: settingsData }] = await Promise.all([
          supabase.from("markets").select("id", { count: "exact", head: true }).eq("creator_wallet", user.id).eq("status", "draft"),
          supabase.from("profiles").select("verification_level").eq("id", user.id).maybeSingle(),
          supabase.from("commission_settings" as any).select("max_drafts_none, max_drafts_blue, max_drafts_gold").limit(1).maybeSingle(),
        ]);
        const vLevel = (profileData as any)?.verification_level || "none";
        const s = settingsData as any;
        const maxDrafts = vLevel === "gold" ? (s?.max_drafts_gold ?? 10) : vLevel === "blue" ? (s?.max_drafts_blue ?? 5) : (s?.max_drafts_none ?? 2);
        if ((existingDrafts ?? 0) >= maxDrafts) {
          toast.error(`You can only have up to ${maxDrafts} drafts at a time. Please delete or submit an existing draft first.`);
          return;
        }
        const { data, error } = await supabase.from("markets").insert(draftData).select("id").maybeSingle();
        if (error) throw error;
        savedId = data?.id || null;
        setDraftId(savedId);
      }

      if (savedId && marketType !== "binary") {
        await supabase.from("market_options").delete().eq("market_id", savedId);
        const validOptions = options.filter(o => o.trim());
        if (validOptions.length > 0) {
          const equalPrice = Math.round((1 / validOptions.length) * 100) / 100;
          await supabase.from("market_options").insert(
            validOptions.map((label, i) => ({
              market_id: savedId!,
              label: label.trim(),
              price: equalPrice,
              sort_order: i,
            }))
          );
        }
      }

      if (!silent) toast.success("Draft saved!");
      if (silent) setLastAutoSaveTime(Date.now());
    } catch (err: any) {
      console.error("Draft save error:", err);
      if (!silent) toast.error("Failed to save draft");
    } finally {
      if (!silent) setSavingDraft(false);
    }
  }, [user, draftId, title, description, details, category, endDate, resolutionSource, initialLiquidity, marketType, options, videoUrl, imageFile, imagePreview, autoResolve, autoResolveAsset, autoResolveOperator, autoResolveTargetPrice, autoResolveTime, sportType, sportMatchId, sportPredictedOutcome, sportLeague, twitterResourceId, twitterMetricType, displayName]);

  // Auto-save draft every 30 seconds
  const saveDraftRef = useRef(saveDraft);
  saveDraftRef.current = saveDraft;
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAutoSaveDataRef = useRef<string>("");

  // Build fingerprint from current form data for change detection
  const formFingerprint = JSON.stringify({ title, description, details, category, endDate, resolutionSource, initialLiquidity, marketType, options, videoUrl, autoResolve, autoResolveAsset, autoResolveOperator, autoResolveTargetPrice, autoResolveTime, sportType, sportMatchId, sportPredictedOutcome, sportLeague, twitterResourceId, twitterMetricType });
  const formFingerprintRef = useRef(formFingerprint);
  formFingerprintRef.current = formFingerprint;

  // Track if user has entered a title
  const hasTitleRef = useRef(!!title.trim());
  hasTitleRef.current = !!title.trim();

  useEffect(() => {
    // Auto-save every 30s — uses refs so no need for form field deps
    autoSaveTimerRef.current = setInterval(() => {
      if (!hasTitleRef.current) return;
      if (formFingerprintRef.current === lastAutoSaveDataRef.current) return;
      lastAutoSaveDataRef.current = formFingerprintRef.current;
      saveDraftRef.current(true); // silent auto-save
    }, 30000);

    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    };
  }, [user]); // only depend on user — refs handle the rest

  const addOption = () => {
    if (options.length < 6) setOptions([...options, ""]);
  };
  const removeOption = (idx: number) => {
    if (options.length > 2) setOptions(options.filter((_, i) => i !== idx));
  };
  const updateOption = (idx: number, val: string) => {
    setOptions(options.map((o, i) => (i === idx ? val : o)));
  };

  // Validation state — track which fields have been "touched" or attempted
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [shakeField, setShakeField] = useState<string | null>(null);

  const markTouched = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  const shake = (field: string) => {
    setShakeField(field);
    setTimeout(() => setShakeField(null), 500);
  };

  // Validation rules
  const errors: Record<string, string | null> = {
    title: title.trim().length === 0 ? "Question is required" : title.trim().length < 10 ? "Must be at least 10 characters" : null,
    description: description.trim().length === 0 ? "Description is required" : description.trim().length < 20 ? "Must be at least 20 characters" : null,
    details: details.trim().length === 0 ? "More details are required" : details.trim().length < 20 ? "Must be at least 20 characters" : null,
    category: !category ? "Select a category" : null,
    endDate: !endDate ? "Resolution date is required" : (autoResolve && category === "Twitter/X" && new Date(endDate) > new Date(Date.now() + 5 * 86400000)) ? "Twitter/X markets must resolve within 5 days" : null,
    resolutionSource: resolutionSource.trim().length === 0 ? "Resolution source is required" : resolutionSource.trim().length < 10 ? "Must be at least 10 characters" : null,
    initialLiquidity: !initialLiquidity ? "Initial liquidity is required" : parseFloat(initialLiquidity) < minLiquidity ? `Minimum ${minLiquidity} USDT` : null,
    options: marketType !== "binary" && options.filter(o => o.trim()).length < 2 ? "At least 2 options required" : null,
    twitterResource: (() => {
      if (!autoResolve || category !== "Twitter/X") return null;
      if (!twitterResourceId.trim()) return "X handle or Tweet ID is required";
      const isUsernameBased = twitterMetricType === "posts";
      if (isUsernameBased && (twitterResourceId.includes("/") || twitterResourceId.includes("http")))
        return "Enter the X handle only, not a link";
      return null;
    })(),
  };

  const shakeClass = (field: string) => shakeField === field ? "animate-[shake_0.4s_ease-in-out]" : "";

  const tryAdvanceStep1 = () => {
    setTouched((t) => ({ ...t, title: true, description: true, details: true, options: true }));
    if (errors.title) { shake("title"); return; }
    if (errors.description) { shake("description"); return; }
    if (errors.details) { shake("details"); return; }
    if (marketType !== "binary" && errors.options) { shake("options"); return; }
    setStep(2);
  };

  const tryAdvanceStep2 = () => {
    setTouched((t) => ({ ...t, category: true, endDate: true, resolutionSource: true }));
    if (errors.category) { shake("category"); return; }
    if (errors.endDate) { shake("endDate"); return; }
    if (errors.resolutionSource) { shake("resolutionSource"); return; }
    if (errors.twitterResource) { setTouched((t) => ({ ...t, twitterResource: true })); shake("twitterResource"); return; }
    setStep(3);
  };

  // Submission state
  type SubmitStep = "idle" | "moderating" | "deploying" | "saving" | "success" | "first_prediction" | "placing_prediction" | "error";
  const [submitStep, setSubmitStep] = useState<SubmitStep>("idle");
  // Reset submitting guard when submission ends (error or idle) so auto-save can resume
  useEffect(() => {
    if (submitStep === "error" || submitStep === "idle") {
      isSubmittingRef.current = false;
    }
  }, [submitStep]);
  const [txHash, setTxHash] = useState("");
  const [newMarketId, setNewMarketId] = useState("");
  const [newMarketOptions, setNewMarketOptions] = useState<{ id: string; label: string; sort_order: number }[]>([]);
  const [similarMarkets, setSimilarMarkets] = useState<Array<{ id: string; title: string; category: string }>>([]);
  const [createdAsPending, setCreatedAsPending] = useState(false);
  const [moderationReason, setModerationReason] = useState("");
  const [firstPredSide, setFirstPredSide] = useState<"yes" | "no">("yes");
  const [firstPredOptionId, setFirstPredOptionId] = useState<string | null>(null);
  const [firstPredAmount, setFirstPredAmount] = useState("5");
  const [fetchingOptions, setFetchingOptions] = useState(false);

  // Fallback: fetch options from DB if newMarketOptions is empty for multi/range markets
  useEffect(() => {
    if (submitStep === "first_prediction" && marketType !== "binary" && newMarketOptions.length === 0 && newMarketId) {
      setFetchingOptions(true);
      supabase
        .from("market_options")
        .select("id, label, sort_order")
        .eq("market_id", newMarketId)
        .order("sort_order")
        .then(({ data }) => {
          if (data && data.length > 0) {
            setNewMarketOptions(data);
          }
          setFetchingOptions(false);
        });
    }
  }, [submitStep, newMarketId, marketType, newMarketOptions.length]);

  // Progress tracking for submit flow
  const [submitProgress, setSubmitProgress] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const submitStartRef = useRef<number>(0);
  const ESTIMATED_TOTAL_SEC = 30; // estimated total seconds

  // Save wallet address to profile when connected
  useEffect(() => {
    if (user && isConnected && address) {
      (async () => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("wallet_address")
          .eq("id", user.id)
          .single();
        if (profile && !profile.wallet_address) {
          await supabase
            .from("profiles")
            .update({ wallet_address: address })
            .eq("id", user.id);
        }
      })();
    }
  }, [user, isConnected, address]);

  const handleCreateMarket = async () => {
    if (!user || !address) return;

    // Block auto-save and stop timer to prevent duplicate option inserts during submission
    isSubmittingRef.current = true;
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    // Validate cover image (either file upload or AI-generated URL)
    if (!imageFile && !imagePreview) {
      toast.error("A cover image is required to create a market");
      isSubmittingRef.current = false;
      return;
    }

    const liquidityAmount = parseFloat(initialLiquidity);
    const balancePromoEnabled = isFeatureEnabled("balance_promotions");
    const boostCost = (creationBoost && balancePromoEnabled) ? boostTierPrices[creationBoostTier] : 0;
    const broadcastCost = (creationBroadcast && balancePromoEnabled) ? broadcastPriceVal : 0;
    const totalDeduction = (feeBypass && !unlimitedMarkets) ? liquidityAmount + marketCreationFee : liquidityAmount;
    setSimilarMarkets([]);
    setCreatedAsPending(false);
    setModerationReason("");
    setSubmitProgress(0);
    setCompletedSteps(new Set());
    submitStartRef.current = Date.now();

    // Step 0: Run AI checks AND image upload in parallel for speed
    setSubmitStep("moderating");
    let isSimilar = false;
    let isFlagged = false;

    const [simResult, modResult, imageUploadResult] = await Promise.allSettled([
      supabase.functions.invoke("check-market-similarity", {
        body: { title: title.trim(), description: description.trim() },
      }),
      supabase.functions.invoke("moderate-market-content", {
        body: {
          title: title.trim(),
          description: description.trim(),
          options: marketType !== "binary" ? options.filter(o => o.trim()) : undefined,
        },
      }),
      // Upload image in parallel with AI checks to save time
      imageFile ? uploadImage() : Promise.resolve(null),
    ]);

    setCompletedSteps(prev => new Set([...prev, 0]));

    // Process similarity result
    if (simResult.status === "fulfilled") {
      const { data: simData, error: simError } = simResult.value;
      if (!simError && simData?.similar && simData.matches?.length > 0) {
        isSimilar = true;
        setSimilarMarkets(simData.matches);
      }
    } else {
      console.error("Similarity check failed, proceeding:", simResult.reason);
    }

    // Process moderation result
    if (modResult.status === "fulfilled") {
      const { data: modData, error: modError } = modResult.value;
      if (!modError && modData?.flagged) {
        isFlagged = true;
        setModerationReason(modData.reason || "Content flagged by AI moderation");
        await supabase.from("moderation_logs").insert({
          content_type: "market",
          user_id: user.id,
          flagged_content: `${title.trim()} — ${description.trim()}`,
          reason: modData.reason || "Flagged by AI",
          category: modData.categories?.[0] || "content",
        });
      }
    } else {
      console.error("Moderation check failed, proceeding:", modResult.reason);
    }

    // CRITICAL: Check image upload result BEFORE any balance deduction
    {
      let earlyImageUrl: string | null = null;
      if (imageUploadResult.status === "fulfilled") {
        earlyImageUrl = imageUploadResult.value as string | null;
      }
      if (!earlyImageUrl && imagePreview && !imagePreview.startsWith("blob:")) {
        earlyImageUrl = imagePreview; // AI-generated URL
      }
      if (imageFile && !earlyImageUrl) {
        toast.error("Image upload failed. No charge was taken.");
        setSubmitStep("error");
        isSubmittingRef.current = false;
        return;
      }
      if (!earlyImageUrl) {
        toast.error("A cover image is required.");
        setSubmitStep("error");
        isSubmittingRef.current = false;
        return;
      }
    }

    // Step 1: Check and deduct balance
    setSubmitStep("deploying");
    setCompletedSteps(prev => new Set([...prev, 1]));

    const { data: bal, error: balError } = await supabase
      .from("balances")
      .select("amount, bonus_balance")
      .eq("user_id", user.id)
      .single();

    if (balError || !bal) {
      setSubmitStep("error");
      toast.error("Could not fetch your balance");
      return;
    }

    // Referral bonus can only cover the creation fee portion, not liquidity
    // If escrow is held, the creation fee is already deducted — skip it from fee calculation
    const creationFeeForDeduction = (feeBypass && !escrowId && !unlimitedMarkets) ? marketCreationFee : 0;
    const feeAmount = creationFeeForDeduction + (autoResolve && autoResolveFee > 0 ? autoResolveFee : 0) + boostCost + broadcastCost;
    const bonusForFee = Math.min(Number(bal.bonus_balance || 0), feeAmount);

    // Use secure server-side function to deduct balance (RLS blocks client-side updates)
    const { data: deductResult, error: deductError } = await supabase.rpc(
      "deduct_market_liquidity" as any,
      {
        _user_id: user.id,
        _liquidity_amount: liquidityAmount,
        _fee_amount: feeAmount,
        _bonus_for_fee: bonusForFee,
      }
    );

    if (deductError) {
      setSubmitStep("error");
      toast.error("Failed to deduct liquidity from your balance");
      return;
    }

    const result = typeof deductResult === "string" ? JSON.parse(deductResult) : deductResult;
    if (!result?.success) {
      setSubmitStep("error");
      toast.error(result?.error || "Insufficient balance for market creation", {
        action: {
          label: "Deposit Now",
          onClick: () => setDepositModalOpen(true),
        },
      });
      return;
    }

    setCompletedSteps(prev => new Set([...prev, 2]));

    // Simulate on-chain contract deployment (reduced from 1200ms)
    await new Promise((r) => setTimeout(r, 400));
    const mockTxHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
    const mockContractAddr = `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;
    setTxHash(mockTxHash);

    setCompletedSteps(prev => new Set([...prev, 3]));
    setSubmitStep("saving");

    // If similar, flagged, or fee bypass — needs admin review
    const needsReview = isSimilar || isFlagged || (feeBypass && !unlimitedMarkets);
    const marketStatus = needsReview ? "pending" : "active";

    // Image was already validated before balance deduction — extract result
    let imageUrl: string | null = null;
    if (imageUploadResult.status === "fulfilled") {
      imageUrl = imageUploadResult.value as string | null;
    }
    if (!imageUrl && imagePreview && !imagePreview.startsWith("blob:")) {
      imageUrl = imagePreview;
    }

    // Save to database
    const autoResolveDeadline = autoResolve && endDate && autoResolveTime
      ? new Date(`${endDate}T${autoResolveTime}:00Z`).toISOString()
      : null;

    const marketData = {
        creator_wallet: user.id,
        creator_name: displayName,
        title: title.trim(),
        description: description.trim(),
        details: details.trim() || null,
        video_url: videoUrl.trim() || null,
        image_url: imageUrl,
        category,
        end_date: endDate,
        resolution_source: resolutionSource.trim(),
        initial_liquidity: liquidityAmount,
        liquidity: liquidityAmount,
        tx_hash: mockTxHash,
        contract_address: mockContractAddr,
        market_type: marketType,
        status: marketStatus,
        auto_resolve: autoResolve,
        auto_resolve_asset: autoResolve && isPriceAutoResolveCategory(category) ? autoResolveAsset : null,
        auto_resolve_target_price: autoResolve && isPriceAutoResolveCategory(category) ? parseFloat(autoResolveTargetPrice) : null,
        auto_resolve_operator: autoResolve && isPriceAutoResolveCategory(category) ? autoResolveOperator : null,
        auto_resolve_deadline: autoResolveDeadline,
        sport_type: autoResolve && category === "Sports" ? sportType : null,
        sport_match_id: autoResolve && category === "Sports" ? sportMatchId : null,
        sport_predicted_outcome: autoResolve && category === "Sports" ? sportPredictedOutcome : null,
        sport_league: autoResolve && category === "Sports" ? sportLeague || null : null,
        twitter_resource_id: autoResolve && category === "Twitter/X" ? twitterResourceId || null : null,
        twitter_metric_type: autoResolve && category === "Twitter/X" ? twitterMetricType : null,
      };

    let data: { id: string } | null = null;
    let error: any = null;

    if (draftId) {
      // Use secure RPC to publish draft (RLS blocks status changes via direct update)
      const { data: publishResult, error: publishError } = await supabase.rpc(
        "publish_draft_market" as any,
        {
          _market_id: draftId,
          _market_data: marketData,
        }
      );
      if (publishError) {
        error = publishError;
      } else {
        const parsed = typeof publishResult === "string" ? JSON.parse(publishResult) : publishResult;
        if (!parsed?.success) {
          error = { message: parsed?.error || "Failed to publish draft" };
        } else {
          data = { id: draftId };
        }
      }
    } else {
      const result = await supabase
        .from("markets")
        .insert(marketData as any)
        .select("id")
        .maybeSingle();
      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error("Failed to save market:", error);
      // Refund via secure RPC (rollback the deduction)
      // When escrowId exists, the creation fee was already held in escrow — don't include it in rollback
      const rollbackFeeAmount = ((feeBypass && !escrowId && !unlimitedMarkets) ? marketCreationFee : 0) + (autoResolve && autoResolveFee > 0 ? autoResolveFee : 0) + boostCost + broadcastCost;
      const bonusForFeeRollback = Math.min(Number(bal.bonus_balance || 0), rollbackFeeAmount);
      await supabase.rpc("deduct_market_liquidity" as any, {
        _user_id: user.id,
        _liquidity_amount: -liquidityAmount,
        _fee_amount: -rollbackFeeAmount,
        _bonus_for_fee: -bonusForFeeRollback,
      });
      // Release escrow as refunded on technical failure
      if (escrowId) {
        await supabase.rpc("release_creation_fee_escrow" as any, {
          _escrow_id: escrowId,
          _action: "refunded",
        });
        setEscrowId(null);
      }
      setSubmitStep("error");
      const errorMsg = error?.message || "Unknown error";
      toast.error(`Failed to save market: ${errorMsg}. Your balance has been refunded.`);
      return;
    }

    // Record the liquidity transaction
    await supabase.from("transactions").insert({
      user_id: user.id,
      type: "buy",
      amount: liquidityAmount,
      market_id: data?.id,
      status: "confirmed",
      side: "initial_liquidity",
    });

    // Record the creation fee transaction if fee bypass
    if (feeBypass && !unlimitedMarkets) {
      await supabase.from("transactions").insert({
        user_id: user.id,
        type: "buy",
        amount: marketCreationFee,
        market_id: data?.id,
        status: "confirmed",
        side: "market_creation_fee",
      });
      // If no escrow was used (exceeded free limit path), credit platform pool now
      if (!escrowId) {
        await supabase.rpc("adjust_platform_pool" as any, { _delta: marketCreationFee });
      }
    }

    // Record auto-resolve fee transaction
    if (autoResolve && autoResolveFee > 0) {
      await supabase.from("transactions").insert({
        user_id: user.id,
        type: "buy",
        amount: autoResolveFee,
        market_id: data?.id,
        status: "confirmed",
        side: "auto_resolve_fee",
      });
    }

    // Save options for multi/range markets
    if (marketType !== "binary" && data?.id) {
      const validOptions = options.filter(o => o.trim());
      const equalPrice = Math.round((1 / validOptions.length) * 100) / 100;
      const { data: savedOpts, error: optError } = await supabase
        .from("market_options")
        .insert(
          validOptions.map((label, i) => ({
            market_id: data.id,
            label: label.trim(),
            price: equalPrice,
            sort_order: i,
          }))
        )
        .select("id, label, sort_order");
      if (optError) {
        console.error("Failed to save options:", optError);
      }
      if (savedOpts) {
        setNewMarketOptions(savedOpts);
      }
    }

    // Create boost record if selected (paid from balance, activate immediately)
    if (creationBoost && data?.id) {
      const boostEnds = new Date();
      boostEnds.setHours(boostEnds.getHours() + BOOST_TIER_HOURS[creationBoostTier]);
      await supabase.from("market_boosts").insert({
        market_id: data.id,
        tier: creationBoostTier,
        amount: boostTierPrices[creationBoostTier],
        payer_wallet: user.id,
        ends_at: boostEnds.toISOString(),
        status: "active",
      });
      await supabase.from("transactions").insert({
        user_id: user.id,
        type: "buy",
        amount: boostTierPrices[creationBoostTier],
        market_id: data.id,
        status: "confirmed",
        side: "boost_fee",
      });
    }

    // Create broadcast record if selected (paid from balance, send immediately)
    if (creationBroadcast && data?.id) {
      const { data: broadcastRec } = await supabase.from("market_broadcasts").insert({
        market_id: data.id,
        user_id: user.id,
        tier: "alert",
        amount: broadcastPriceVal,
        status: "pending",
      }).select("id").single();

      await supabase.from("transactions").insert({
        user_id: user.id,
        type: "buy",
        amount: broadcastPriceVal,
        market_id: data.id,
        status: "confirmed",
        side: "broadcast_fee",
      });

      // Trigger broadcast notification
      if (broadcastRec?.id) {
        supabase.functions.invoke("send-market-broadcast", {
          body: { broadcast_id: broadcastRec.id, market_id: data.id },
        }).catch((err) => console.error("Failed to trigger broadcast:", err));
      }
    }

    setCompletedSteps(prev => new Set([...prev, 4]));
    setNewMarketId(data?.id || "");
    setCreatedAsPending(needsReview);

    // Draft is now promoted to active/pending — clear draft tracking
    clearFormStorage();
    setDraftId(null);
    setDraftBannerDraft(null);

    // Release escrow as 'used' if we had one
    if (escrowId) {
      await supabase.rpc("release_creation_fee_escrow" as any, {
        _escrow_id: escrowId,
        _action: "used",
      });
      setEscrowId(null);
    }

    if (needsReview) {
      // Pending markets go straight to success (no first prediction needed)
      setSubmitStep("success");
      if (feeBypass) {
        toast.info("Your market requires approval. The creation fee ($" + marketCreationFee + ") is non-refundable.");
      } else if (isFlagged) {
        toast.warning("Your market was flagged for inappropriate content and is pending review.");
      } else if (isSimilar) {
        toast.info("Your market was flagged as similar to an existing one and is pending review.");
      }
    } else {
      // Active markets require first prediction
      setSubmitStep("first_prediction");
      toast.success("Market created! Now place your first prediction to make it official.");
    }
  };

  // Token-gate verification using wallet NFTs
  const runGateCheck = async () => {
    setGateRunning(true);
    setGateFinished(false);
    setGateChecks([
      { label: "Wallet Connected", icon: <Wallet className="w-4 h-4" />, status: "checking" },
      { label: "BC400 Token Balance", icon: <Coins className="w-4 h-4" />, status: "idle" },
      { label: "BC400 NFT", icon: <ImageIcon className="w-4 h-4" />, status: "idle" },
    ]);

    // Step 1: Wallet — always passes if connected
    await new Promise((r) => setTimeout(r, 600));
    setGateChecks((prev) =>
      prev.map((c, i) =>
        i === 0
          ? { ...c, status: "passed", detail: `${address?.slice(0, 6)}...${address?.slice(-4)}` }
          : i === 1
          ? { ...c, status: "checking" }
          : c
      )
    );

    // Step 2: Token balance check via BSC RPC edge function
    let tokenPassed = false;
    try {
      if (tokenContractAddress) {
        const { data, error } = await supabase.functions.invoke("check-token-balance", {
          body: { wallet_address: address, token_contract_address: tokenContractAddress, token_decimals: tokenDecimals },
        });
        if (!error && data?.balance >= minTokenBalance) {
          tokenPassed = true;
        }
        setGateChecks((prev) =>
          prev.map((c, i) =>
            i === 1
              ? {
                  ...c,
                  status: tokenPassed ? "passed" : "failed",
                  detail: tokenPassed
                    ? `${Number(data?.balance || 0).toLocaleString()} BC400`
                    : `${Number(data?.balance || 0).toLocaleString()} / ${minTokenBalance.toLocaleString()} BC400`,
                }
              : i === 2
              ? { ...c, status: "checking" }
              : c
          )
        );
      } else {
        // No token contract configured — skip check as failed
        setGateChecks((prev) =>
          prev.map((c, i) =>
            i === 1
              ? { ...c, status: "failed", detail: "Token contract not configured" }
              : i === 2
              ? { ...c, status: "checking" }
              : c
          )
        );
      }
    } catch (err) {
      console.error("Token balance check error:", err);
      setGateChecks((prev) =>
        prev.map((c, i) =>
          i === 1
            ? { ...c, status: "failed", detail: "Check failed" }
            : i === 2
            ? { ...c, status: "checking" }
            : c
        )
      );
    }

    // Step 3: NFT check via edge function
    await new Promise((r) => setTimeout(r, 900));
    let nftPassed = false;
    try {
      const { data, error } = await supabase.functions.invoke("fetch-wallet-nfts", {
        body: { wallet_address: address, nft_contract_address: nftContractAddress },
      });
      if (!error && data?.nfts) {
        // If a specific NFT contract is configured, filter by it
        const targetContract = nftContractAddress?.toLowerCase();
        const qualifyingNfts = targetContract
          ? data.nfts.filter((nft: any) => nft.token_address?.toLowerCase() === targetContract)
          : data.nfts;
        if (qualifyingNfts.length >= minNftBalance) {
          nftPassed = true;
        }
      }
    } catch {
      // NFT check failed
    }

    setGateChecks((prev) =>
      prev.map((c, i) =>
        i === 2
          ? { ...c, status: nftPassed ? "passed" : "failed", detail: nftPassed ? `≥ ${minNftBalance} NFT found` : "No qualifying NFTs" }
          : c
      )
    );

    const passed = tokenPassed || nftPassed;
    
    // Check if verified user exceeded free market limit (skip for whitelisted creators)
    if (passed && !unlimitedMarkets) {
      const limit = verificationLevel === "gold" ? goldMaxFreeMarkets : verificationLevel === "blue" ? blueMaxFreeMarkets : 0;
      if (limit > 0 && activeMarketCount >= limit) {
        setExceededFreeLimit(true);
        setFeeBypass(true);
      }
    }
    
    setGatePassed(passed);
    setGateFinished(true);
    setGateRunning(false);
  };

  useEffect(() => {
    if (isConnected && settingsLoaded && !gatePassed && !gateRunning && gateChecks.length === 0) {
      if (unlimitedMarkets) {
        setGatePassed(true);
        setGateFinished(true);
      } else {
        runGateCheck();
      }
    }
  }, [isConnected, settingsLoaded, unlimitedMarkets]);

  // Fee bypass — check balance, show confirmation, then escrow
  const handleFeeBypass = async () => {
    if (!user) { toast.error("Sign in first"); return; }
    if (balanceLoading) {
      toast.info("Loading your balance, please wait...");
      return;
    }
    if (totalBalance < marketCreationFee) {
      toast.error(`Insufficient balance. You need at least $${marketCreationFee} to proceed.`, {
        action: {
          label: "Deposit Now",
          onClick: () => setDepositModalOpen(true),
        },
      });
      return;
    }
    setShowFeeConfirm(true);
  };

  const confirmFeeEscrow = async () => {
    setShowFeeConfirm(false);
    setFeeBypassLoading(true);
    try {
      const { data, error } = await supabase.rpc("hold_creation_fee_escrow" as any, {
        _user_id: user!.id,
        _amount: marketCreationFee,
      });
      const result = typeof data === "string" ? JSON.parse(data) : data;
      if (error || !result?.success) {
        toast.error(result?.error || "Failed to hold escrow. Please try again.");
        return;
      }
      setEscrowId(result.escrow_id);
      setFeeBypass(true);
      setGatePassed(true);
      toast.success("Access Granted! 🎉 Your $" + marketCreationFee + " fee is held in escrow.");
    } catch (err: any) {
      toast.error(err.message || "Escrow failed");
    } finally {
      setFeeBypassLoading(false);
    }
  };

  // Resume held escrow on mount
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("creation_fee_escrows")
        .select("id, amount")
        .eq("user_id", user.id)
        .eq("status", "held")
        .limit(1)
        .maybeSingle();
      if (data) {
        setEscrowId(data.id);
        setFeeBypass(true);
        setGatePassed(true);
      }
    })();
  }, [user]);

  const pancakeSwapUrl = tokenContractAddress
    ? `https://pancakeswap.finance/swap?outputCurrency=${tokenContractAddress}&chain=bsc`
    : "https://pancakeswap.finance/swap";

  const isFormValid =
    title.trim().length >= 10 &&
    description.trim().length >= 20 &&
    category &&
    endDate &&
    resolutionSource.trim().length >= 10 &&
    (marketType === "binary" || options.filter(o => o.trim()).length >= 2);

  const statusIcon = (status: GateStatus) => {
    switch (status) {
      case "idle":
        return <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />;
      case "checking":
        return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
      case "passed":
        return <CheckCircle2 className="w-5 h-5 text-primary" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-destructive" />;
    }
  };

  // --- Auth Loading ---
  if (authLoading) {
    return (
      <div className="min-h-dvh bg-background" style={{ paddingBottom: 'calc(1rem + var(--content-bottom))' }}>
        <TopBar />
        <div className="max-w-lg md:max-w-2xl mx-auto px-4 flex items-center justify-center min-h-[70dvh]" style={{ paddingTop: 'calc(var(--content-top) + 1rem)' }}>
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
        <BottomNav />
      </div>
    );
  }

  // --- Auth Gate: Must be signed in ---
  if (!user) {
    return (
      <div className="min-h-dvh bg-background" style={{ paddingBottom: 'calc(1rem + var(--content-bottom))' }}>
        <TopBar />
        <div className="max-w-lg md:max-w-2xl mx-auto px-4 flex flex-col items-center justify-center min-h-[70dvh]" style={{ paddingTop: 'calc(var(--content-top) + 1rem)' }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-6 w-full max-w-sm"
          >
            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 rounded-full bg-muted border border-border flex items-center justify-center">
                <User className="w-7 h-7 text-muted-foreground" />
              </div>
            </div>

            <h2 className="text-xl font-bold text-center mb-1">Sign In Required</h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
              You need an account to create prediction markets. Sign in or create an account to get started.
            </p>

            {/* Steps preview */}
            <div className="space-y-2.5 mb-6">
              {[
                { step: "1", label: "Sign in to your account", icon: <User className="w-4 h-4" />, active: true },
                { step: "2", label: "Connect your EVM Wallet", icon: <Wallet className="w-4 h-4" />, active: false },
                { step: "3", label: "Verify your token holdings", icon: <Coins className="w-4 h-4" />, active: false },
              ].map((s) => (
                <div
                  key={s.step}
                  className={`flex items-center gap-3 p-3 rounded-xl ${
                    s.active
                      ? "bg-primary/10 border border-primary/30"
                      : "bg-muted/50 border border-border opacity-50"
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    s.active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>
                    {s.step}
                  </div>
                  <span className="text-sm font-medium flex-1">{s.label}</span>
                  {s.icon}
                </div>
              ))}
            </div>

            <button
              onClick={() => navigate("/auth")}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold transition-all active:scale-95"
            >
              <LogIn className="w-4 h-4" />
              Sign In to Create
            </button>
          </motion.div>
        </div>
        <BottomNav />
      </div>
    );
  }

  // --- Token Gate Screen (user is signed in, check wallet + tokens) ---
  if (!isConnected || !gatePassed) {
    return (
      <div className="min-h-dvh bg-background" style={{ paddingBottom: 'calc(1rem + var(--content-bottom))' }}>
        <TopBar />
        <div className="max-w-lg md:max-w-2xl mx-auto px-4 flex flex-col items-center justify-center min-h-[70dvh]" style={{ paddingTop: 'calc(var(--content-top) + 1rem)' }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-6 w-full max-w-sm"
          >
            {/* Icon */}
            <div className="flex justify-center mb-5">
              <motion.div
                animate={gatePassed ? { scale: [1, 1.15, 1] } : {}}
                transition={{ duration: 0.4 }}
                className={`w-16 h-16 rounded-full flex items-center justify-center ${
                  gatePassed
                    ? "bg-primary/20 border border-primary/40"
                    : "bg-muted border border-border"
                }`}
              >
                {gatePassed ? (
                  <Unlock className="w-7 h-7 text-primary" />
                ) : (
                  <Lock className="w-7 h-7 text-muted-foreground" />
                )}
              </motion.div>
            </div>

            <h2 className="text-xl font-bold text-center mb-1">
              {gatePassed ? "Access Granted" : "Creator Verification"}
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
              {isConnected
                ? "Verifying your eligibility to create markets..."
                : "Connect your wallet to verify token holdings and unlock market creation."}
            </p>

            {/* Gate checks */}
            {isConnected && gateChecks.length > 0 && (
              <div className="space-y-3 mb-6">
                {gateChecks.map((check, i) => (
                  <motion.div
                    key={check.label}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.15 }}
                    className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                      check.status === "passed"
                        ? "bg-primary/5 border border-primary/20"
                        : check.status === "failed"
                        ? "bg-destructive/5 border border-destructive/20"
                        : "bg-muted/50 border border-border"
                    }`}
                  >
                    {statusIcon(check.status)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{check.label}</p>
                      {check.detail && (
                        <p className="text-xs text-muted-foreground truncate">{check.detail}</p>
                      )}
                    </div>
                    {check.icon}
                  </motion.div>
                ))}
                {/* Re-check eligibility — right below NFT check */}
                {gateFinished && !gatePassed && (
                  <button
                    onClick={() => { setGateChecks([]); setGateFinished(false); runGateCheck(); }}
                    disabled={gateRunning}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm text-destructive hover:text-destructive/80 transition-colors"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    Re-check eligibility
                  </button>
                )}
              </div>
            )}

            {/* Connect wallet — when wallet not connected */}
            {!isConnected && (
              <div className="glass rounded-xl p-5 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Wallet className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-sm font-bold">Wallet Connection Required</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Connect your wallet to verify token holdings and unlock market creation.
                </p>

                {/* Connect button */}
                <div className="space-y-2 pt-1">
                  <button
                    onClick={() => open()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground transition-all active:scale-95"
                  >
                    <Wallet className="w-4 h-4" />
                    Connect Wallet
                  </button>
                </div>

                <div className="flex flex-wrap justify-center gap-2 pt-1">
                  {[
                    { name: "MetaMask", emoji: "🦊" },
                    { name: "Trust Wallet", emoji: "🛡️" },
                    { name: "SafePal", emoji: "🔐" },
                    { name: "Coinbase", emoji: "🔵" },
                    { name: "Rabby", emoji: "🐰" },
                    { name: "Binance", emoji: "🟡" },
                  ].map((w) => (
                    <span key={w.name} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted/50 border border-border text-[10px] font-medium text-muted-foreground">
                      <span>{w.emoji}</span> {w.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons — when gate finished but failed */}
            {isConnected && gateFinished && !gatePassed && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-2.5 mt-2"
              >
                <p className="text-xs text-muted-foreground text-center mb-3">
                  You don't meet the requirements yet. Choose an option below:
                </p>

                {/* Buy Token — opens embedded swap modal */}
                <button
                  onClick={() => setSwapModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold transition-all active:scale-95"
                >
                  <Coins className="w-4 h-4" />
                  Buy BC400 Token
                </button>

                {/* Buy/Mint NFT */}
                {nftBuyUrl && (
                  <a
                    href={nftBuyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-primary text-primary font-semibold transition-all active:scale-95 hover:bg-primary/5"
                  >
                    <ImageIcon className="w-4 h-4" />
                    Mint / Buy NFT
                  </a>
                )}

                {/* No NFT or Token? Proceed with fee */}
                <button
                  onClick={handleFeeBypass}
                  disabled={feeBypassLoading || balanceLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-neon-yes text-background font-semibold transition-all active:scale-95 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {feeBypassLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <DollarSign className="w-4 h-4" />
                  )}
                  {feeBypassLoading ? "Processing..." : balanceLoading ? "Loading balance..." : "No NFT or BC400? No problem."}
                </button>

              </motion.div>
            )}

            {/* Requirements info */}
            <div className="mt-5 p-3 rounded-xl bg-muted/50 border border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-semibold">
                Requirements (any one)
              </p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Coins className="w-3 h-3 text-primary" />
                  Hold ≥ {minTokenBalance.toLocaleString()} BC400 tokens
                </li>
                <li className="flex items-center gap-2">
                  <ImageIcon className="w-3 h-3 text-primary" />
                  Own ≥ {minNftBalance} BC400 NFT{minNftBalance !== 1 ? "s" : ""}
                </li>
                <li>
                  <button
                    onClick={handleFeeBypass}
                    className="flex items-center gap-2 text-xs font-semibold text-primary hover:text-primary/80 transition-colors active:scale-95 underline underline-offset-2"
                  >
                    <DollarSign className="w-3 h-3" />
                    No NFT, BC400 or Wallet? No Problem! (${marketCreationFee} fee)
                  </button>
                </li>
              </ul>
            </div>
          </motion.div>
        </div>
        <SwapModal
          open={swapModalOpen}
          onClose={() => {
            setSwapModalOpen(false);
            // Auto re-check eligibility after closing swap modal
            setGateChecks([]);
            setGateFinished(false);
            setGatePassed(false);
            runGateCheck();
          }}
          tokenContractAddress={tokenContractAddress}
        />
        <BottomNav />

        {/* Fee bypass confirmation dialog — must be inside gate screen return */}
        <AlertDialog open={showFeeConfirm} onOpenChange={setShowFeeConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                Market Creation Fee
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>You will be charged <strong className="text-foreground">${marketCreationFee}</strong> for market creation. This fee will be held in escrow immediately.</p>
                <p>The fee is <strong className="text-foreground">non-refundable</strong> and your funds will be locked until you complete your market creation.</p>
                <p>Do you still want to proceed?</p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmFeeEscrow}>
                Proceed — Charge ${marketCreationFee}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <DepositWithdrawModal open={depositModalOpen} onClose={() => { setDepositModalOpen(false); queryClient.invalidateQueries({ queryKey: ["balance"] }); }} initialTab="deposit" />
      </div>
    );
  }

  // --- Market Creation Form ---
  return (
    <div className="h-dvh bg-background overflow-y-auto overscroll-contain" style={{ paddingBottom: 'calc(2rem + var(--content-bottom))' }}>
      <TopBar />
      <div className="max-w-lg md:max-w-2xl mx-auto px-3 sm:px-4" style={{ paddingTop: 'calc(var(--content-top) + 0.75rem)' }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${feeBypass ? "bg-accent" : "bg-primary/20"}`}>
              {feeBypass ? <DollarSign className="w-3.5 h-3.5 text-accent-foreground" /> : <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
            </div>
            <span className={`text-xs font-semibold ${feeBypass ? "text-accent-foreground" : "text-primary"}`}>
              {feeBypass ? "Fee-Based Creator" : "Verified Creator"}
            </span>
          </div>
          <h1 className="text-2xl font-bold">Create Market</h1>
          <p className="text-sm text-muted-foreground">
            Launch a prediction market and earn fees from every trade.
          </p>
          {exceededFreeLimit && !unlimitedMarkets && (
            <div className="mt-3 p-3 rounded-xl bg-accent/10 border border-accent/30">
              <p className="text-xs font-medium text-accent-foreground">
                ⚠️ You've reached your free market limit ({activeMarketCount}/{verificationLevel === "gold" ? goldMaxFreeMarkets : blueMaxFreeMarkets}).
                A creation fee of ${marketCreationFee} applies for additional markets.
              </p>
            </div>
          )}
        </motion.div>

        {/* Draft resume banner — blocks form until resolved */}
        {!draftLoading && draftBannerDraft && !draftId && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-4 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-3"
          >
            <FileText className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Unfinished Draft</p>
              <p className="text-xs text-muted-foreground truncate">{draftBannerDraft.title}</p>
              <p className="text-[11px] text-muted-foreground mt-1">You must complete or discard your existing draft before creating a new market.</p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleResumeDraft}
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold transition-all active:scale-95"
                >
                  Resume Draft
                </button>
                <button
                  onClick={handleDiscardDraft}
                  className="px-3 py-1.5 rounded-lg bg-muted border border-border text-xs font-semibold text-muted-foreground hover:text-destructive transition-all active:scale-95"
                >
                  Discard
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Block form when draft exists but not resumed */}
        {draftBannerDraft && !draftId ? null : (<>


        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step >= s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s}
              </div>
              {s < 3 && (
                <div
                  className={`flex-1 h-0.5 rounded-full transition-colors ${
                    step > s ? "bg-primary" : "bg-border"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Step 1: Basic Info */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              {/* AI Agent Section */}
              {isFeatureEnabled("ai_market_creation") && (
                <div className="glass rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setAiAgentOpen(!aiAgentOpen)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/30 transition-colors"
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
                        <div className="px-4 pb-4 space-y-3">
                          <p className="text-[11px] text-muted-foreground">
                            Describe the market you want to create and AI will fill in all the fields for you. Cost: ${aiGenerationCost.toFixed(2)}
                          </p>
                          <textarea
                            value={aiAgentPrompt}
                            onChange={(e) => setAiAgentPrompt(e.target.value)}
                            placeholder="e.g. Create an auto resolve market: Will there be a Tyson Fury vs Anthony Joshua fight before December 2026?"
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
                            <Mic className={`w-4 h-4 ${isListening ? "text-red-500 animate-pulse" : ""}`} />
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
              <div className={`glass rounded-xl p-4 ${shakeClass("title")} ${touched.title && errors.title ? "border-destructive/50" : ""}`}>
                <label className="flex items-center gap-2 text-sm font-semibold mb-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Market Question
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => markTouched("title")}
                  placeholder="Will Bitcoin hit $150K before July 2026?"
                  className={`w-full bg-muted/50 border rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 transition-all ${
                    touched.title && errors.title ? "border-destructive focus:ring-destructive/30" : "border-border focus:ring-primary/30"
                  }`}
                  maxLength={120}
                />
                <div className="flex justify-between mt-1.5">
                  {touched.title && errors.title ? (
                    <p className="text-[10px] text-destructive">{errors.title}</p>
                  ) : <span />}
                  <p className="text-[10px] text-muted-foreground">{title.length}/120</p>
                </div>
              </div>

              <div className={`glass rounded-xl p-4 ${shakeClass("description")} ${touched.description && errors.description ? "border-destructive/50" : ""}`}>
                <div className="flex items-center justify-between mb-2">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <FileText className="w-4 h-4 text-primary" />
                    Description
                  </label>
                  {isFeatureEnabled("ai_generate_description") && (
                    <button
                      type="button"
                      onClick={() => setPendingAiType("description")}
                      disabled={generatingDesc || !title.trim()}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {generatingDesc ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                     Generate (${aiGenerationCost.toFixed(2)})
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mb-1.5">Type manually for free, or use AI to generate for a fee.</p>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => markTouched("description")}
                  placeholder="Describe how this market resolves. Be specific about conditions, data sources, and edge cases."
                  rows={4}
                  className={`w-full bg-muted/50 border rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 transition-all resize-none ${
                    touched.description && errors.description ? "border-destructive focus:ring-destructive/30" : "border-border focus:ring-primary/30"
                  }`}
                  maxLength={500}
                />
                <div className="flex justify-between mt-1.5">
                  {touched.description && errors.description ? (
                    <p className="text-[10px] text-destructive">{errors.description}</p>
                  ) : <span />}
                  <p className="text-[10px] text-muted-foreground">{description.length}/500</p>
                </div>
              </div>

              <DetailsField details={details} setDetails={setDetails} error={errors.details} touched={!!touched.details} onBlur={() => markTouched("details")} shakeClass={shakeClass("details")} onGenerate={isFeatureEnabled("ai_generate_details") ? () => setPendingAiType("details") : undefined} generating={generatingDetails} aiCost={aiGenerationCost} />

              {/* Market Type */}
              <div className="glass rounded-xl p-4">
                <label className="flex items-center gap-2 text-sm font-semibold mb-3">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Market Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: "binary" as const, label: "Yes / No", icon: <Target className="w-4 h-4" />, desc: "Two outcomes" },
                    { key: "multi" as const, label: "Multiple", icon: <BarChart3 className="w-4 h-4" />, desc: "2-6 choices" },
                    { key: "range" as const, label: "Range", icon: <TrendingUp className="w-4 h-4" />, desc: "Price brackets" },
                  ]).map((t) => (
                    <button
                      key={t.key}
                      onClick={() => {
                        setMarketType(t.key);
                        if (t.key === "binary") setOptions(["", ""]);
                      }}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl text-center transition-all active:scale-95 ${
                        marketType === t.key
                          ? "bg-primary/15 border border-primary/40 text-primary"
                          : "bg-muted/50 border border-border text-foreground hover:bg-muted"
                      }`}
                    >
                      {t.icon}
                      <span className="text-xs font-semibold">{t.label}</span>
                      <span className="text-[9px] text-muted-foreground">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Options builder for multi/range */}
              {marketType !== "binary" && (
                <div className={`glass rounded-xl p-4 ${shakeClass("options")} ${touched.options && errors.options ? "border-destructive/50" : ""}`}>
                  <label className="flex items-center gap-2 text-sm font-semibold mb-3">
                    <Plus className="w-4 h-4 text-primary" />
                    {marketType === "range" ? "Price Brackets" : "Answer Options"}
                  </label>
                  <div className="space-y-2">
                    {options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: [
                            "hsl(var(--primary))", "hsl(var(--destructive))", "hsl(45, 93%, 58%)",
                            "hsl(280, 70%, 60%)", "hsl(30, 80%, 55%)", "hsl(var(--muted-foreground))"
                          ][i] }}
                        />
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => updateOption(i, e.target.value)}
                          placeholder={marketType === "range" ? `e.g. $50K – $100K` : `Option ${i + 1}`}
                          className="flex-1 bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                          maxLength={50}
                        />
                        {options.length > 2 && (
                          <button
                            onClick={() => removeOption(i)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {options.length < 6 && (
                    <button
                      onClick={addOption}
                      className="mt-2 w-full py-2 rounded-lg border border-dashed border-border text-xs font-semibold text-muted-foreground hover:text-primary hover:border-primary/30 transition-all"
                    >
                      + Add Option
                    </button>
                  )}
                  {touched.options && errors.options && (
                    <p className="text-[10px] text-destructive mt-2">{errors.options}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Prices will be distributed equally at launch. {options.filter(o => o.trim()).length}/6 options.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => saveDraft()}
                  disabled={savingDraft}
                  className="flex-1 glass py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {savingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  Save Draft
                </button>
                <button
                  onClick={tryAdvanceStep1}
                  className="flex-1 bg-primary text-primary-foreground py-3.5 rounded-xl font-semibold transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 2: Category & Timing */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className={`glass rounded-xl p-4 ${shakeClass("category")} ${touched.category && errors.category ? "border-destructive/50" : ""}`}>
                <label className="flex items-center gap-2 text-sm font-semibold mb-3">
                  <Tag className="w-4 h-4 text-primary" />
                  Category
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => { setCategory(cat); markTouched("category"); }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95 ${
                        category === cat
                          ? "bg-primary/15 border border-primary/40 text-primary"
                          : "bg-muted/50 border border-border text-foreground hover:bg-muted"
                      }`}
                    >
                      <CategoryIcon category={cat} className="w-4 h-4" />
                      {cat}
                    </button>
                  ))}
                </div>
                {touched.category && errors.category && (
                  <p className="text-[10px] text-destructive mt-2">{errors.category}</p>
                )}
              </div>

              {/* Auto-Resolve Toggle (Price-based: Crypto, Commodities, Forex) */}
              {isPriceAutoResolveCategory(category) && (
                <div className="glass rounded-xl p-4 space-y-3">
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
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-3 pt-2 border-t border-border/50"
                    >
                      {/* Asset Selector */}
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

                      {/* Operator */}
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

                      {/* Target Price */}
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block">{category === "Forex" ? "Target Rate" : "Target Price (USD)"}</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{category === "Forex" ? "" : "$"}</span>
                          <input
                            type="number"
                            value={autoResolveTargetPrice}
                            onChange={(e) => setAutoResolveTargetPrice(e.target.value)}
                            placeholder={category === "Forex" ? "e.g. 1.1250" : category === "Commodities" ? "e.g. 2500" : "e.g. 150000"}
                            className={`w-full bg-muted/50 border border-border rounded-xl ${category === "Forex" ? "pl-4" : "pl-7"} pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30`}
                            min="0"
                            step="any"
                          />
                        </div>
                      </div>

                      {/* Resolution Time */}
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block">Resolution Deadline Time (UTC)</label>
                        <input
                          type="time"
                          value={autoResolveTime}
                          onChange={(e) => setAutoResolveTime(e.target.value)}
                          className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Combined with the resolution date above. If condition isn't met by this time, resolves NO.
                        </p>
                      </div>

                      {/* Preview */}
                      {autoResolveTargetPrice && endDate && (
                        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                          <p className="text-xs font-medium text-primary">
                            ⚡ Resolves YES if {autoResolveAsset} {OPERATORS.find(o => o.value === autoResolveOperator)?.label.toLowerCase()} {category === "Forex" ? "" : "$"}{Number(autoResolveTargetPrice).toLocaleString()} by {endDate} {autoResolveTime} UTC
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              )}

              {/* Auto-Resolve Toggle (Sports only) */}
              {category === "Sports" && (
                <div className="glass rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        <Trophy className="w-4 h-4 text-primary" />
                        Auto-Resolve by Match Result
                      </label>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Automatically resolves when the match finishes
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        const next = !autoResolve;
                        setAutoResolve(next);
                        if (next) {
                          setMarketType("binary");
                          setResolutionSource(`Auto-resolved via live ${sportType} match result`);
                        }
                      }}
                      className={`w-11 h-6 rounded-full transition-colors relative ${autoResolve ? "bg-primary" : "bg-muted"}`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${autoResolve ? "translate-x-[22px]" : "translate-x-0.5"}`} />
                    </button>
                  </div>

                  {autoResolve && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-3 pt-2 border-t border-border/50"
                    >
                      {/* Sport Type */}
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block">Sport</label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {SPORT_TYPES.map((s) => (
                            <button
                              key={s.value}
                              disabled={!s.enabled}
                              onClick={() => {
                                if (!s.enabled) return;
                                setSportType(s.value);
                                setResolutionSource(`Auto-resolved via live ${s.label} match result`);
                              }}
                              className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                !s.enabled
                                  ? "bg-muted/30 border border-border/50 text-muted-foreground/40 cursor-not-allowed"
                                  : sportType === s.value
                                    ? "bg-primary/15 border border-primary/40 text-primary"
                                    : "bg-muted/50 border border-border text-muted-foreground hover:text-foreground"
                              }`}
                              title={!s.enabled ? "Coming soon" : undefined}
                            >
                              {s.label}{!s.enabled && <span className="ml-1 text-[9px] opacity-60">Soon</span>}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* League */}
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block">{isMmaSport ? "Event (optional)" : "League / Competition (optional)"}</label>
                        <input
                          type="text"
                          value={sportLeague}
                          onChange={(e) => setSportLeague(e.target.value)}
                          placeholder={isMmaSport ? "e.g. UFC 315, Bellator 300" : "e.g. Premier League, La Liga"}
                          className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>

                      {/* Fixture Search */}
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
                            if (fixture.date) {
                              try {
                                // Persist exact kickoff (ISO) — this becomes the betting cutoff (auto_resolve_deadline)
                                const kickoff = new Date(fixture.date);
                                setSportKickoffISO(kickoff.toISOString());
                                // Also update the visible time picker so the UI reflects kickoff
                                const hh = String(kickoff.getUTCHours()).padStart(2, "0");
                                const mm = String(kickoff.getUTCMinutes()).padStart(2, "0");
                                setAutoResolveTime(`${hh}:${mm}`);
                                if (!endDate) {
                                  // end_date stays as day-after-kickoff (display fallback only); auto_resolve_deadline is authoritative
                                  const dayAfter = new Date(kickoff.getTime() + 24 * 60 * 60 * 1000);
                                  setEndDate(dayAfter.toISOString().split("T")[0]);
                                }
                              } catch {}
                            }
                          }
                        }}
                      />

                      {/* Predicted Outcome */}
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block">Predicted Outcome</label>
                        <div className={`grid ${isMmaSport ? 'grid-cols-2' : 'grid-cols-3'} gap-1.5 mb-2`}>
                          {OUTCOME_TYPES.map((o) => (
                            <button
                              key={o.value}
                              onClick={() => {
                                setSportPredictedOutcome(o.value);
                                if (selectedFixtureData) generateSportsAutoFill(selectedFixtureData, o.value);
                              }}
                              className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                sportPredictedOutcome === o.value
                                  ? "bg-primary/15 border border-primary/40 text-primary"
                                  : "bg-muted/50 border border-border text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          value={sportPredictedOutcome}
                          onChange={(e) => {
                            setSportPredictedOutcome(e.target.value);
                            if (selectedFixtureData) generateSportsAutoFill(selectedFixtureData, e.target.value);
                          }}
                          placeholder={isMmaSport ? "Or type custom: e.g. KO/TKO, submission" : "Or type custom: e.g. over 2.5, btts, team name"}
                          className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>

                      {/* Resolution Time */}
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block">Resolution Deadline Time (UTC)</label>
                        <input
                          type="time"
                          value={autoResolveTime}
                          onChange={(e) => setAutoResolveTime(e.target.value)}
                          className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Set after the match is expected to end. If the match hasn't finished by this time, resolves NO.
                        </p>
                      </div>

                      {/* Preview */}
                      {sportMatchId && sportPredictedOutcome && endDate && (
                        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                          <p className="text-xs font-medium text-primary">
                            🏆 Resolves YES if "{sportPredictedOutcome.replace(/_/g, " ")}" occurs in {SPORT_TYPES.find(s => s.value === sportType)?.label} match #{sportMatchId}
                            {sportLeague ? ` (${sportLeague})` : ""} by {endDate} {autoResolveTime} UTC
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              )}

              {/* Auto-Resolve Toggle (Twitter/X only) */}
              {category === "Twitter/X" && (
                <div className="glass rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="flex items-center gap-2 text-sm font-semibold">
                        <Zap className="w-4 h-4 text-primary" />
                        Auto-Resolve by Engagement
                      </label>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Automatically resolves based on tweet engagement metrics
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        const next = !autoResolve;
                        setAutoResolve(next);
                        if (next) {
                          setMarketType("range");
                          setResolutionSource(`Auto-resolved via live X/Twitter ${twitterMetricType} count`);
                        }
                      }}
                      className={`w-11 h-6 rounded-full transition-colors relative ${autoResolve ? "bg-primary" : "bg-muted"}`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${autoResolve ? "translate-x-[22px]" : "translate-x-0.5"}`} />
                    </button>
                  </div>

                  {autoResolve && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-3 pt-2 border-t border-border/50"
                    >
                      {/* Tweet URL / ID or Username */}
                      <div className={shakeClass("twitterResource")}>
                        <label className="text-xs font-semibold mb-1.5 block">
                          {twitterMetricType === "posts"
                            ? "X Handle (username only, not a link) *"
                            : twitterMetricType === "impressions"
                              ? "X Handle or Tweet URL/ID *"
                              : "Tweet URL or ID *"}
                        </label>
                        <input
                          type="text"
                          value={twitterResourceId}
                          onChange={(e) => {
                            setTouched((t) => ({ ...t, twitterResource: true }));
                            const val = e.target.value.trim();
                            if (twitterMetricType === "posts") {
                              // Strip @ and URL prefixes, keep just the username
                              const urlMatch = val.match(/(?:twitter\.com|x\.com)\/(@?(\w+))/i);
                              setTwitterResourceId(urlMatch ? urlMatch[2] : val.replace(/^@/, ""));
                            } else if (twitterMetricType === "impressions") {
                              // Accept both username and tweet URL/ID
                              const tweetMatch = val.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
                              if (tweetMatch) {
                                setTwitterResourceId(tweetMatch[1]);
                              } else {
                                const profileMatch = val.match(/(?:twitter\.com|x\.com)\/(@?(\w+))/i);
                                setTwitterResourceId(profileMatch ? profileMatch[2] : val.replace(/^@/, ""));
                              }
                            } else {
                              // Extract tweet ID from URL if pasted
                              const match = val.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
                              setTwitterResourceId(match ? match[1] : val);
                            }
                          }}
                          placeholder={twitterMetricType === "posts" ? "e.g. elonmusk (no @ or links)" : twitterMetricType === "impressions" ? "e.g. elonmusk or tweet URL/ID" : "e.g. https://x.com/user/status/123456789 or 123456789"}
                          className={`w-full bg-muted/50 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${touched.twitterResource && errors.twitterResource ? "border-destructive" : "border-border"}`}
                        />
                        {touched.twitterResource && errors.twitterResource && (
                          <p className="text-[10px] text-destructive mt-1">{errors.twitterResource}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {twitterMetricType === "posts"
                            ? "Enter the X handle only — do not paste a profile link."
                            : twitterMetricType === "impressions"
                              ? "Enter a username for total impressions across all posts, or a tweet URL/ID for a single post's views."
                              : "Paste the full tweet URL or just the numeric tweet ID."}
                        </p>
                      </div>

                      {/* Metric Type */}
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block">Engagement Metric</label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {([
                            { value: "likes" as const, label: "❤️ Likes" },
                            { value: "retweets" as const, label: "🔁 Reposts" },
                            { value: "replies" as const, label: "💬 Replies" },
                            { value: "impressions" as const, label: "👁️ Views" },
                            { value: "posts" as const, label: "📝 Posts" },
                          ]).map((m) => (
                            <button
                              key={m.value}
                              onClick={() => {
                                setTwitterMetricType(m.value);
                                setResolutionSource(`Auto-resolved via live X/Twitter ${m.value} count`);
                              }}
                              className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                twitterMetricType === m.value
                                  ? "bg-primary/15 border border-primary/40 text-primary"
                                  : "bg-muted/50 border border-border text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Resolution Time */}
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block">Resolution Deadline Time (UTC)</label>
                        <input
                          type="time"
                          value={autoResolveTime}
                          onChange={(e) => setAutoResolveTime(e.target.value)}
                          className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                          The final count at this time will determine the winning bracket.
                        </p>
                      </div>

                      <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-1">
                        <p className="text-xs font-medium text-primary">
                          📊 Create range brackets (e.g. &quot;0-100&quot;, &quot;101-500&quot;, &quot;&gt;500&quot;) as your market options above to define the outcome buckets.
                        </p>
                        {twitterResourceId && endDate && (
                          <p className="text-[10px] text-muted-foreground">
                            {twitterMetricType === "posts" ? `@${twitterResourceId}` : `Tweet #${twitterResourceId}`} • {twitterMetricType} count checked at {endDate} {autoResolveTime} UTC
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              <div className={`glass rounded-xl p-4 ${shakeClass("endDate")} ${touched.endDate && errors.endDate ? "border-destructive/50" : ""}`}>
                <label className="flex items-center gap-2 text-sm font-semibold mb-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  Resolution Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); markTouched("endDate"); }}
                  min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                  max={autoResolve && category === "Twitter/X" ? new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0] : undefined}
                  className={`w-full bg-muted/50 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 transition-all ${
                    touched.endDate && errors.endDate ? "border-destructive focus:ring-destructive/30" : "border-border focus:ring-primary/30"
                  }`}
                />
                {autoResolve && category === "Twitter/X" && (
                  <p className="text-[10px] text-amber-500 mt-1">⚠️ Twitter/X auto-resolve markets are limited to 5 days max to manage API costs</p>
                )}
                {touched.endDate && errors.endDate && (
                  <p className="text-[10px] text-destructive mt-1.5">{errors.endDate}</p>
                )}
              </div>

              <div className={`glass rounded-xl p-4 ${shakeClass("resolutionSource")} ${touched.resolutionSource && errors.resolutionSource ? "border-destructive/50" : ""}`}>
                <label className="flex items-center gap-2 text-sm font-semibold mb-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Resolution Source
                </label>
                <input
                  type="text"
                  value={resolutionSource}
                  onChange={(e) => setResolutionSource(e.target.value)}
                  onBlur={() => markTouched("resolutionSource")}
                  placeholder="e.g. CoinGecko BTC/USD price feed"
                  className={`w-full bg-muted/50 border rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 transition-all ${
                    touched.resolutionSource && errors.resolutionSource ? "border-destructive focus:ring-destructive/30" : "border-border focus:ring-primary/30"
                  }`}
                />
                {touched.resolutionSource && errors.resolutionSource && (
                  <p className="text-[10px] text-destructive mt-1.5">{errors.resolutionSource}</p>
                )}
              </div>

              {/* Cover Image Upload */}
              <div className="glass rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <ImageIcon className="w-4 h-4 text-primary" />
                    Cover Image <span className="text-xs font-normal text-destructive">*</span>
                  </label>
                  {!imagePreview && isFeatureEnabled("ai_generate_image") && (
                    <button
                      type="button"
                      onClick={() => setPendingAiType("image")}
                      disabled={generatingImage || !title.trim()}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {generatingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      Generate (${aiGenerationCost.toFixed(2)})
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">Upload your own for free, or use AI to generate for a fee.</p>
                {generatingImage ? (
                  <div className="w-full h-32 border-2 border-dashed border-primary/30 rounded-xl flex flex-col items-center justify-center gap-2 bg-primary/5">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    <span className="text-xs text-primary font-medium">Generating cover image...</span>
                  </div>
                ) : imagePreview ? (
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
                    className={`w-full h-32 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 hover:border-primary/40 hover:bg-primary/5 transition-all ${!imageFile ? "border-destructive/40" : "border-border"}`}
                  >
                    <Upload className="w-6 h-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Click to upload (max 5MB)</span>
                    <span className="text-[10px] text-destructive">Required</span>
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
              </div>

              {/* Optional Video Link */}
              <div className="glass rounded-xl p-4">
                <label className="flex items-center gap-2 text-sm font-semibold mb-2">
                  <Video className="w-4 h-4 text-primary" />
                  Video Link <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </label>
                <input
                  type="url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="e.g. https://youtube.com/watch?v=..."
                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                />
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Add a YouTube video to display on your market's detail page.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="glass py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95 px-4"
                >
                  Back
                </button>
                <button
                  onClick={() => saveDraft()}
                  disabled={savingDraft}
                  className="glass py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 px-4 disabled:opacity-50"
                >
                  {savingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  Draft
                </button>
                <button
                  onClick={tryAdvanceStep2}
                  className="flex-1 bg-primary text-primary-foreground py-3.5 rounded-xl font-semibold transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 3: Liquidity & Review */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div className={`glass rounded-xl p-4 ${shakeClass("initialLiquidity")} ${touched.initialLiquidity && errors.initialLiquidity ? "border-destructive/50" : ""}`}>
                <label className="flex items-center justify-between text-sm font-semibold mb-2">
                  <span className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-primary" />
                    Initial Liquidity (USDT)
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Balance: <span className="text-foreground font-medium">${balance.toFixed(2)}</span>
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={initialLiquidity}
                    onChange={(e) => setInitialLiquidity(e.target.value)}
                    onBlur={() => markTouched("initialLiquidity")}
                    placeholder="100"
                    min="10"
                    className={`w-full bg-muted/50 border rounded-xl px-4 py-3 pr-16 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 transition-all ${
                      touched.initialLiquidity && errors.initialLiquidity ? "border-destructive focus:ring-destructive/30" : "border-border focus:ring-primary/30"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => { setInitialLiquidity(balance.toString()); markTouched("initialLiquidity"); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
                  >
                    Max
                  </button>
                </div>
                {touched.initialLiquidity && errors.initialLiquidity ? (
                  <p className="text-[10px] text-destructive mt-1.5">{errors.initialLiquidity}</p>
                ) : (
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Minimum {minLiquidity} USDT. Higher liquidity attracts more traders.
                  </p>
                )}
                <div className="flex gap-2 mt-2">
                  {[25, 50, 100, 250].map((amt) => {
                    const exceedsBalance = amt > balance;
                    return (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => { setInitialLiquidity(amt.toString()); markTouched("initialLiquidity"); }}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors relative ${
                          initialLiquidity === amt.toString()
                            ? exceedsBalance
                              ? "bg-destructive/15 text-destructive border-destructive/50"
                              : "bg-primary text-primary-foreground border-primary"
                            : exceedsBalance
                              ? "bg-muted/50 text-muted-foreground/50 border-border/50 line-through"
                              : "bg-muted/50 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                        }`}
                      >
                        ${amt}
                      </button>
                    );
                  })}
                </div>
                {(() => {
                    const boostCost = creationBoost ? boostTierPrices[creationBoostTier] : 0;
                    const broadcastCost = creationBroadcast ? broadcastPriceVal : 0;
                    const totalNeeded = parseFloat(initialLiquidity) + (feeBypass ? marketCreationFee : 0) + (autoResolve && autoResolveFee > 0 ? autoResolveFee : 0) + boostCost + broadcastCost;
                    const shortfall = totalNeeded - balance;
                    return totalNeeded > balance && balance >= 0 ? (
                      <div className="mt-2 space-y-2">
                        <p className="text-[10px] text-destructive flex items-center gap-1">
                          ⚠️ Total cost (${totalNeeded.toFixed(2)}) exceeds your balance by ${shortfall.toFixed(2)}
                        </p>
                        <button
                          type="button"
                          onClick={() => setDepositModalOpen(true)}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold transition-all active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Funds to Continue
                        </button>
                      </div>
                    ) : null;
                  })()}
                </div>

                {/* Boost & Broadcast Add-ons — only when balance promotions enabled */}
                {isFeatureEnabled("balance_promotions") && (
                <div className="glass rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />
                    Promote Your Market <span className="text-[10px] font-normal text-muted-foreground">(optional, paid from balance)</span>
                  </h3>

                  {/* Boost Toggle */}
                  <div className={`rounded-xl border p-3 transition-all ${creationBoost ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">⚡ Boost Market</p>
                        <p className="text-[10px] text-muted-foreground">Featured placement on the feed</p>
                      </div>
                      <button
                        onClick={() => setCreationBoost(!creationBoost)}
                        className={`w-11 h-6 rounded-full transition-colors relative ${creationBoost ? "bg-primary" : "bg-muted"}`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${creationBoost ? "translate-x-[22px]" : "translate-x-0.5"}`} />
                      </button>
                    </div>
                    {creationBoost && (
                      <div className="flex gap-2 mt-2.5">
                        {(["flash", "standard", "whale"] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setCreationBoostTier(t)}
                            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                              creationBoostTier === t
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-muted/50 text-muted-foreground border-border hover:border-primary/50"
                            }`}
                          >
                            {t === "flash" ? "Flash $20" : t === "standard" ? "Standard $50" : "Whale $150"}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Broadcast Toggle */}
                  <div className={`rounded-xl border p-3 transition-all ${creationBroadcast ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">📢 Broadcast Market</p>
                        <p className="text-[10px] text-muted-foreground">Push notification to all users — $5</p>
                      </div>
                      <button
                        onClick={() => setCreationBroadcast(!creationBroadcast)}
                        className={`w-11 h-6 rounded-full transition-colors relative ${creationBroadcast ? "bg-primary" : "bg-muted"}`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${creationBroadcast ? "translate-x-[22px]" : "translate-x-0.5"}`} />
                      </button>
                    </div>
                  </div>
                </div>
                )}

                {/* Review card */}
                <div className="glass rounded-xl p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Market Preview
                </h3>
                <div className="space-y-2.5 text-sm">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Question</p>
                    <p className="font-medium">{title || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Description</p>
                    <p className="text-muted-foreground text-xs">{description || "—"}</p>
                  </div>
                  <div className="flex gap-4 flex-wrap">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Type</p>
                      <p className="font-medium capitalize">{marketType}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Category</p>
                      <p className="font-medium inline-flex items-center gap-1.5">
                        {category && <CategoryIcon category={category} className="w-3.5 h-3.5" />} {category || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ends</p>
                      <p className="font-medium">{endDate || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Liquidity</p>
                      <p className="font-medium">{initialLiquidity ? `$${initialLiquidity}` : "—"}</p>
                    </div>
                  </div>
                  {marketType !== "binary" && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Options</p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {options.filter(o => o.trim()).map((o, i) => (
                          <span key={i} className="text-xs bg-muted px-2 py-1 rounded-lg">{o}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {((feeBypass || (autoResolve && autoResolveFee > 0) || creationBoost || creationBroadcast) && initialLiquidity) && (
                <div className="glass rounded-xl p-4">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-primary" />
                    Cost Breakdown
                  </h3>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Initial Liquidity</span>
                      <span className="font-medium">${initialLiquidity} USDT</span>
                    </div>
                    {feeBypass && !unlimitedMarkets && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Creation Fee <span className="text-[10px]">(non-refundable)</span></span>
                        <span className="font-medium">${marketCreationFee} USDT</span>
                      </div>
                    )}
                    {autoResolve && autoResolveFee > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Auto-Resolve Fee <span className="text-[10px]">(platform)</span></span>
                        <span className="font-medium">${autoResolveFee} USDT</span>
                      </div>
                    )}
                    {creationBoost && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Boost ({creationBoostTier})</span>
                        <span className="font-medium">${boostTierPrices[creationBoostTier]} USDT</span>
                      </div>
                    )}
                    {creationBroadcast && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Broadcast Alert</span>
                        <span className="font-medium">${broadcastPriceVal} USDT</span>
                      </div>
                    )}
                    <div className="border-t border-border pt-1.5 flex justify-between">
                      <span className="font-semibold">Total</span>
                      <span className="font-bold text-primary">${(parseFloat(initialLiquidity) + ((feeBypass && !unlimitedMarkets) ? marketCreationFee : 0) + (autoResolve && autoResolveFee > 0 ? autoResolveFee : 0) + (creationBoost ? boostTierPrices[creationBoostTier] : 0) + (creationBroadcast ? broadcastPriceVal : 0)).toFixed(2)} USDT</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Fee info */}
              <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                <AlertTriangle className="w-4 h-4 text-destructive/60 shrink-0 mt-0.5" />
                <p className="text-xs text-destructive/70">
                  {feeBypass && !unlimitedMarkets
                    ? exceededFreeLimit
                      ? `A $${marketCreationFee} creation fee applies — you've reached your free market limit (${activeMarketCount}/${verificationLevel === "gold" ? goldMaxFreeMarkets : blueMaxFreeMarkets}). This fee is non-refundable (unless the market is cancelled). Your market will require approval before going live.`
                      : `A $${marketCreationFee} creation fee applies since you don't hold NFT/BC400. This fee is non-refundable (unless the market is cancelled). Your market will require approval before going live.`
                    : (() => {
                        const myFee = verificationLevel === "gold" ? creatorFeeGoldPercent : verificationLevel === "blue" ? creatorFeeBluePercent : creatorFeePercent;
                        const tierLabel = verificationLevel === "gold" ? "Gold ✨" : verificationLevel === "blue" ? "Blue ✔️" : "";
                        return `A ${predictionFeePercent}% platform fee applies on all trades. As a ${tierLabel ? tierLabel + " creator" : "creator"}, you earn ${myFee}% of all trade volume on this market. Initial liquidity will be locked until market resolution.`;
                      })()}
                </p>
              </div>

              {submitStep === "idle" && (
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(2)}
                    className="glass py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95 px-4"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => saveDraft()}
                    disabled={savingDraft}
                    className="glass py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 px-4 disabled:opacity-50"
                  >
                    {savingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    Draft
                  </button>
                  <button
                    onClick={() => {
                      setTouched((t) => ({ ...t, initialLiquidity: true }));
                      if (errors.initialLiquidity) { shake("initialLiquidity"); return; }
                      handleCreateMarket();
                    }}
                    disabled={!isFormValid || !!errors.initialLiquidity}
                    className="flex-1 btn-yes py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100 flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Create Market
                  </button>
                </div>
              )}

              {(submitStep === "moderating" || submitStep === "deploying" || submitStep === "saving") && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="glass rounded-xl p-6 flex flex-col items-center"
                >
                  <LogoLoader size="lg" />
                  <h3 className="text-base font-bold mt-3 mb-1">
                    {submitStep === "moderating"
                      ? "Running AI Checks..."
                      : submitStep === "deploying"
                      ? "Deploying Contract..."
                      : "Almost Done..."}
                  </h3>
                  <p className="text-xs text-muted-foreground text-center mb-3">
                    {submitStep === "moderating"
                      ? "Checking similarity, content moderation & uploading image..."
                      : submitStep === "deploying"
                      ? "Verifying balance & preparing contract..."
                      : "Saving market data..."}
                  </p>

                  {/* Progress bar with estimated time */}
                  <SubmitProgressBar
                    completedSteps={completedSteps}
                    startTime={submitStartRef.current}
                    estimatedTotalSec={ESTIMATED_TOTAL_SEC}
                  />

                  <div className="mt-4 space-y-2 w-full max-w-xs">
                    {[
                      { label: "AI checks & image upload", stepIdx: 0 },
                      { label: "Balance verification", stepIdx: 1 },
                      { label: "Preparing contract", stepIdx: 2 },
                      { label: "Broadcasting transaction", stepIdx: 3 },
                      { label: "Saving market data", stepIdx: 4 },
                    ].map((s) => {
                      const done = completedSteps.has(s.stepIdx);
                      const isActive = !done && (
                        (s.stepIdx === 0 && submitStep === "moderating") ||
                        (s.stepIdx === 1 && submitStep === "deploying" && !completedSteps.has(1)) ||
                        (s.stepIdx === 2 && completedSteps.has(1) && !completedSteps.has(2)) ||
                        (s.stepIdx === 3 && completedSteps.has(2) && !completedSteps.has(3)) ||
                        (s.stepIdx === 4 && submitStep === "saving")
                      );
                      return (
                        <motion.div
                          key={s.label}
                          initial={{ opacity: 0.3 }}
                          animate={{ opacity: done || isActive ? 1 : 0.3 }}
                          className="flex items-center gap-2 text-xs"
                        >
                          {done ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                          ) : isActive ? (
                            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                          ) : (
                            <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30" />
                          )}
                          <span className={done ? "text-foreground" : isActive ? "text-primary font-medium" : "text-muted-foreground"}>{s.label}</span>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* First Prediction Step */}
              {submitStep === "first_prediction" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="glass rounded-xl p-6 flex flex-col items-center"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 10 }}
                    className="w-14 h-14 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center mb-3"
                  >
                    <TrendingUp className="w-7 h-7 text-primary" />
                  </motion.div>
                  <h3 className="text-base font-bold mb-1">Place Your First Prediction</h3>
                  <p className="text-xs text-muted-foreground text-center mb-5">
                    To make your market official, place a minimum $5 prediction. This records the first volume and shows other traders you believe in your market.
                  </p>

                   {/* Side/Option selection */}
                   {marketType === "binary" ? (
                    <div className="grid grid-cols-2 gap-3 w-full mb-4">
                      <button
                        onClick={() => setFirstPredSide("yes")}
                        className={`p-3 rounded-xl border-2 text-center text-sm font-semibold transition-all ${
                          firstPredSide === "yes"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:border-primary/30 text-muted-foreground"
                        }`}
                      >
                        <CheckCircle2 className="w-5 h-5 mx-auto mb-1" />
                        Yes
                      </button>
                      <button
                        onClick={() => setFirstPredSide("no")}
                        className={`p-3 rounded-xl border-2 text-center text-sm font-semibold transition-all ${
                          firstPredSide === "no"
                            ? "border-destructive bg-destructive/10 text-destructive"
                            : "border-border hover:border-destructive/30 text-muted-foreground"
                        }`}
                      >
                        <XCircle className="w-5 h-5 mx-auto mb-1" />
                        No
                      </button>
                    </div>
                   ) : fetchingOptions ? (
                    <div className="w-full mb-4 flex items-center justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-sm text-muted-foreground">Loading options…</span>
                    </div>
                   ) : newMarketOptions.length > 0 ? (
                    <div className="w-full mb-4 space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Select Your Prediction</label>
                      {newMarketOptions
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => { setFirstPredOptionId(opt.id); setFirstPredSide("yes"); }}
                          className={`w-full p-3 rounded-xl border-2 text-left text-sm font-semibold transition-all flex items-center gap-2 ${
                            firstPredOptionId === opt.id
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:border-primary/30 text-muted-foreground"
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            firstPredOptionId === opt.id ? "border-primary" : "border-muted-foreground/40"
                          }`}>
                            {firstPredOptionId === opt.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                          </div>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                   ) : (
                    <div className="w-full mb-4 p-3 rounded-xl bg-destructive/10 text-destructive text-sm text-center">
                      No options found. Please try again.
                    </div>
                   )}

                  {/* Amount input */}
                  <div className="w-full mb-4">
                    <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Prediction Amount (min $5)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">$</span>
                      <input
                        type="number"
                        value={firstPredAmount}
                        onChange={(e) => setFirstPredAmount(e.target.value)}
                        min={5}
                        placeholder="5"
                        className="w-full bg-muted/50 border border-border rounded-xl pl-7 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <div className="flex gap-2 mt-2">
                      {[5, 10, 25, 50].map((amt) => (
                        <button
                          key={amt}
                          onClick={() => setFirstPredAmount(amt.toString())}
                          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                            firstPredAmount === amt.toString()
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted/50 text-muted-foreground border-border hover:border-primary/50"
                          }`}
                        >
                          ${amt}
                        </button>
                      ))}
                    </div>
                    {parseFloat(firstPredAmount) < 5 && firstPredAmount !== "" && (
                      <p className="text-[10px] text-destructive mt-1.5">Minimum prediction is $5</p>
                    )}
                  </div>

                  <button
                    onClick={async () => {
                      const amount = parseFloat(firstPredAmount);
                      if (!user || !newMarketId || amount < 5) {
                        toast.error("Minimum prediction is $5");
                        return;
                      }
                      setSubmitStep("placing_prediction");

                      try {
                        const price = firstPredSide === "yes" ? 50 : 50;
                        const shares = amount / (price / 100);

                        const { data, error } = await supabase.functions.invoke("place-bet", {
                          body: {
                            marketId: newMarketId,
                            side: firstPredSide,
                            amount,
                            price,
                            shares,
                            ...(firstPredOptionId ? { optionId: firstPredOptionId } : {}),
                          },
                        });

                        if (error || data?.error) {
                          toast.error(data?.error || error?.message || "Failed to place prediction");
                          setSubmitStep("first_prediction");
                          return;
                        }

                        toast.success("First prediction placed! Your market is now live.");
                        clearFormStorage();
                        setDraftId(null);
                        setSubmitStep("success");
                      } catch (err: any) {
                        toast.error(err.message || "Failed to place prediction");
                        setSubmitStep("first_prediction");
                      }
                    }}
                    disabled={parseFloat(firstPredAmount) < 5 || !firstPredAmount || (marketType !== "binary" && !firstPredOptionId)}
                    className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Place ${firstPredAmount || "0"} {marketType === "binary" ? firstPredSide.toUpperCase() : (newMarketOptions.find(o => o.id === firstPredOptionId)?.label || "")} Prediction
                  </button>
                </motion.div>
              )}

              {/* Placing prediction loading */}
              {submitStep === "placing_prediction" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="glass rounded-xl p-6 flex flex-col items-center"
                >
                  <LogoLoader size="lg" />
                  <h3 className="text-base font-bold mt-3 mb-1">Placing Your Prediction...</h3>
                  <p className="text-xs text-muted-foreground text-center">Recording your first trade on the market.</p>
                </motion.div>
              )}

              {submitStep === "success" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="glass rounded-xl p-6 flex flex-col items-center"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 10 }}
                    className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 ${
                      createdAsPending
                        ? "bg-yellow-500/20 border border-yellow-500/40"
                        : "bg-primary/20 border border-primary/40"
                    }`}
                  >
                    {createdAsPending ? (
                      <AlertTriangle className="w-7 h-7 text-yellow-500" />
                    ) : (
                      <CheckCircle2 className="w-7 h-7 text-primary" />
                    )}
                  </motion.div>
                  <h3 className="text-base font-bold mb-1">
                    {createdAsPending ? "Market Pending Review" : "Market Created!"}
                  </h3>
                  <p className="text-xs text-muted-foreground text-center mb-4">
                    {feeBypass && createdAsPending
                      ? `Your market requires approval before going live. The $${marketCreationFee} creation fee is non-refundable unless the market is cancelled.`
                      : createdAsPending
                        ? moderationReason
                          ? "Your market was flagged for inappropriate content and needs approval before going live."
                          : "Your market was flagged as similar to an existing one and needs approval before going live."
                        : "Your prediction market is now live. Share it and start earning from trades!"}
                  </p>

                  {/* Moderation reason */}
                  {createdAsPending && moderationReason && (
                    <div className="w-full mb-4 p-3 rounded-xl bg-destructive/5 border border-destructive/20">
                      <p className="text-[10px] text-destructive uppercase tracking-wider mb-1 font-semibold">Moderation Note</p>
                      <p className="text-xs text-muted-foreground">{moderationReason}</p>
                    </div>
                  )}

                  {/* Similar markets warning */}
                  {createdAsPending && similarMarkets.length > 0 && (
                    <div className="w-full mb-4 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                      <p className="text-[10px] text-yellow-600 dark:text-yellow-400 uppercase tracking-wider mb-2 font-semibold">Similar existing markets</p>
                      <ul className="space-y-1.5">
                        {similarMarkets.map((m) => (
                          <li key={m.id} className="text-xs text-muted-foreground flex items-start gap-2">
                            <span className="text-yellow-500 mt-0.5">•</span>
                            <button
                              onClick={() => navigate(`/market/${m.id}`)}
                              className="text-left hover:text-foreground transition-colors"
                            >
                              {m.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="w-full space-y-1.5 mb-4">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Liquidity</span>
                      <span className="font-semibold">${initialLiquidity} USDT</span>
                    </div>
                    {feeBypass && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Creation Fee</span>
                        <span className="font-semibold">${marketCreationFee} USDT</span>
                      </div>
                    )}
                    {feeBypass && (
                      <div className="flex justify-between text-xs border-t border-border pt-1.5">
                        <span className="text-muted-foreground font-semibold">Total Charged</span>
                        <span className="font-bold">${(parseFloat(initialLiquidity) + marketCreationFee).toFixed(2)} USDT</span>
                      </div>
                    )}
                    {address && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Wallet</span>
                        <span className="font-mono text-muted-foreground">{address.slice(0, 6)}...{address.slice(-4)}</span>
                      </div>
                    )}
                  </div>
                  {/* Share buttons */}
                  <div className="w-full mb-4">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 text-center font-semibold">Share your market</p>
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`I just created a prediction market: "${title}" 🔮\n\nPredict now on OPoll 👇`)}&url=${encodeURIComponent(`https://opoll.org/market/${newMarketId}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-muted/50 border border-border text-xs font-semibold hover:bg-accent/50 transition-colors"
                      >
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        Post on X
                      </a>
                      <a
                        href={`https://t.me/share/url?url=${encodeURIComponent(`https://opoll.org/market/${newMarketId}`)}&text=${encodeURIComponent(`I just created a prediction market: "${title}" 🔮 Predict now on OPoll!`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-muted/50 border border-border text-xs font-semibold hover:bg-accent/50 transition-colors"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        Telegram
                      </a>
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(`I just created a prediction market: "${title}" 🔮 Predict now on OPoll! https://opoll.org/market/${newMarketId}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-muted/50 border border-border text-xs font-semibold hover:bg-accent/50 transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        WhatsApp
                      </a>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`https://opoll.org/market/${newMarketId}`);
                          toast.success("Link copied!");
                        }}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-muted/50 border border-border text-xs font-semibold hover:bg-accent/50 transition-colors"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        Copy Link
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-3 w-full">
                    <button
                      onClick={() => navigate("/")}
                      className="flex-1 glass py-3 rounded-xl font-semibold text-sm transition-all active:scale-95"
                    >
                      Home
                    </button>
                    <button
                      onClick={() => navigate(`/market/${newMarketId}`)}
                      className="flex-1 bg-primary text-primary-foreground py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      View Market
                    </button>
                  </div>
                </motion.div>
              )}

              {submitStep === "error" && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="glass rounded-xl p-6 flex flex-col items-center"
                >
                  <div className="w-14 h-14 rounded-full bg-destructive/20 border border-destructive/40 flex items-center justify-center mb-3">
                    <AlertTriangle className="w-7 h-7 text-destructive" />
                  </div>
                  <h3 className="text-base font-bold mb-1">Creation Failed</h3>
                  <p className="text-xs text-muted-foreground text-center mb-4">
                    Something went wrong. No funds were deducted.
                  </p>
                  <div className="flex gap-3 w-full">
                    <button
                      onClick={() => setSubmitStep("idle")}
                      className="flex-1 glass py-3 rounded-xl font-semibold text-sm transition-all active:scale-95"
                    >
                      Try Again
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        </>)}
      </div>
      
      <BottomNav />
      <DepositWithdrawModal open={depositModalOpen} onClose={() => { setDepositModalOpen(false); queryClient.invalidateQueries({ queryKey: ["balance"] }); }} initialTab="deposit" />

      {/* Fee bypass confirmation dialog */}
      <AlertDialog open={showFeeConfirm} onOpenChange={setShowFeeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              Market Creation Fee
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>You will be charged <strong className="text-foreground">${marketCreationFee}</strong> for market creation. This fee will be held in escrow immediately.</p>
              <p>The fee is <strong className="text-foreground">non-refundable</strong> and your funds will be locked until you complete your market creation.</p>
              <p>Do you still want to proceed?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmFeeEscrow}>
              Proceed — Charge ${marketCreationFee}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI Generation Confirmation */}
      <AlertDialog open={!!pendingAiType} onOpenChange={(open) => { if (!open) setPendingAiType(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm AI Generation</AlertDialogTitle>
            <AlertDialogDescription>
              This will generate {pendingAiType === "image" ? "a cover image" : pendingAiType === "details" ? "detailed content" : "a description"} using AI.
              <span className="block mt-2 font-semibold text-foreground">${aiGenerationCost.toFixed(2)} will be charged from your {" "}
              {(() => { const b = Number((window as any).__userBonusBalance ?? 0); return b >= aiGenerationCost ? "bonus balance" : "main balance"; })()}.</span>
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
    </div>
  );
};

export default Create;
