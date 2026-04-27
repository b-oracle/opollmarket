import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, TrendingUp, Users, BarChart3, Clock, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import logoDark from "@/assets/logo-dark.png";

interface MarketData {
  id: string;
  title: string;
  category: string;
  yes_price: number;
  no_price: number;
  volume: number;
  participants: number;
  end_date: string;
  status: string;
  image_url: string | null;
  market_type: string;
  options?: { id: string; label: string; price: number; sort_order: number }[];
}

interface BrandConfig {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  darkBg: string;
}

const DEFAULT_BRAND: BrandConfig = {
  name: "OPollmarket",
  logoUrl: null,
  primaryColor: "#3b82f6",
  darkBg: "#0a0a0f",
};

const EmbedMarket = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [market, setMarket] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brand, setBrand] = useState<BrandConfig>(DEFAULT_BRAND);

  useEffect(() => {
    if (!id) return;

    const apiKey = searchParams.get("key");

    const fetchMarket = async () => {
      // If API key provided, load white-label branding
      if (apiKey) {
        const { data: keyData } = await supabase
          .from("api_keys" as any)
          .select("brand_name, brand_logo_url, brand_primary_color, brand_dark_bg")
          .eq("api_key", apiKey)
          .eq("is_active", true)
          .maybeSingle();
        if (keyData) {
          const k = keyData as any;
          setBrand({
            name: k.brand_name || "OPollmarket",
            logoUrl: k.brand_logo_url || null,
            primaryColor: k.brand_primary_color || "#3b82f6",
            darkBg: k.brand_dark_bg || "#0a0a0f",
          });
        }
      }

      const { data, error: fetchErr } = await supabase
        .from("markets")
        .select("id, title, category, yes_price, no_price, volume, participants, end_date, status, image_url, market_type")
        .eq("id", id)
        .maybeSingle();

      if (fetchErr || !data) {
        setError("Market not found");
        setLoading(false);
        return;
      }

      let options = null;
      if (data.market_type === "multi") {
        const { data: opts } = await supabase
          .from("market_options")
          .select("id, label, price, sort_order")
          .eq("market_id", id)
          .order("sort_order");
        options = opts;
      }

      setMarket({ ...data, options: options || undefined } as MarketData);
      setLoading(false);
    };
    fetchMarket();
  }, [id, searchParams]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: brand.darkBg }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: brand.primaryColor }} />
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400 text-sm" style={{ background: brand.darkBg }}>
        {error || "Market not found"}
      </div>
    );
  }

  const yesPercent = Math.round(market.yes_price * 100);
  const noPercent = Math.round(market.no_price * 100);
  const isResolved = market.status === "resolved";
  const isCancelled = market.status === "cancelled";
  const timeLeft = new Date(market.end_date) > new Date()
    ? formatDistanceToNow(new Date(market.end_date), { addSuffix: false }) + " left"
    : "Ended";

  const marketUrl = `https://opoll.org/market/${market.id}`;

  return (
    <div className="h-screen w-screen text-white flex flex-col p-4 font-sans overflow-hidden" style={{ background: brand.darkBg }}>
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        {market.image_url && (
          <img src={market.image_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold leading-tight line-clamp-2">{market.title}</h1>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
            <span className="uppercase tracking-wider bg-white/10 px-1.5 py-0.5 rounded text-[9px]">{market.category}</span>
            {isResolved && <span className="text-green-400 font-semibold">Resolved</span>}
            {isCancelled && <span className="text-red-400 font-semibold">Cancelled</span>}
          </div>
        </div>
      </div>

      {/* Price bars */}
      {market.market_type === "binary" ? (
        <div className="space-y-2 mb-3">
          <div>
            <div className="flex justify-between text-[11px] mb-0.5">
              <span className="text-emerald-400 font-semibold">Yes</span>
              <span className="text-emerald-400 font-bold">{yesPercent}¢</span>
            </div>
            <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${yesPercent}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[11px] mb-0.5">
              <span className="text-rose-400 font-semibold">No</span>
              <span className="text-rose-400 font-bold">{noPercent}¢</span>
            </div>
            <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-rose-500 rounded-full transition-all" style={{ width: `${noPercent}%` }} />
            </div>
          </div>
        </div>
      ) : market.options ? (
        <div className="space-y-1.5 mb-3 max-h-[120px] overflow-y-auto">
          {market.options.map((opt) => (
            <div key={opt.id}>
              <div className="flex justify-between text-[11px] mb-0.5">
                <span style={{ color: brand.primaryColor }} className="font-medium truncate mr-2">{opt.label}</span>
                <span style={{ color: brand.primaryColor }} className="font-bold shrink-0">{Math.round(opt.price * 100)}¢</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.round(opt.price * 100)}%`, background: brand.primaryColor }} />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Stats */}
      <div className="flex items-center gap-4 text-[10px] text-gray-400 mb-3">
        <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" />${market.volume.toLocaleString()}</span>
        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{market.participants}</span>
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeLeft}</span>
      </div>

      {/* CTA */}
      <div className="mt-auto">
        <a
          href={marketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-white text-xs font-bold transition-colors hover:opacity-90"
          style={{ background: brand.primaryColor }}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          Predict on {brand.name}
          <ExternalLink className="w-3 h-3 ml-1 opacity-60" />
        </a>
      </div>

      {/* Branding */}
      <div className="flex items-center justify-center gap-1.5 mt-2 opacity-40">
        {brand.logoUrl ? (
          <img src={brand.logoUrl} alt={brand.name} className="h-3" />
        ) : (
          <img src={logoDark} alt="OPOLL" className="h-3" />
        )}
        <span className="text-[9px] text-gray-500">Powered by {brand.name}</span>
      </div>
    </div>
  );
};

export default EmbedMarket;
