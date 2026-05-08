import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { isMarketOpen, getNextOpenTime } from "@/lib/marketHours";

import {
  TrendingUp,
  TrendingDown,
  Timer,
  Moon,
  ArrowUp,
  ArrowDown,
  Share2,
  BarChart3,
  LineChart as LineChartIcon,
  Activity,
  Volume2,
  VolumeOff,
} from "lucide-react";
import { useCommissionSettings } from "@/hooks/useCommissionSettings";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useConfetti } from "@/hooks/useConfetti";
import { useUserBalance } from "@/hooks/useUserBalance";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import SEOHead from "@/components/SEOHead";
import { useNavigate } from "react-router-dom";
import watermarkLogo from "@/assets/watermark-logo.png";
import blueLogo from "@/assets/blue-opoll-logo.png";
import QuickTradeChart from "@/components/quick-trade/QuickTradeChart";
import QuickTradeBetControls from "@/components/quick-trade/QuickTradeBetControls";
import PriceToBeatHeader from "@/components/quick-trade/PriceToBeatHeader";

import { useChartEngine } from "@/hooks/useChartEngine";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import useAnalytics from "@/hooks/useAnalytics";

// Lazy load heavy / non-critical components
const QuickTradeHistory = lazy(() => import("@/components/quick-trade/QuickTradeHistory"));
const StreakMilestoneModal = lazy(() => import("@/components/StreakMilestoneModal"));
const ShareModal = lazy(() => import("@/components/ShareModal"));
const ProfitShareCard = lazy(() => import("@/components/ProfitShareCard"));

// Lazy load sounds to avoid pulling them into the main bundle
const playWinSound = () => import("@/lib/sounds").then(m => m.playWinSound());
const playLoseSound = () => import("@/lib/sounds").then(m => m.playLoseSound());
// ── Asset config ──
type AssetClass = "crypto" | "commodity" | "forex";
interface QuickTradeAsset {
  symbol: string;
  label: string;
  assetClass: AssetClass;
  geckoId?: string;
  icon?: string;
  unit?: string;
}

const ALL_ASSETS: QuickTradeAsset[] = [
  // Crypto
  { symbol: "BTC", label: "Bitcoin", assetClass: "crypto", geckoId: "bitcoin", icon: "₿" },
  { symbol: "ETH", label: "Ethereum", assetClass: "crypto", geckoId: "ethereum", icon: "Ξ" },
  { symbol: "BNB", label: "BNB", assetClass: "crypto", geckoId: "binancecoin" },
  { symbol: "SOL", label: "Solana", assetClass: "crypto", geckoId: "solana" },
  { symbol: "XRP", label: "XRP", assetClass: "crypto", geckoId: "ripple" },
  { symbol: "DOGE", label: "Dogecoin", assetClass: "crypto", geckoId: "dogecoin" },
  // Commodities
  { symbol: "XAU", label: "Gold", assetClass: "commodity", icon: "🥇", unit: "USD/oz" },
  { symbol: "XAG", label: "Silver", assetClass: "commodity", icon: "🥈", unit: "USD/oz" },
  { symbol: "XPT", label: "Platinum", assetClass: "commodity", icon: "⬜", unit: "USD/oz" },
  { symbol: "XPD", label: "Palladium", assetClass: "commodity", icon: "🔘", unit: "USD/oz" },
  { symbol: "NG", label: "Natural Gas", assetClass: "commodity", icon: "🔥", unit: "USD/MMBtu" },
  { symbol: "COPPER", label: "Copper", assetClass: "commodity", icon: "🟤", unit: "USD/lb" },
  { symbol: "WTI", label: "WTI Crude Oil", assetClass: "commodity", icon: "🛢️", unit: "USD/bbl" },
  { symbol: "BRENT", label: "Brent Crude", assetClass: "commodity", icon: "🛢️", unit: "USD/bbl" },
  // Forex
  { symbol: "EUR/USD", label: "EUR/USD", assetClass: "forex", icon: "€" },
  { symbol: "GBP/USD", label: "GBP/USD", assetClass: "forex", icon: "£" },
  { symbol: "USD/JPY", label: "USD/JPY", assetClass: "forex", icon: "¥" },
  { symbol: "AUD/USD", label: "AUD/USD", assetClass: "forex", icon: "A$" },
  { symbol: "USD/CHF", label: "USD/CHF", assetClass: "forex", icon: "Fr" },
  { symbol: "USD/CAD", label: "USD/CAD", assetClass: "forex", icon: "C$" },
  { symbol: "NZD/USD", label: "NZD/USD", assetClass: "forex", icon: "NZ$" },
  { symbol: "EUR/GBP", label: "EUR/GBP", assetClass: "forex", icon: "€£" },
];

const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  crypto: "Crypto",
  commodity: "Commodities",
  forex: "Forex",
};

/** Smart price formatter based on asset class and magnitude */
function formatPrice(price: number, asset: QuickTradeAsset): string {
  if (asset.assetClass === "forex") {
    return price.toFixed(4);
  }
  if (asset.assetClass === "commodity") {
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // Crypto: adapt decimals to price magnitude
  if (price >= 1000) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

function getPricePrefix(asset: QuickTradeAsset): string {
  if (asset.assetClass === "forex") return "";
  return "$";
}

function getPriceLabel(asset: QuickTradeAsset): string {
  if (asset.unit) return asset.unit;
  if (asset.assetClass === "forex") return asset.symbol;
  return `${asset.label} / USD`;
}

const ALL_TIMEFRAMES = [
  { label: "1m", seconds: 60 },
  { label: "3m", seconds: 180 },
  { label: "5m", seconds: 300 },
  { label: "15m", seconds: 900 },
];

const LOCK_BUFFER = 10; // lock 10s before end

// Haptic feedback helper
const haptic = (style: "light" | "medium" | "heavy" | "success" | "error" = "medium") => {
  try {
    if ("vibrate" in navigator) {
      const patterns: Record<string, number | number[]> = {
        light: 10,
        medium: 30,
        heavy: 50,
        success: [30, 50, 30],
        error: [50, 30, 50, 30, 50],
      };
      navigator.vibrate(patterns[style]);
    }
  } catch {}
};
const AMOUNT_PRESETS = [5, 10, 25, 50, 100];

import { fetchCryptoPrice, fetchCryptoHistory, fetchAssetPrice, fetchOHLCData, subscribeToPriceStream, startNonCryptoHistoryPoller, getNonCryptoHistory, seedNonCryptoHistory, subscribeToSmoothedPriceStream, feedRealPrice, resetInterpolationState, type OHLCCandle } from "@/lib/cryptoPriceProvider";

// Wrapper that routes by asset class
async function fetchPriceForAsset(asset: QuickTradeAsset): Promise<number | null> {
  if (asset.assetClass === "crypto") return fetchCryptoPrice(asset.symbol, asset.geckoId);
  return fetchAssetPrice(asset.symbol);
}

async function fetchRawPriceData(asset: QuickTradeAsset): Promise<[number, number][]> {
  if (asset.assetClass === "crypto") return fetchCryptoHistory(asset.symbol, asset.geckoId);
  // Return accumulated polling history for non-crypto assets
  return getNonCryptoHistory(asset.symbol);
}

// ── SessionStorage-backed chart cache helpers ──
const CHART_CACHE_PREFIX = "qt_chart_";
const CHART_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getSessionCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(CHART_CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed._ts > CHART_CACHE_TTL) {
      sessionStorage.removeItem(CHART_CACHE_PREFIX + key);
      return null;
    }
    return parsed.data as T;
  } catch { return null; }
}

function setSessionCache<T>(key: string, data: T) {
  try {
    sessionStorage.setItem(CHART_CACHE_PREFIX + key, JSON.stringify({ data, _ts: Date.now() }));
  } catch { /* quota exceeded — ignore */ }
}

function clearAllChartCache() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(CHART_CACHE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch { /* ignore */ }
}

// Run on module load — clear stale chart cache from previous session
clearAllChartCache();


function filterPriceData(
  raw: [number, number][],
  durationMs: number,
  /** Load extra history for panning (multiplier on durationMs) */
  historyMultiplier = 3
): { time: string; price: number; ts: number }[] {
  const cutoff = Date.now() - durationMs * historyMultiplier;
  return raw
    .filter(([ts]) => ts >= cutoff)
    .map(([ts, price]) => ({
      time: new Date(ts).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", hour12: true }),
      price,
      ts,
    }));
}

type Round = {
  id: string;
  asset: string;
  duration_seconds: number;
  open_price: number | null;
  close_price: number | null;
  status: string;
  result: string | null;
  created_at: string;
  locks_at: string;
  resolved_at: string | null;
};

