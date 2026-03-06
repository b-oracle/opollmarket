// Unified asset class definitions for auto-resolve markets

export type AssetClass = "crypto" | "commodity" | "forex";

export interface AssetInfo {
  symbol: string;
  label: string;
  assetClass: AssetClass;
  unit: string; // e.g. "USD", "USD/oz"
}

export const CRYPTO_ASSETS: AssetInfo[] = [
  { symbol: "BTC", label: "Bitcoin", assetClass: "crypto", unit: "USD" },
  { symbol: "ETH", label: "Ethereum", assetClass: "crypto", unit: "USD" },
  { symbol: "BNB", label: "BNB", assetClass: "crypto", unit: "USD" },
  { symbol: "SOL", label: "Solana", assetClass: "crypto", unit: "USD" },
  { symbol: "XRP", label: "XRP", assetClass: "crypto", unit: "USD" },
  { symbol: "ADA", label: "Cardano", assetClass: "crypto", unit: "USD" },
  { symbol: "DOGE", label: "Dogecoin", assetClass: "crypto", unit: "USD" },
  { symbol: "MATIC", label: "Polygon", assetClass: "crypto", unit: "USD" },
  { symbol: "AVAX", label: "Avalanche", assetClass: "crypto", unit: "USD" },
  { symbol: "DOT", label: "Polkadot", assetClass: "crypto", unit: "USD" },
  { symbol: "LINK", label: "Chainlink", assetClass: "crypto", unit: "USD" },
  { symbol: "SHIB", label: "Shiba Inu", assetClass: "crypto", unit: "USD" },
];

export const COMMODITY_ASSETS: AssetInfo[] = [
  { symbol: "XAU", label: "Gold", assetClass: "commodity", unit: "USD/oz" },
  { symbol: "XAG", label: "Silver", assetClass: "commodity", unit: "USD/oz" },
  { symbol: "BRENT", label: "Brent Oil", assetClass: "commodity", unit: "USD/bbl" },
  { symbol: "WTI", label: "WTI Oil", assetClass: "commodity", unit: "USD/bbl" },
  { symbol: "XPT", label: "Platinum", assetClass: "commodity", unit: "USD/oz" },
  { symbol: "XPD", label: "Palladium", assetClass: "commodity", unit: "USD/oz" },
  { symbol: "NG", label: "Natural Gas", assetClass: "commodity", unit: "USD/MMBtu" },
  { symbol: "COPPER", label: "Copper", assetClass: "commodity", unit: "USD/lb" },
];

export const FOREX_ASSETS: AssetInfo[] = [
  { symbol: "EUR/USD", label: "Euro / US Dollar", assetClass: "forex", unit: "" },
  { symbol: "GBP/USD", label: "British Pound / US Dollar", assetClass: "forex", unit: "" },
  { symbol: "USD/JPY", label: "US Dollar / Japanese Yen", assetClass: "forex", unit: "" },
  { symbol: "AUD/USD", label: "Australian Dollar / US Dollar", assetClass: "forex", unit: "" },
  { symbol: "USD/CAD", label: "US Dollar / Canadian Dollar", assetClass: "forex", unit: "" },
  { symbol: "USD/CHF", label: "US Dollar / Swiss Franc", assetClass: "forex", unit: "" },
  { symbol: "NZD/USD", label: "New Zealand Dollar / US Dollar", assetClass: "forex", unit: "" },
  { symbol: "EUR/GBP", label: "Euro / British Pound", assetClass: "forex", unit: "" },
];

/** Categories that support price-based auto-resolution */
export const PRICE_AUTO_RESOLVE_CATEGORIES = ["Crypto", "Commodities", "Forex"];

/** Check if a category supports price-based auto-resolve */
export const isPriceAutoResolveCategory = (category: string) =>
  PRICE_AUTO_RESOLVE_CATEGORIES.includes(category);

/** Get the assets for a given category */
export const getAssetsForCategory = (category: string): AssetInfo[] => {
  switch (category) {
    case "Crypto": return CRYPTO_ASSETS;
    case "Commodities": return COMMODITY_ASSETS;
    case "Forex": return FOREX_ASSETS;
    default: return [];
  }
};

/** Get asset class from symbol */
export const getAssetClass = (symbol: string): AssetClass => {
  if (FOREX_ASSETS.some(a => a.symbol === symbol)) return "forex";
  if (COMMODITY_ASSETS.some(a => a.symbol === symbol)) return "commodity";
  return "crypto";
};

/** Get the label for an asset class category */
export const getAssetClassLabel = (category: string): string => {
  switch (category) {
    case "Crypto": return "Crypto Asset";
    case "Commodities": return "Commodity";
    case "Forex": return "Forex Pair";
    default: return "Asset";
  }
};

/** Get resolution source text */
export const getResolutionSource = (category: string, asset: string): string => {
  switch (category) {
    case "Crypto": return `Auto-resolved via live ${asset}/USD price feed`;
    case "Commodities": return `Auto-resolved via live ${asset} spot price feed`;
    case "Forex": return `Auto-resolved via live ${asset} exchange rate`;
    default: return `Auto-resolved via live ${asset} price feed`;
  }
};

export const OPERATORS = [
  { value: "at_or_above", label: "Reaches or exceeds" },
  { value: "at_or_below", label: "Drops to or below" },
  { value: "above", label: "Closes above" },
  { value: "below", label: "Closes below" },
];