type Bet = {
  id: string;
  side: string;
  amount: number;
  payout: number;
  status: string;
  round_id: string;
  streak: number;
};

export default function QuickTrade() {
  const { user } = useAuth();
  const { balance } = useUserBalance();
  const { toast } = useToast();
  const { track } = useAnalytics();
  const navigate = useNavigate();
  const { toggles } = useFeatureToggles();
  const tvChartEnabled = toggles.find((t) => t.feature_key === "tradingview_chart")?.enabled ?? false;
  const lineChartEnabled = toggles.find((t) => t.feature_key === "line_chart")?.enabled ?? true;
  const polyChartEnabled = toggles.find((t) => t.feature_key === "poly_chart")?.enabled ?? true;
  const queryClient = useQueryClient();
  const { data: commissionSettings } = useCommissionSettings();
  const { fireWinConfetti } = useConfetti();

  // Set of assets auto-disabled due to API errors
  const disabledAssets = useMemo(() => {
    if (!commissionSettings?.qt_disabled_assets) return new Set<string>();
    return new Set(commissionSettings.qt_disabled_assets.split(",").filter(Boolean));
  }, [commissionSettings?.qt_disabled_assets]);

  // Filter assets based on admin settings — exclude disabled assets entirely
  const ASSETS = useMemo(() => {
    if (!commissionSettings?.qt_enabled_assets) return ALL_ASSETS.filter(a => !disabledAssets.has(a.symbol));
    const enabled = new Set(commissionSettings.qt_enabled_assets.split(",").filter(Boolean));
    const filtered = ALL_ASSETS.filter(a => enabled.has(a.symbol) && !disabledAssets.has(a.symbol));
    return filtered.length > 0 ? filtered : ALL_ASSETS.filter(a => !disabledAssets.has(a.symbol));
  }, [commissionSettings?.qt_enabled_assets, disabledAssets]);

  // Filter timeframes based on admin settings
  const TIMEFRAMES = useMemo(() => {
    if (!commissionSettings?.qt_enabled_timeframes) return ALL_TIMEFRAMES;
    const enabled = new Set(commissionSettings.qt_enabled_timeframes.split(",").filter(Boolean).map(Number));
    const filtered = ALL_TIMEFRAMES.filter(t => enabled.has(t.seconds));
    return filtered.length > 0 ? filtered : ALL_TIMEFRAMES;
  }, [commissionSettings?.qt_enabled_timeframes]);

  const qtMinBet = commissionSettings?.qt_min_bet ?? 1;
  const qtMaxBet = commissionSettings?.qt_max_bet ?? 500;

  const [selectedAsset, setSelectedAsset] = useState(ALL_ASSETS[0]);
  const selectedAssetSymbolRef = useRef(selectedAsset.symbol);
  const previousSelectedAssetRef = useRef(selectedAsset.symbol);

  useEffect(() => {
    selectedAssetSymbolRef.current = selectedAsset.symbol;
  }, [selectedAsset.symbol]);

  // Ensure selected asset is in the enabled list or not disabled
  useEffect(() => {
    const isAvailable = ASSETS.find(a => a.symbol === selectedAsset.symbol) && !disabledAssets.has(selectedAsset.symbol);
    if (ASSETS.length > 0 && !isAvailable) {
      const firstAvailable = ASSETS.find(a => !disabledAssets.has(a.symbol));
      if (firstAvailable) setSelectedAsset(firstAvailable);
    }
  }, [ASSETS, selectedAsset.symbol, disabledAssets]);

  // Auto-switch to area chart when selecting non-crypto assets or TV disabled
  useEffect(() => {
    if (selectedAsset.assetClass !== "crypto" && chartType !== "area") {
      setChartType("area");
    }
    if (chartType === "tv" && !tvChartEnabled) {
      setChartType("area");
    }
  }, [selectedAsset.assetClass, tvChartEnabled]);

  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [currentPriceAsset, setCurrentPriceAsset] = useState(ALL_ASSETS[0].symbol);
  const [prevPrice, setPrevPrice] = useState<number | null>(null);
  const [activeRound, setActiveRound] = useState<Round | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [resolving, setResolving] = useState(false);
  const [betAmount, setBetAmount] = useState("10");
  const [placing, setPlacing] = useState(false);
  const [userBet, setUserBet] = useState<Bet | null>(null);
  const [recentRounds, setRecentRounds] = useState<Round[]>([]);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [resolveFlash, setResolveFlash] = useState<"win" | "lose" | null>(null);
  const HISTORY_PER_PAGE = 5;
  const [poolUp, setPoolUp] = useState(0);
  const [poolDown, setPoolDown] = useState(0);
  const [userBets, setUserBets] = useState<Bet[]>([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState(ALL_TIMEFRAMES[2]); // default 5m
  const [streak, setStreak] = useState<{ current_streak: number; best_streak: number } | null>(null);
   const [milestoneModal, setMilestoneModal] = useState<{ open: boolean; streak: number; multiplier: number }>({ open: false, streak: 0, multiplier: 1 });
   const prevStreakRef = useRef<number>(-1);
   const shownMilestonesRef = useRef<Set<number>>(new Set());
  const chartCardRef = useRef<HTMLDivElement>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showWinShare, setShowWinShare] = useState(false);
  const [winShareData, setWinShareData] = useState<{ profit: number; payout: number; side: string; asset: string } | null>(null);
  const profitCardRef = useRef<HTMLDivElement>(null);
  const consecutiveFailsRef = useRef<number>(0);
  const [soundMuted, setSoundMuted] = useState(() => {
    try { return localStorage.getItem("qt-sound-muted") === "true"; } catch { return false; }
  });
  const toggleMute = useCallback(() => {
    setSoundMuted(prev => {
      const next = !prev;
      try { localStorage.setItem("qt-sound-muted", String(next)); } catch {}
      return next;
    });
  }, []);

  // Ensure selected timeframe is in the enabled list
  useEffect(() => {
    if (TIMEFRAMES.length > 0 && !TIMEFRAMES.find(t => t.seconds === selectedTimeframe.seconds)) {
      setSelectedTimeframe(TIMEFRAMES[0]);
    }
  }, [TIMEFRAMES, selectedTimeframe.seconds]);

  const isLocked = activeRound?.status === "locked" || timeLeft <= LOCK_BUFFER;

  // Streak multiplier tiers (mirror backend)
  const getStreakMultiplier = (s: number) => {
    if (s >= 5) return 1.25;
    if (s === 4) return 1.15;
    if (s === 3) return 1.10;
    if (s === 2) return 1.05;
    return 1.0;
  };

  // Fetch user streak and detect milestones
  useEffect(() => {
    if (!user) { setStreak(null); return; }
    const load = async () => {
      const { data } = await supabase
        .from("quick_trade_streaks")
        .select("current_streak, best_streak")
        .eq("user_id", user.id)
        .maybeSingle();
      const newStreak = data || { current_streak: 0, best_streak: 0 };
      const prev = prevStreakRef.current;
      const curr = newStreak.current_streak;

      // Trigger milestone celebration only once per session per milestone
      if (curr >= 3 && (curr === 3 || curr === 5) && !shownMilestonesRef.current.has(curr)) {
        // Only show if streak actually increased (not on initial load with existing streak)
        if (prevStreakRef.current !== -1 && prevStreakRef.current < curr) {
          shownMilestonesRef.current.add(curr);
          setMilestoneModal({ open: true, streak: curr, multiplier: getStreakMultiplier(curr) });
        } else if (prevStreakRef.current === -1) {
          // First load — just mark as shown so it doesn't pop up later
          shownMilestonesRef.current.add(curr);
        }
      }

      prevStreakRef.current = curr;
      setStreak(newStreak);
    };
    load();
  }, [user, activeRound?.status]);

  // ── Price history for mini chart ──
  const ALL_CHART_TIMEFRAMES = [
    { key: "1m", label: "1m", ms: 1 * 60 * 1000, seconds: 60 },
    { key: "5m", label: "5m", ms: 5 * 60 * 1000, seconds: 300 },
    { key: "15m", label: "15m", ms: 15 * 60 * 1000, seconds: 900 },
    { key: "1h", label: "1H", ms: 60 * 60 * 1000, seconds: 3600 },
    { key: "4h", label: "4H", ms: 4 * 60 * 60 * 1000, seconds: 14400 },
    { key: "1d", label: "1D", ms: 24 * 60 * 60 * 1000, seconds: 86400 },
  ] as const;
  const CHART_TIMEFRAMES = useMemo(() => {
    if (!commissionSettings?.qt_enabled_timeframes) return ALL_CHART_TIMEFRAMES;
    const enabled = new Set(commissionSettings.qt_enabled_timeframes.split(",").filter(Boolean).map(Number));
    const filtered = ALL_CHART_TIMEFRAMES.filter(t => enabled.has(t.seconds));
    return filtered.length > 0 ? filtered : ALL_CHART_TIMEFRAMES;
  }, [commissionSettings?.qt_enabled_timeframes]);
  type ChartTF = typeof ALL_CHART_TIMEFRAMES[number]["key"];
  const validTFKeys = CHART_TIMEFRAMES.map(t => t.key) as readonly string[];
  const savedTF = typeof window !== "undefined" ? localStorage.getItem("qt-chart-tf") : null;
  const initialTF = (savedTF && validTFKeys.includes(savedTF) ? savedTF : (CHART_TIMEFRAMES[0]?.key ?? "5m")) as ChartTF;
  const [chartTimeframe, setChartTimeframeRaw] = useState<ChartTF>(initialTF);
  const setChartTimeframe = useCallback((tf: ChartTF) => {
    setChartTimeframeRaw(tf);
    try { localStorage.setItem("qt-chart-tf", tf); } catch {}
  }, []);
  // Reset chart timeframe if current selection is no longer in filtered list
  useEffect(() => {
    const keys = CHART_TIMEFRAMES.map(t => t.key);
    if (!keys.includes(chartTimeframe) && keys.length > 0) {
      setChartTimeframe(keys[0] as ChartTF);
    }
  }, [CHART_TIMEFRAMES, chartTimeframe, setChartTimeframe]);
  const validChartTypes = ["area", "candle", "tv", "poly"] as const;
  const savedCT = typeof window !== "undefined" ? localStorage.getItem("qt-chart-type") : null;
  const rawInitialCT = (savedCT && (validChartTypes as readonly string[]).includes(savedCT) ? savedCT : "area") as "area" | "candle" | "tv" | "poly";
  const initialCT = rawInitialCT === "tv" && !tvChartEnabled ? "area" : rawInitialCT === "poly" && !polyChartEnabled ? "area" : rawInitialCT === "candle" && lineChartEnabled ? "area" : (rawInitialCT === "area") && !lineChartEnabled ? "candle" : rawInitialCT;
  const [chartType, setChartTypeRaw] = useState<"area" | "candle" | "tv" | "poly">(initialCT);
  const setChartType = useCallback((ct: "area" | "candle" | "tv" | "poly") => {
    setChartTypeRaw(ct);
    try { localStorage.setItem("qt-chart-type", ct); } catch {}
  }, []);
  // Force away from disabled chart types
  useEffect(() => {
    if (!lineChartEnabled && chartType === "area") {
      setChartType("candle");
    }
    if (!polyChartEnabled && chartType === "poly") {
      setChartType(lineChartEnabled ? "area" : "candle");
    }
  }, [lineChartEnabled, polyChartEnabled, chartType, setChartType]);
  const chartMs = (CHART_TIMEFRAMES.find(t => t.key === chartTimeframe) ?? CHART_TIMEFRAMES[0])?.ms ?? 300000;

  const [priceHistory, setPriceHistory] = useState<{ time: string; price: number; ts: number }[]>([]);
  const priceHistoryRef = useRef(priceHistory);
  priceHistoryRef.current = priceHistory;

  // Real OHLC candle data from exchange APIs
  const [ohlcData, setOhlcData] = useState<OHLCCandle[]>([]);
  const ohlcCacheRef = useRef<Map<string, OHLCCandle[]>>(new Map());

  // Load raw price data once per asset, then filter by timeframe client-side
  const [historyLoading, setHistoryLoading] = useState(false);
  const rawDataRef = useRef<Map<string, [number, number][]>>(new Map());

  // Fetch raw price data when asset changes (for area/candle recharts)
  useEffect(() => {
    let cancelled = false;
    const cacheKey = selectedAsset.symbol;

    // Try in-memory cache first, then sessionStorage
    const cachedRaw = rawDataRef.current.get(cacheKey) || getSessionCache<[number, number][]>(`raw_${cacheKey}`);
    if (cachedRaw && cachedRaw.length > 0) {
      rawDataRef.current.set(cacheKey, cachedRaw);
      setPriceHistory(filterPriceData(cachedRaw, chartMs));
      setHistoryLoading(false);
    } else {
      setHistoryLoading(true);
    }

    (async () => {
      const raw = await fetchRawPriceData(selectedAsset);
      if (!cancelled && raw.length > 0) {
        rawDataRef.current.set(cacheKey, raw);
        setSessionCache(`raw_${cacheKey}`, raw);
        setPriceHistory(filterPriceData(raw, chartMs));
      }
      if (!cancelled) setHistoryLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedAsset.symbol]);

  // When chart timeframe changes, re-filter existing raw data (instant for area/candle)
  useEffect(() => {
    const raw = rawDataRef.current.get(selectedAsset.symbol);
    if (raw && raw.length > 0) {
      setPriceHistory(filterPriceData(raw, chartMs));
    }
  }, [chartMs, selectedAsset.symbol]);

  // Fetch real OHLC data for TradingView chart (supports up to 30 days)
  useEffect(() => {
    let cancelled = false;
    const cacheKey = `${selectedAsset.symbol}:${chartTimeframe}`;

    // Try in-memory cache first, then sessionStorage
    const cached = ohlcCacheRef.current.get(cacheKey) || getSessionCache<OHLCCandle[]>(`ohlc_${cacheKey}`);
    if (cached && cached.length > 0) {
      ohlcCacheRef.current.set(cacheKey, cached);
      setOhlcData(cached);
      return;
    }

    // OHLC only available for crypto assets
    if (selectedAsset.assetClass !== "crypto") return;

    (async () => {
      const candles = await fetchOHLCData(selectedAsset.symbol, chartTimeframe, selectedAsset.geckoId);
      if (!cancelled && candles.length > 0) {
        ohlcCacheRef.current.set(cacheKey, candles);
        setSessionCache(`ohlc_${cacheKey}`, candles);
        setOhlcData(candles);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedAsset.symbol, chartTimeframe]);

  // ── Stream price via WebSocket (sub-second) with HTTP polling fallback ──
  const lastFetchTimeRef = useRef(0);
  const [streamingPrice, setStreamingPrice] = useState<number | null>(null);
  const streamingPriceRef = useRef<number | null>(null);
  const lastStreamingStateUpdateRef = useRef(0);
  const wsActiveRef = useRef(false);
  const lastWsTickAtRef = useRef(0);
  const streamRunIdRef = useRef(0);
  // Stable refs for streaming effect to avoid object-reference dependency
  const selectedAssetRef = useRef(selectedAsset);
  selectedAssetRef.current = selectedAsset;

  // Reset price state when asset changes
  useEffect(() => {
    const previousAsset = previousSelectedAssetRef.current;

    setCurrentPriceAsset(selectedAsset.symbol);
    setCurrentPrice(null);
    setPrevPrice(null);
    setStreamingPrice(null);
    streamingPriceRef.current = null;
    lastStreamingStateUpdateRef.current = 0;
    setPriceHistory([]);
    setOhlcData([]);
    setActiveRound(null);
    setUserBet(null);
    wsActiveRef.current = false;
    lastWsTickAtRef.current = 0;
    consecutiveFailsRef.current = 0;
    lastFetchTimeRef.current = 0;

    // Clear interpolation for both previous and current asset to avoid stale ticks leaking across switches
    if (previousAsset && previousAsset !== selectedAsset.symbol) {
      resetInterpolationState(previousAsset);
    }
    resetInterpolationState(selectedAsset.symbol);
    previousSelectedAssetRef.current = selectedAsset.symbol;
  }, [selectedAsset.symbol]);

  useEffect(() => {
    let mounted = true;
    const streamRunId = ++streamRunIdRef.current;
    const streamAssetSymbol = selectedAsset.symbol;
    const asset = selectedAssetRef.current; // stable snapshot for async calls
    const isCurrentRun = () =>
      mounted &&
      streamRunIdRef.current === streamRunId &&
      selectedAssetSymbolRef.current === streamAssetSymbol;

    const applyDisplayPrice = (price: number) => {
      if (!isCurrentRun()) return;
      setCurrentPriceAsset(streamAssetSymbol);
      setCurrentPrice((prev) => {
        setPrevPrice(prev);
        return price;
      });
    };

    const applyStreamingPrice = (price: number) => {
      if (!isCurrentRun()) return;
      // Always update the ref (no re-render) for high-frequency consumers like TradingView
      streamingPriceRef.current = price;
      // Keep chart pipeline responsive; display text is throttled separately via applyDisplayPrice
      const now = Date.now();
      if (now - lastStreamingStateUpdateRef.current >= 120) {
        lastStreamingStateUpdateRef.current = now;
        setStreamingPrice(price);
      }
    };

    let pollIv: ReturnType<typeof setInterval> | null = null;

    // Skip all price streaming when market is closed
    const marketOpen = isMarketOpen(asset.assetClass);
    if (!marketOpen) {
      // Still fetch one price snapshot so we show "last close" price
      (async () => {
        const p = await fetchPriceForAsset(asset);
        if (p != null && isCurrentRun()) {
          applyDisplayPrice(p);
          applyStreamingPrice(p);
          // Seed synthetic history for non-crypto so chart renders at correct price level
          if (asset.assetClass !== "crypto") {
            seedNonCryptoHistory(streamAssetSymbol, p);
            const seeded = getNonCryptoHistory(streamAssetSymbol);
            if (seeded.length > 0) {
              rawDataRef.current.set(streamAssetSymbol, seeded);
              setPriceHistory(filterPriceData(seeded, chartMs));
            }
          } else {
            // Seed 2 points so chart renders immediately (needs >= 2)
            const now = Date.now();
            const fmt = (t: number) => new Date(t).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
            setPriceHistory([
              { time: fmt(now - 1000), price: p, ts: now - 1000 },
              { time: fmt(now), price: p, ts: now },
            ]);
          }
        }
      })();
      return () => {
        mounted = false;
      };
    }

    // Immediate per-asset bootstrap fetch so switches never show stale prior-asset prices
    (async () => {
      const p = await fetchPriceForAsset(asset);
      if (p != null && isCurrentRun()) {
        consecutiveFailsRef.current = 0;
        applyDisplayPrice(p);
        applyStreamingPrice(p);
        // Seed the smooth interpolation system so fallback has data immediately
        feedRealPrice(streamAssetSymbol, p);

        // For non-crypto assets, seed synthetic history so chart populates instantly
        if (asset.assetClass !== "crypto") {
          seedNonCryptoHistory(streamAssetSymbol, p);
          const seeded = getNonCryptoHistory(streamAssetSymbol);
          if (seeded.length > 0) {
            rawDataRef.current.set(streamAssetSymbol, seeded);
            setPriceHistory(filterPriceData(seeded, chartMs));
          }
        } else {
          // Seed 2 points so chart renders immediately (needs >= 2)
          const now = Date.now();
          const fmt = (t: number) => new Date(t).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
          setPriceHistory(prev => prev.length < 2 ? [
            { time: fmt(now - 1000), price: p, ts: now - 1000 },
            { time: fmt(now), price: p, ts: now },
          ] : prev);
        }
      }
    })();

    // ── Smooth crypto interpolation state ──
    // Instead of snapping to each WS tick, we lerp between ticks at ~20fps
    let targetWsPrice = 0;
    let displayedPrice = 0;
    let cryptoInterpId: ReturnType<typeof setInterval> | null = null;
    let lastChartAppend = 0;
    let pendingRaf: number | null = null;

    const appendCryptoChartPoint = (price: number) => {
      const now = Date.now();
      if (now - lastChartAppend < 50) return; // throttle chart points to ~20/sec for smooth poly streaming
      lastChartAppend = now;
      const timeLabel = new Date(now).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
      const maxCutoff = now - 4 * 60 * 60 * 1000;
      setPriceHistory((prev) => {
        // Efficient append: push new point, only trim when array grows too large
        const newPoint = { time: timeLabel, price, ts: now };
        if (prev.length < 500) return [...prev, newPoint];
        // Find first index within cutoff to avoid filtering every time
        let start = 0;
        while (start < prev.length && prev[start].ts < maxCutoff) start++;
        const trimmed = start > 0 ? prev.slice(start) : prev;
        return [...trimmed.slice(-(499)), newPoint];
      });
      // Update raw cache efficiently
      const rawCached = rawDataRef.current.get(streamAssetSymbol) || [];
      rawCached.push([now, price]);
      // Only trim when >20% over limit
      if (rawCached.length > 600) {
        const cutIdx = rawCached.findIndex(([ts]) => ts >= maxCutoff);
        rawDataRef.current.set(streamAssetSymbol, cutIdx > 0 ? rawCached.slice(cutIdx) : rawCached.slice(-500));
      }
    };

    // WS tick handler: just update the target price (no direct state set)
    const handleWsTick = (price: number) => {
      if (!isCurrentRun()) return;
      wsActiveRef.current = true;
      lastWsTickAtRef.current = Date.now();
      if (displayedPrice === 0) displayedPrice = price; // seed on first tick
      targetWsPrice = price;
    };

    // Start smooth interpolation loop for crypto (~20fps for chart, ~2fps for price display)
    if (asset.assetClass === "crypto") {
      const LERP_RATE = 0.25; // 25% toward target per tick — fast, responsive movement
      const CRYPTO_TICK_MS = 40; // 25fps for chart
      let lastDisplayUpdate = 0;
      const DISPLAY_THROTTLE_MS = 500; // Update price text ~2x/sec

      cryptoInterpId = setInterval(() => {
        if (!isCurrentRun() || targetWsPrice === 0) return;
        // Lerp toward target
        displayedPrice = displayedPrice + (targetWsPrice - displayedPrice) * LERP_RATE;
        // Snap if very close
        if (Math.abs(displayedPrice - targetWsPrice) / targetWsPrice < 0.000001) {
          displayedPrice = targetWsPrice;
        }

        // Chart updates at full speed (20fps)
        applyStreamingPrice(displayedPrice);
        appendCryptoChartPoint(displayedPrice);

        // Price display updates slowly (~2x/sec) to avoid blinking
        const now = Date.now();
        if (now - lastDisplayUpdate >= DISPLAY_THROTTLE_MS) {
          lastDisplayUpdate = now;
          applyDisplayPrice(displayedPrice);
        }
      }, CRYPTO_TICK_MS);
    }

    // For crypto: use Binance WebSocket for real-time streaming
    const unsubWs = subscribeToPriceStream(streamAssetSymbol, handleWsTick);

    // Also subscribe to smoothed interpolation for crypto fallback
    // When WS is active, real WS ticks dominate via the lerp loop above.
    // When WS is stale/blocked, feedRealPrice from HTTP polls drives this
    // interpolation system to provide Brownian drift = vibrant chart.
    let unsubCryptoSmooth: (() => void) | null = null;
    if (asset.assetClass === "crypto") {
      let lastSmoothChartAppend = 0;
      let lastSmoothDisplayUpdate = 0;
      const SMOOTH_DISPLAY_THROTTLE = 500;

      unsubCryptoSmooth = subscribeToSmoothedPriceStream(streamAssetSymbol, (price) => {
        if (!isCurrentRun()) return;
        // Only use smooth interpolation when WS is NOT active
        const now = Date.now();
        const wsStale = lastWsTickAtRef.current === 0 || (now - lastWsTickAtRef.current) > 5000;
        if (!wsStale) return; // WS is delivering data, skip interpolated prices

        // Update the lerp target so the main crypto loop picks it up
        targetWsPrice = price;
        displayedPrice = price;

        applyStreamingPrice(price);
        appendCryptoChartPoint(price);

        if (now - lastSmoothDisplayUpdate >= SMOOTH_DISPLAY_THROTTLE) {
          lastSmoothDisplayUpdate = now;
          applyDisplayPrice(price);
        }
      });
    }

    // For non-crypto assets: use smooth interpolation + polling
    let unsubPoller: (() => void) | null = null;
    let unsubSmooth: (() => void) | null = null;

    if (asset.assetClass !== "crypto") {
      unsubPoller = startNonCryptoHistoryPoller(streamAssetSymbol);

      // Subscribe to smoothed price stream (~15fps interpolation for chart, ~2fps for display)
      let lastSmoothUpdate = 0;
      let lastDisplayUpdate = 0;
      const DISPLAY_THROTTLE_MS = 500;
      unsubSmooth = subscribeToSmoothedPriceStream(streamAssetSymbol, (price) => {
        if (!isCurrentRun()) return;
        const now = Date.now();

        // Chart streaming price updates at full speed
        applyStreamingPrice(price);

        // Price display updates slowly (~2x/sec) to avoid blinking
        if (now - lastDisplayUpdate >= DISPLAY_THROTTLE_MS) {
          lastDisplayUpdate = now;
          applyDisplayPrice(price);
        }

        // Append chart points at ~100ms intervals for smooth streaming
        if (now - lastSmoothUpdate >= 100) {
          lastSmoothUpdate = now;
          const timeLabel = new Date(now).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
          const maxCutoff = now - 4 * 60 * 60 * 1000;

          setPriceHistory((prev) => {
            const newPoint = { time: timeLabel, price, ts: now };
            if (prev.length < 800) return [...prev, newPoint];
            let start = 0;
            while (start < prev.length && prev[start].ts < maxCutoff) start++;
            const trimmed = start > 0 ? prev.slice(start) : prev;
            return [...trimmed.slice(-(799)), newPoint];
          });

          // Update raw cache efficiently (mutate in place, trim lazily)
          const rawCached = rawDataRef.current.get(streamAssetSymbol) || [];
          rawCached.push([now, price]);
          if (rawCached.length > 1000) {
            const cutIdx = rawCached.findIndex(([ts]) => ts >= maxCutoff);
            rawDataRef.current.set(streamAssetSymbol, cutIdx > 0 ? rawCached.slice(cutIdx) : rawCached.slice(-800));
          }
        }
      });

      // HTTP poll for real prices every 10s and feed into interpolation
      const pollNonCrypto = async () => {
        const now = Date.now();
        if (now - lastFetchTimeRef.current < 8000) return;
        lastFetchTimeRef.current = now;

        const p = await fetchPriceForAsset(asset);
        if (p != null && isCurrentRun()) {
          consecutiveFailsRef.current = 0;
          feedRealPrice(streamAssetSymbol, p);
          applyDisplayPrice(p);
          applyStreamingPrice(p);
        } else if (p == null && isCurrentRun()) {
          consecutiveFailsRef.current++;
          if (consecutiveFailsRef.current >= 5 && !disabledAssets.has(streamAssetSymbol)) {
            try {
              const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
              await fetch(
                `https://${projectId}.supabase.co/functions/v1/toggle-qt-asset`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ asset: streamAssetSymbol, action: "disable" }),
                }
              );
              queryClient.invalidateQueries({ queryKey: ["commission_settings"] });
              toast({
                title: "Market Unavailable",
                description: `${asset.label} has been temporarily disabled due to price feed errors.`,
                variant: "destructive",
              });
            } catch {}
          }
        }
      };

      // Initial fetch
      pollNonCrypto();
      pollIv = setInterval(pollNonCrypto, 10_000);

    } else {
      // Crypto: HTTP fallback feeds into the smooth interpolation system
      // instead of directly appending jittered points
      const WS_STALE_MS = 5_000;
      const fallbackTimer = setTimeout(() => {
        if (!isCurrentRun()) return;

        const poll = async () => {
          if (!isCurrentRun()) return;
          const now = Date.now();
          const wsStale = lastWsTickAtRef.current === 0 || (now - lastWsTickAtRef.current) > WS_STALE_MS;
          if (!wsStale) return;
          if (now - lastFetchTimeRef.current < 5000) return;
          lastFetchTimeRef.current = now;

          const p = await fetchPriceForAsset(asset);
          if (p != null && isCurrentRun()) {
            consecutiveFailsRef.current = 0;
            // Feed into the smooth interpolation system for Brownian drift
            feedRealPrice(streamAssetSymbol, p);

            // Directly update display + streaming price so chart renders
            // even when WS is completely blocked (e.g. preview iframe)
            applyDisplayPrice(p);
            applyStreamingPrice(p);

            // Seed initial price history if chart has no data yet
            const fmt = (t: number) => new Date(t).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
            setPriceHistory(prev => {
              if (prev.length < 2) {
                return [
                  { time: fmt(now - 1000), price: p, ts: now - 1000 },
                  { time: fmt(now), price: p, ts: now },
                ];
              }
              return prev;
            });

            // Also update raw cache for timeframe filtering
            const maxCutoff = now - 4 * 60 * 60 * 1000;
            const rawCached = rawDataRef.current.get(streamAssetSymbol) || [];
            rawDataRef.current.set(
              streamAssetSymbol,
              [...rawCached, [now, p] as [number, number]].filter(([ts]) => ts >= maxCutoff).slice(-500),
            );
          }
        };

        poll();
        pollIv = setInterval(poll, 5000);
      }, 2000); // Reduced from 3s to 2s for faster fallback

      return () => {
        mounted = false;
        wsActiveRef.current = false;
        lastWsTickAtRef.current = 0;
        unsubWs();
        unsubCryptoSmooth?.();
        unsubPoller?.();
        unsubSmooth?.();
        if (cryptoInterpId) clearInterval(cryptoInterpId);
        if (pendingRaf) cancelAnimationFrame(pendingRaf);
        clearTimeout(fallbackTimer);
        if (pollIv) clearInterval(pollIv);
      };
    }

    return () => {
      mounted = false;
      wsActiveRef.current = false;
      unsubWs();
      unsubCryptoSmooth?.();
      unsubPoller?.();
      unsubSmooth?.();
      if (cryptoInterpId) clearInterval(cryptoInterpId);
      if (pendingRaf) cancelAnimationFrame(pendingRaf);
      if (pollIv) clearInterval(pollIv);
    };
  }, [selectedAsset.symbol]);

  // ── Fetch / create active round ──
  const latestRoundContextRef = useRef<{ asset: string; duration: number }>({
    asset: selectedAsset.symbol,
    duration: selectedTimeframe.seconds,
  });

  useEffect(() => {
    latestRoundContextRef.current = {
      asset: selectedAsset.symbol,
      duration: selectedTimeframe.seconds,
    };
  }, [selectedAsset.symbol, selectedTimeframe.seconds]);

  const roundRequestIdRef = useRef(0);

  const fetchActiveRound = useCallback(async () => {
    const requestId = ++roundRequestIdRef.current;
    const requestAsset = selectedAsset.symbol;
    const requestDuration = selectedTimeframe.seconds;

    const isCurrentRoundRequest = () =>
      roundRequestIdRef.current === requestId &&
      latestRoundContextRef.current.asset === requestAsset &&
      latestRoundContextRef.current.duration === requestDuration;

    // Get current open/locked round for this asset + duration
    const { data } = await supabase
      .from("quick_rounds")
      .select("*")
      .eq("asset", requestAsset)
      .eq("duration_seconds", requestDuration)
      .in("status", ["open", "locked"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (!isCurrentRoundRequest()) return;

    if (data && data.length > 0) {
      setActiveRound(data[0] as unknown as Round);
      return;
    }

    // Don't create rounds when market is closed
    if (!isMarketOpen(selectedAsset.assetClass)) return;

    // No active round — create one using a fresh price snapshot for the selected asset
    const freshPrice = await fetchPriceForAsset(selectedAsset);
    if (freshPrice == null || !isCurrentRoundRequest()) return;

    const now = new Date();
    const locksAt = new Date(now.getTime() + (requestDuration - LOCK_BUFFER) * 1000);
    const { data: newRound } = await supabase
      .from("quick_rounds")
      .insert({
        asset: requestAsset,
        duration_seconds: requestDuration,
        open_price: freshPrice,
        status: "open",
        locks_at: locksAt.toISOString(),
      })
      .select()
      .single();

    if (newRound && isCurrentRoundRequest()) {
      setActiveRound(newRound as unknown as Round);
    }
  }, [selectedAsset.symbol, selectedTimeframe.seconds]);

  // Fetch round when asset or timeframe changes (not on every price tick)
  useEffect(() => {
    fetchActiveRound();
  }, [fetchActiveRound]);

  // Also fetch round once we get a price for the first time (to create if needed)
  const hasTriedCreateRef = useRef(false);
  useEffect(() => {
    if (currentPrice != null && !activeRound && !hasTriedCreateRef.current) {
      hasTriedCreateRef.current = true;
      fetchActiveRound();
    }
  }, [currentPrice, activeRound, fetchActiveRound]);

  // Reset create flag when asset/timeframe changes
  useEffect(() => {
    hasTriedCreateRef.current = false;
  }, [selectedAsset.symbol, selectedTimeframe.seconds]);

  // ── Countdown ──
  const resolvePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveTriggeredRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeRound) {
      setResolving(false);
      return;
    }
    const roundId = activeRound.id;
    const tick = () => {
      const end = new Date(activeRound.created_at).getTime() + activeRound.duration_seconds * 1000;
      const left = Math.max(0, Math.floor((end - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0 && resolveTriggeredRef.current !== roundId) {
        resolveTriggeredRef.current = roundId;
        setResolving(true);

        // Fire-and-forget: trigger resolution immediately
        supabase.functions.invoke("resolve-quick-round", {
          body: { roundId },
        }).catch(() => {});

        // Poll every 3s for up to 30s to detect resolution
        let attempts = 0;
        resolvePollRef.current = setInterval(async () => {
          attempts++;
          const { data } = await supabase
            .from("quick_rounds")
            .select("status")
            .eq("id", roundId)
            .single();
          if (data?.status === "resolved" || attempts >= 10) {
            if (resolvePollRef.current) clearInterval(resolvePollRef.current);
            resolvePollRef.current = null;
            setResolving(false);
            fetchActiveRound();
          }
        }, 3000);
      }
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => {
      clearInterval(iv);
      if (resolvePollRef.current) {
        clearInterval(resolvePollRef.current);
        resolvePollRef.current = null;
      }
    };
  }, [activeRound]);

  // ── Check user trade on this round ──
  useEffect(() => {
    if (!user || !activeRound) {
      setUserBet(null);
      return;
    }
    const load = async () => {
      const { data } = await supabase
        .from("quick_bets")
        .select("*")
        .eq("round_id", activeRound.id)
        .eq("user_id", user.id)
        .limit(1);
      setUserBet(data && data.length > 0 ? (data[0] as unknown as Bet) : null);
    };
    load();
  }, [user, activeRound?.id]);

  // ── Pool sizes (realtime: refresh on every new bet for this round) ──
  useEffect(() => {
    if (!activeRound) return;
    const roundId = activeRound.id;
    const loadPool = async () => {
      const { data } = await supabase
        .from("quick_bets")
        .select("side, amount")
        .eq("round_id", roundId);
      if (data) {
        setPoolUp(data.filter((b) => b.side === "up").reduce((s, b) => s + Number(b.amount), 0));
        setPoolDown(data.filter((b) => b.side === "down").reduce((s, b) => s + Number(b.amount), 0));
      }
    };
    loadPool();

    // Live-refresh implied % chance whenever any user places a bet on this round
    const channel = supabase
      .channel(`quick-bets-${roundId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "quick_bets", filter: `round_id=eq.${roundId}` },
        () => { loadPool(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeRound?.id, userBet]);

  // ── Recent resolved rounds ──
  useEffect(() => {
    const load = async () => {
      const from = historyPage * HISTORY_PER_PAGE;
      const to = from + HISTORY_PER_PAGE - 1;

      const { data, count } = await supabase
        .from("quick_rounds")
        .select("*", { count: "exact" })
        .eq("asset", selectedAsset.symbol)
        .eq("status", "resolved")
        .order("resolved_at", { ascending: false })
        .range(from, to);
      if (data) setRecentRounds(data as unknown as Round[]);
      if (count != null) setHistoryTotal(count);
    };
    load();
  }, [selectedAsset.symbol, activeRound?.status, historyPage]);

  // Reset page when asset changes
  useEffect(() => {
    setHistoryPage(0);
  }, [selectedAsset.symbol]);

  // ── User recent trades (filtered by selected asset) ──
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("quick_bets")
        .select("*, quick_rounds!inner(asset)")
        .eq("user_id", user.id)
        .eq("quick_rounds.asset", selectedAsset.symbol)
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setUserBets(data as unknown as Bet[]);
    };
    load();
  }, [user, activeRound?.status, selectedAsset.symbol]);

  // ── Realtime subscription (filtered by asset, debounced, no round creation) ──
  const realtimeLastFetchRef = useRef(0);
  useEffect(() => {
    const assetSymbol = selectedAsset.symbol;

    // Fetch-only version: SELECT existing round, never INSERT
    const fetchRoundOnly = async () => {
      const now = Date.now();
      if (now - realtimeLastFetchRef.current < 2000) return; // debounce 2s
      realtimeLastFetchRef.current = now;

      const { data } = await supabase
        .from("quick_rounds")
        .select("*")
        .eq("asset", assetSymbol)
        .eq("duration_seconds", selectedTimeframe.seconds)
        .in("status", ["open", "locked"])
        .order("created_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        setActiveRound(data[0] as unknown as Round);
      } else {
        setActiveRound(null);
      }
    };

    const channel = supabase
      .channel(`quick-rounds-${assetSymbol}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "quick_rounds",
        filter: `asset=eq.${assetSymbol}`,
      }, async (payload) => {
        // Debounced fetch (SELECT only — no round creation)
        fetchRoundOnly();

        // Haptic + confetti on round resolution
        if (payload.eventType === "UPDATE" && (payload.new as any)?.status === "resolved") {
          haptic("heavy");
          const resolvedResult = (payload.new as any)?.result;

          // Check if user won this round
          if (user) {
            const { data: myBets } = await supabase
              .from("quick_bets")
              .select("side")
              .eq("round_id", (payload.new as any)?.id)
              .eq("user_id", user.id)
              .limit(1);

            if (myBets && myBets.length > 0) {
              const won = myBets[0].side === resolvedResult;
              setResolveFlash(won ? "win" : "lose");
              setTimeout(() => setResolveFlash(null), 1500);
              if (won) {
                if (!soundMuted) playWinSound();
                fireWinConfetti();
                haptic("success");
                const betAmt = myBets[0].side === "up" || myBets[0].side === "down" ? parseFloat(betAmount) || 10 : 10;
                const estimatedPayout = betAmt * 2 * (1 - (commissionSettings?.quick_trade_fee_percent ?? 5) / 100);
                const estimatedProfit = estimatedPayout - betAmt;
                setWinShareData({ profit: estimatedProfit, payout: estimatedPayout, side: myBets[0].side, asset: selectedAsset.symbol });
                toast({ title: "You won! 🎉", description: `The round resolved ${resolvedResult?.toUpperCase()}`, action: <button onClick={() => setShowWinShare(true)} className="text-xs font-bold text-primary underline">Share Win</button> });
                track("quick_trade_won", { asset: selectedAsset.symbol, side: myBets[0].side, amount: betAmt, profit: estimatedProfit });
              } else {
                if (!soundMuted) playLoseSound();
                haptic("error");
                track("quick_trade_lost", { asset: selectedAsset.symbol, side: myBets[0].side });
              }
            } else {
              setResolveFlash(resolvedResult === "up" ? "win" : "lose");
              setTimeout(() => setResolveFlash(null), 1500);
            }
          } else {
            setResolveFlash(resolvedResult === "up" ? "win" : "lose");
            setTimeout(() => setResolveFlash(null), 1500);
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedAsset.symbol, selectedTimeframe.seconds, user, fireWinConfetti]);

  // ── Place trade ──
  const placeBet = async (side: "up" | "down") => {
    if (!user) {
      navigate("/auth");
      return;
    }
    if (!activeRound || isLocked || userBet) return;

    const amt = parseFloat(betAmount);
    if (isNaN(amt) || amt < qtMinBet) {
      toast({ title: `Minimum trade is $${qtMinBet}`, variant: "destructive" });
      return;
    }
    if (amt > qtMaxBet) {
      toast({ title: `Maximum trade is $${qtMaxBet}`, variant: "destructive" });
      return;
    }
    if (amt > balance) {
      toast({ title: "Insufficient balance", variant: "destructive" });
      return;
    }

    haptic("medium");
    setPlacing(true);
    try {
      // Deduct balance
      const { data: bal } = await supabase
        .from("balances")
        .select("amount")
        .eq("user_id", user.id)
        .eq("currency", "USDT")
        .single();

      if (!bal || Number(bal.amount) < amt) {
        toast({ title: "Insufficient balance", variant: "destructive" });
        return;
      }

      // Insert trade
      const { error: betErr } = await supabase.from("quick_bets").insert({
        user_id: user.id,
        round_id: activeRound.id,
        side,
        amount: amt,
      });
      if (betErr) throw betErr;

      // Deduct balance via service — for now client-side (should be edge function in prod)
      // We'll use the edge function approach: call resolve-quick-round for deduction
      // Actually, we need to deduct balance here. Using direct update with RLS won't work.
      // Use supabase functions to handle this properly.
      // For MVP: deduct via direct update (balances table has no INSERT/UPDATE for users)
      // We need an edge function for placing quick bets. For now, let's use the existing place-bet pattern.

      // Workaround: use RPC or a simpler approach — actually balances can't be updated by users.
      // Let's create the trade and handle deduction in the resolve function by tracking it.
      // Better approach: deduct via an edge function call.

      // For now, we'll invoke a simple function
      const { error: deductErr } = await supabase.functions.invoke("resolve-quick-round", {
        body: { action: "deduct", userId: user.id, amount: amt },
      });

      queryClient.invalidateQueries({ queryKey: ["balance"] });

      haptic("success");
      toast({ title: `${side.toUpperCase()} trade placed!`, description: `$${amt} on ${selectedAsset.symbol}` });

      // Trigger copy-trade for followers (fire-and-forget)
      supabase.functions.invoke("copy-trade", {
        body: {
          trader_user_id: user.id,
          trade_type: "quick_trade",
          market_id: null,
          option_id: null,
          side,
          amount: amt,
          price: 0,
          shares: 0,
        },
      }).catch(() => {});

      // Reload trade state
      const { data: newBet } = await supabase
        .from("quick_bets")
        .select("*")
        .eq("round_id", activeRound.id)
        .eq("user_id", user.id)
        .limit(1);
      if (newBet && newBet.length > 0) setUserBet(newBet[0] as unknown as Bet);
      track("bet_placed", { category: "quick_trade", asset: selectedAsset.symbol, side, amount: amt, timeframe: selectedTimeframe.label });
    } catch (err: any) {
      haptic("error");
      toast({ title: "Failed to place trade", description: err.message, variant: "destructive" });
    } finally {
      setPlacing(false);
    }
  };

  const priceDir = currentPrice != null && prevPrice != null
    ? currentPrice > prevPrice ? "up" : currentPrice < prevPrice ? "down" : "neutral"
    : "neutral";

  // ── Chart engine integration ──
  // Stable seed history: only rebuilt on asset/timeframe change, not on every streaming tick
  const historyVersionRef = useRef(0);
  const lastSeedKeyRef = useRef("");
  const seedKey = `${selectedAsset.symbol}:${chartMs}`;
  if (seedKey !== lastSeedKeyRef.current) {
    lastSeedKeyRef.current = seedKey;
    historyVersionRef.current += 1;
  }
  const historyVersion = historyVersionRef.current;

  const engineHistoryPoints = useMemo(() => {
    const raw = rawDataRef.current.get(selectedAsset.symbol);
    if (!raw || raw.length === 0) {
      return priceHistory.map(p => ({ ts: p.ts, price: p.price }));
    }
    const candleCount = 60;
    const windowMs = chartMs * candleCount;
    const cutoff = Date.now() - windowMs;
    return raw
      .filter(([ts]) => ts >= cutoff)
      .map(([ts, price]) => ({ ts, price }));
  // Re-evaluate after initial history load lands; reseed is still guarded by historyVersion
  }, [historyVersion, chartMs, selectedAsset.symbol, historyLoading, priceHistory.length]);

  const {
    candles: engineCandles,
    linePoints: engineLinePoints,
    activeCandle: engineActiveCandle,
    bucketCountdown,
    bucketProgress,
    ready: engineReady,
  } = useChartEngine({
    chartTimeframe,
    priceHistory: engineHistoryPoints,
    streamingPrice,
    historyLoading,
    historyVersion,
  });

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const totalPool = poolUp + poolDown;

  return (
    <>
      <SEOHead title="Quick Trade — Fast Predictions" description="Predict if assets go UP or DOWN — Crypto, Commodities, Forex" />
      <TopBar />
      <div className="min-h-screen bg-background pt-[var(--content-top)]" style={{ paddingBottom: 'calc(1rem + var(--content-bottom))' }}>
        <div className="max-w-xl md:max-w-3xl mx-auto px-3 sm:px-4 pt-3 sm:pt-4">

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-foreground">Quick Trade</h1>
              <p className="text-xs text-muted-foreground">{selectedTimeframe.label} UP/DOWN predictions</p>
            </div>
            {isMarketOpen(selectedAsset.assetClass) ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/15 border border-green-500/30">
                <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span></span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-green-500">Live</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/15 border border-destructive/30">
                <Moon className="w-3 h-3 text-destructive" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-destructive">Closed</span>
              </div>
            )}
          </div>

          {/* Asset selector — grouped by class */}
          <div className="space-y-2 mb-4">
            {(["crypto", "commodity", "forex"] as AssetClass[]).map((cls) => {
              const classAssets = ASSETS.filter(a => a.assetClass === cls);
              if (classAssets.length === 0) return null;
              return (
                <div key={cls}>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{ASSET_CLASS_LABELS[cls]}</p>
                  <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                    {classAssets.map((a) => {
                      const isDisabled = disabledAssets.has(a.symbol);
                      return (
                      <button
                        key={a.symbol}
                        onClick={() => {
                          if (isDisabled) return;
                          setSelectedAsset(a);
                          setActiveRound(null);
                          setUserBet(null);
                        }}
                        disabled={isDisabled}
                        className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          isDisabled
                            ? "bg-destructive/10 text-destructive/60 cursor-not-allowed line-through opacity-60"
                            : selectedAsset.symbol === a.symbol
                            ? "bg-primary text-primary-foreground shadow-lg"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted"
                        }`}
                        title={isDisabled ? "Market not available — disabled by admin" : undefined}
                      >
                        {a.icon && <span className="text-sm">{a.icon}</span>}
                        {a.symbol}
                        {isDisabled && <span className="text-[9px] no-underline ml-0.5">⚠️</span>}
                      </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Timeframe selector */}
          <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">Round Duration</p>
          <div className="flex gap-2 mb-4">
            {TIMEFRAMES.map((tf) => {
              const marketOpen = isMarketOpen(selectedAsset.assetClass);
              return (
                <button
                  key={tf.label}
                  disabled={!marketOpen}
                  onClick={() => {
                    if (!marketOpen) return;
                    setSelectedTimeframe(tf);
                    setActiveRound(null);
                    setUserBet(null);
                  }}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${
                    !marketOpen
                      ? "bg-muted/20 text-muted-foreground/50 cursor-not-allowed"
                      : selectedTimeframe.seconds === tf.seconds
                        ? "bg-accent text-accent-foreground shadow-md"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>

          {/* Price display */}
          <div ref={chartCardRef} className="relative rounded-2xl border border-border bg-card p-3 sm:p-5 mb-3 sm:mb-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{getPriceLabel(selectedAsset)}</p>
                {currentPrice != null && currentPriceAsset === selectedAsset.symbol ? (
                  <p
                    className={`text-3xl font-bold tabular-nums mt-1 transition-colors duration-500 ease-in-out ${
                      priceDir === "up" ? "text-green-500" : priceDir === "down" ? "text-destructive" : "text-foreground"
                    }`}
                  >
                    {getPricePrefix(selectedAsset)}{formatPrice(currentPrice, selectedAsset)}
                    {priceDir === "up" && <TrendingUp className="inline w-5 h-5 ml-2 transition-opacity duration-500" />}
                    {priceDir === "down" && <TrendingDown className="inline w-5 h-5 ml-2 transition-opacity duration-500" />}
                  </p>
                ) : (
                  <div className="h-10 w-40 bg-muted/50 rounded animate-pulse mt-1" />
                )}
                
              </div>

              {/* Countdown */}
              <div className="text-center">
                {!isMarketOpen(selectedAsset.assetClass) ? (
                  <>
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Moon className="w-5 h-5" />
                      <span className="text-lg font-bold">Closed</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/70 mt-1 block">
                      {getNextOpenTime(selectedAsset.assetClass)}
                    </span>
                  </>
                ) : resolving ? (
                  <div className="flex items-center gap-2 text-lg text-muted-foreground">
                    <span className="w-5 h-5 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                    Resolving
                  </div>
                ) : (() => {
                  const tl = Math.max(0, timeLeft);
                  const mins = Math.floor(tl / 60);
                  const secs = tl % 60;
                  const colorCls = tl <= 10
                    ? "text-destructive animate-[scale-pulse_0.6s_ease-in-out_infinite]"
                    : tl <= 30
                      ? "text-amber-500"
                      : "text-destructive";
                  return (
                    <div className="flex items-end gap-2 sm:gap-3">
                      <div className="flex flex-col items-center">
                        <span className={`text-3xl sm:text-4xl font-mono font-extrabold tabular-nums leading-none transition-colors duration-300 ${colorCls}`}>
                          {String(mins).padStart(2, "0")}
                        </span>
                        <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Mins</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className={`text-3xl sm:text-4xl font-mono font-extrabold tabular-nums leading-none transition-colors duration-300 ${colorCls}`}>
                          {String(secs).padStart(2, "0")}
                        </span>
                        <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Secs</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Price to Beat + Final Price header */}
            <PriceToBeatHeader
              openPrice={activeRound?.open_price ? Number(activeRound.open_price) : null}
              currentPrice={currentPrice}
              closePrice={activeRound?.close_price ? Number(activeRound.close_price) : null}
              resolveFlash={resolveFlash}
              formatPrice={(p: number) => formatPrice(p, selectedAsset)}
              pricePrefix={getPricePrefix(selectedAsset)}
              userBetSide={userBet?.side ?? null}
            />

            {/* Chart timeframe selector + Mini price chart */}
            <div className="mt-3 -mx-2">
              <div className="flex items-center justify-between mb-2 px-2">
                <div className="flex items-center gap-1">
                  {CHART_TIMEFRAMES.map((tf) => (
                    <button
                      key={tf.key}
                      onClick={() => setChartTimeframe(tf.key)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
                        chartTimeframe === tf.key
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-0.5 bg-muted/40 rounded-md p-0.5">
                  {lineChartEnabled && (
                    <button
                      onClick={() => setChartType("area")}
                      className={`p-1.5 rounded transition-all ${chartType === "area" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      title="Area chart"
                    >
                      <LineChartIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setChartType("candle")}
                    className={`p-1.5 rounded transition-all ${chartType === "candle" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    title="Candlestick chart"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                  </button>
                  {polyChartEnabled && (
                    <button
                      onClick={() => setChartType("poly")}
                      className={`p-1.5 rounded transition-all ${chartType === "poly" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      title="Polymarket-style chart"
                    >
                      <Activity className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {selectedAsset.assetClass === "crypto" && tvChartEnabled && (
                    <button
                      onClick={() => setChartType("tv")}
                      className={`px-1.5 py-1 rounded text-[9px] font-bold transition-all ${chartType === "tv" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      title="TradingView chart"
                    >
                      TV
                    </button>
                  )}
                </div>
                <button
                  onClick={toggleMute}
                  className={`p-1.5 rounded transition-all ${soundMuted ? "text-muted-foreground hover:text-foreground" : "text-primary"}`}
                  title={soundMuted ? "Unmute sounds" : "Mute sounds"}
                >
                  {soundMuted ? <VolumeOff className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="relative overflow-hidden">
                {/* Resolution flash/glow overlay */}
                {resolveFlash && (
                  <div
                    className={`absolute inset-0 z-20 pointer-events-none rounded-lg animate-[flash_1.5s_ease-out_forwards] ${
                      resolveFlash === "win"
                        ? "bg-green-500/20 shadow-[inset_0_0_40px_rgba(34,197,94,0.4)]"
                        : "bg-red-500/20 shadow-[inset_0_0_40px_rgba(239,68,68,0.4)]"
                    }`}
                  />
                )}
                {/* Overlays for native charts (area/candle) */}
                {chartType !== "tv" && !historyLoading && (
                  <>
                    {/* Live badge + P&L */}
                    <div className="absolute top-1 left-1 z-10 flex items-center gap-2">
                      {isMarketOpen(selectedAsset.assetClass) ? (
                        <div className="flex items-center gap-1.5">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                          </span>
                          <span className="text-[9px] font-bold text-green-500 uppercase tracking-wider">Live</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Moon className="w-2.5 h-2.5 text-destructive" />
                          <span className="text-[9px] font-bold text-destructive uppercase tracking-wider">Closed</span>
                        </div>
                      )}
                      {userBet && activeRound?.open_price && currentPrice != null && (() => {
                        const entry = Number(activeRound.open_price);
                        const pnl = userBet.side === "down"
                          ? ((entry - currentPrice) / entry) * 100
                          : ((currentPrice - entry) / entry) * 100;
                        const pos = pnl >= 0;
                        return (
                          <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold backdrop-blur-sm border ${pos ? "bg-green-500/15 text-green-500 border-green-500/30" : "bg-red-500/15 text-red-500 border-red-500/30"}`}>
                            <span>{pos ? "▲" : "▼"}</span>
                            <span>{pos ? "+" : ""}{pnl.toFixed(2)}%</span>
                          </div>
                        );
                      })()}
                    </div>
                    {/* Countdown timer removed — already shown prominently in header above */}
                    {/* "Price to beat" badge — only when user has an active trade */}
                    {userBet && activeRound?.open_price && (
                      <div className="absolute bottom-2 right-2 z-10">
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold backdrop-blur-sm border bg-amber-500/10 text-amber-500 border-amber-500/30">
                          <span>📍</span>
                          <span>Entry {getPricePrefix(selectedAsset)}{formatPrice(Number(activeRound.open_price), selectedAsset)}</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              <QuickTradeChart
                chartType={chartType}
                chartTimeframe={chartTimeframe}
                chartAssetKey={selectedAsset.symbol}
                chartMs={chartMs}
                priceHistory={priceHistory}
                ohlcData={ohlcData}
                streamingPrice={streamingPrice}
                streamingPriceRef={streamingPriceRef}
                historyLoading={historyLoading}
                activeRound={activeRound}
                userBet={userBet}
                resolveFlash={resolveFlash}
                timeframeLabel={(CHART_TIMEFRAMES.find(t => t.key === chartTimeframe) ?? CHART_TIMEFRAMES[0])?.label ?? "5m"}
                assetClass={selectedAsset.assetClass}
                engineCandles={engineCandles}
                engineLinePoints={engineLinePoints}
                engineActiveCandle={engineActiveCandle}
                bucketCountdown={bucketCountdown}
                bucketProgress={bucketProgress}
                engineReady={engineReady}
              />
              </div>
            </div>

            {/* Share button - bottom left */}
            <button
              onClick={() => setShowShareModal(true)}
              className="absolute bottom-3 left-4 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background/70 backdrop-blur-sm border border-border/50 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <Share2 className="w-3 h-3" />
              Share
            </button>

            {/* Watermark */}
            <div className="absolute bottom-3 right-4 z-20 opacity-40 pointer-events-none">
              <img src={watermarkLogo} alt="" className="h-7 w-auto hidden dark:block" />
              <img src={blueLogo} alt="" className="h-7 w-auto dark:hidden" />
            </div>
          </div>


          {/* Pool info */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-2.5 sm:p-3 text-center">
              <ArrowUp className="w-4 h-4 text-green-500 mx-auto mb-1" />
              <p className="text-base sm:text-lg font-bold text-green-500">${poolUp.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground uppercase">UP Pool</p>
            </div>
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-2.5 sm:p-3 text-center">
              <ArrowDown className="w-4 h-4 text-destructive mx-auto mb-1" />
              <p className="text-base sm:text-lg font-bold text-destructive">${poolDown.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground uppercase">DOWN Pool</p>
            </div>
          </div>

           <QuickTradeBetControls
            userBet={userBet}
            betAmount={betAmount}
            setBetAmount={setBetAmount}
            placing={placing}
            isLocked={isLocked}
            timeLeft={timeLeft}
            qtMinBet={qtMinBet}
            qtMaxBet={qtMaxBet}
            onPlaceBet={placeBet}
            amountPresets={AMOUNT_PRESETS}
            asset={selectedAsset.symbol}
            currentPrice={currentPrice}
            timeframeLabel={selectedTimeframe.label}
            poolUp={poolUp}
            poolDown={poolDown}
          />

          <Suspense fallback={<div className="h-40" />}>
            <QuickTradeHistory
              recentRounds={recentRounds as any}
              userBets={userBets as any}
              selectedAssetSymbol={selectedAsset.symbol}
              historyPage={historyPage}
              historyTotal={historyTotal}
              historyPerPage={HISTORY_PER_PAGE}
              onPageChange={setHistoryPage}
            />
          </Suspense>

        </div>
      </div>
      <BottomNav />
      {milestoneModal.open && (
        <Suspense fallback={null}>
          <StreakMilestoneModal
            open={milestoneModal.open}
            onClose={() => setMilestoneModal(m => ({ ...m, open: false }))}
            streak={milestoneModal.streak}
            multiplier={milestoneModal.multiplier}
          />
        </Suspense>
      )}
      {showShareModal && (
        <Suspense fallback={null}>
          <ShareModal
            open={showShareModal}
            onOpenChange={setShowShareModal}
            title={`${selectedAsset.symbol} Quick Trade — ${currentPrice ? `${getPricePrefix(selectedAsset)}${formatPrice(currentPrice, selectedAsset)}` : ""}`}
            description={`${selectedTimeframe.label} UP/DOWN prediction on ${selectedAsset.label}`}
            marketUrl={`${window.location.origin}/quick-trade`}
            captureRef={chartCardRef}
          />
        </Suspense>
      )}

      {/* Win profit share */}
      {winShareData && (
        <Suspense fallback={null}>
          <ProfitShareCard
            ref={profitCardRef}
            market={`${winShareData.asset} Quick Trade — ${winShareData.side.toUpperCase()} prediction`}
            side={winShareData.side === "up" ? "YES" : "NO"}
            profit={winShareData.profit}
            payout={winShareData.payout}
            displayName={user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Trader"}
            referralCode={user?.user_metadata?.display_name || user?.id || ""}
          />
        </Suspense>
      )}
      {showWinShare && (
        <Suspense fallback={null}>
          <ShareModal
            open={showWinShare}
            onOpenChange={(open) => { setShowWinShare(open); if (!open) setWinShareData(null); }}
            title={winShareData ? `I just won +$${winShareData.profit.toFixed(2)} on oPoll Quick Trade! 🔥` : ""}
            description={winShareData ? `${winShareData.asset} ${winShareData.side.toUpperCase()} prediction` : ""}
            marketUrl={`${window.location.origin}/quick-trade${user ? `?ref=${user.user_metadata?.display_name || user.id}` : ""}`}
            captureRef={profitCardRef}
          />
        </Suspense>
      )}
    </>
  );
}
