export interface MarketOption {
  id: string;
  label: string;
  price: number;
  sortOrder: number;
}

export interface Market {
  id: string;
  title: string;
  description: string;
  category: string;
  marketType: "binary" | "multi" | "range";
  yesPrice: number;
  noPrice: number;
  options?: MarketOption[];
  volume: number;
  liquidity: number;
  participants: number;
  endDate: string;
  creatorAddress: string;
  creatorName: string;
  imageUrl: string;
  videoUrl?: string;
  details?: string;
  trending: boolean;
  createdAt: string;
  autoResolve?: boolean;
  autoResolveAsset?: string;
  autoResolveTargetPrice?: number;
  autoResolveOperator?: string;
  autoResolveDeadline?: string;
  sportType?: string;
  sportMatchId?: string;
  sportPredictedOutcome?: string;
  sportLeague?: string;
  polymarketEventSlug?: string;
  twitterMetricType?: string;
  twitterResourceId?: string;
  twitterCurrentCount?: number;
  status?: string;
  isHidden?: boolean;
  resolvedSide?: string;
  winningOptionId?: string;
  streamUrl?: string;
  isStreaming?: boolean;
}

export const mockMarkets: Market[] = [
  {
    id: "1",
    title: "Will Bitcoin hit $150K before July 2026?",
    description: "Resolves YES if BTC/USD reaches $150,000 on any major exchange before July 1, 2026.",
    category: "Crypto",
    marketType: "binary",
    yesPrice: 0.62,
    noPrice: 0.38,
    volume: 2450000,
    liquidity: 890000,
    participants: 12847,
    endDate: "2026-07-01",
    creatorAddress: "0x1a2b...3c4d",
    creatorName: "CryptoOracle",
    imageUrl: "/images/market-btc.jpg",
    trending: true,
    createdAt: "2026-03-03T12:00:00Z",
  },
  {
    id: "2",
    title: "Will AI pass the Turing Test by end of 2026?",
    description: "Resolves YES if a publicly available AI system passes a formal Turing Test judged by a panel of experts.",
    category: "AI & Tech",
    marketType: "binary",
    yesPrice: 0.45,
    noPrice: 0.55,
    volume: 1870000,
    liquidity: 620000,
    participants: 9234,
    endDate: "2026-12-31",
    creatorAddress: "0x5e6f...7g8h",
    creatorName: "TechFuturist",
    imageUrl: "/images/market-ai.jpg",
    trending: true,
    createdAt: "2026-03-02T08:00:00Z",
  },
  {
    id: "7",
    title: "Who will win the 2026 FIFA World Cup?",
    description: "Resolves to the team that wins the 2026 FIFA World Cup Final.",
    category: "Sports",
    marketType: "multi",
    yesPrice: 0,
    noPrice: 0,
    options: [
      { id: "7a", label: "Brazil", price: 0.22, sortOrder: 0 },
      { id: "7b", label: "France", price: 0.20, sortOrder: 1 },
      { id: "7c", label: "Argentina", price: 0.18, sortOrder: 2 },
      { id: "7d", label: "England", price: 0.15, sortOrder: 3 },
      { id: "7e", label: "Germany", price: 0.12, sortOrder: 4 },
      { id: "7f", label: "Other", price: 0.13, sortOrder: 5 },
    ],
    volume: 8900000,
    liquidity: 3200000,
    participants: 45200,
    endDate: "2026-07-19",
    creatorAddress: "0xab12...cd34",
    creatorName: "SportsBet",
    imageUrl: "/images/market-worldcup.jpg",
    trending: true,
    createdAt: "2026-02-28T10:00:00Z",
  },
  {
    id: "3",
    title: "Will SpaceX land humans on Mars by 2030?",
    description: "Resolves YES if SpaceX successfully lands at least one human on Mars before January 1, 2030.",
    category: "Science",
    marketType: "binary",
    yesPrice: 0.18,
    noPrice: 0.82,
    volume: 3200000,
    liquidity: 1100000,
    participants: 21050,
    endDate: "2030-01-01",
    creatorAddress: "0x9i0j...1k2l",
    creatorName: "SpaceWatcher",
    imageUrl: "/images/market-spacex.jpg",
    trending: false,
    createdAt: "2026-01-15T06:00:00Z",
  },
  {
    id: "8",
    title: "What will BTC price be on Jan 1, 2027?",
    description: "Resolves to the price bracket that BTC/USD falls into at midnight UTC on January 1, 2027.",
    category: "Crypto",
    marketType: "range",
    yesPrice: 0,
    noPrice: 0,
    options: [
      { id: "8a", label: "< $50K", price: 0.05, sortOrder: 0 },
      { id: "8b", label: "$50K – $100K", price: 0.25, sortOrder: 1 },
      { id: "8c", label: "$100K – $150K", price: 0.35, sortOrder: 2 },
      { id: "8d", label: "$150K – $200K", price: 0.22, sortOrder: 3 },
      { id: "8e", label: "> $200K", price: 0.13, sortOrder: 4 },
    ],
    volume: 6700000,
    liquidity: 2800000,
    participants: 38100,
    endDate: "2027-01-01",
    creatorAddress: "0xef56...gh78",
    creatorName: "RangeTrader",
    imageUrl: "/images/market-btcprice.jpg",
    trending: true,
    createdAt: "2026-03-01T14:00:00Z",
  },
  {
    id: "4",
    title: "Will the US enter a recession in 2026?",
    description: "Resolves YES if the NBER officially declares a US recession starting in 2026.",
    category: "Economy",
    marketType: "binary",
    yesPrice: 0.34,
    noPrice: 0.66,
    volume: 5100000,
    liquidity: 1800000,
    participants: 34200,
    endDate: "2027-03-01",
    creatorAddress: "0x3m4n...5o6p",
    creatorName: "MacroTrader",
    imageUrl: "/images/market-economy.jpg",
    trending: true,
    createdAt: "2026-02-20T09:00:00Z",
  },
  {
    id: "9",
    title: "Next US President's party?",
    description: "Resolves to the party of the winner of the 2028 US Presidential Election.",
    category: "Politics",
    marketType: "multi",
    yesPrice: 0,
    noPrice: 0,
    options: [
      { id: "9a", label: "Democrat", price: 0.42, sortOrder: 0 },
      { id: "9b", label: "Republican", price: 0.45, sortOrder: 1 },
      { id: "9c", label: "Independent", price: 0.08, sortOrder: 2 },
      { id: "9d", label: "Other", price: 0.05, sortOrder: 3 },
    ],
    volume: 12400000,
    liquidity: 5600000,
    participants: 67800,
    endDate: "2028-11-05",
    creatorAddress: "0xij90...kl12",
    creatorName: "PollWatcher",
    imageUrl: "/images/market-politics.jpg",
    trending: true,
    createdAt: "2026-02-25T16:00:00Z",
  },
  {
    id: "5",
    title: "Will Taylor Swift announce a new album before September?",
    description: "Resolves YES if Taylor Swift officially announces a new studio album before September 1, 2026.",
    category: "Entertainment",
    marketType: "binary",
    yesPrice: 0.78,
    noPrice: 0.22,
    volume: 920000,
    liquidity: 340000,
    participants: 15600,
    endDate: "2026-09-01",
    creatorAddress: "0x7q8r...9s0t",
    creatorName: "PopCulture",
    imageUrl: "/images/market-taylor.jpg",
    trending: false,
    createdAt: "2026-02-10T11:00:00Z",
  },
  {
    id: "6",
    title: "Will Ethereum flip Bitcoin in market cap by 2027?",
    description: "Resolves YES if Ethereum's market cap surpasses Bitcoin's at any point before January 1, 2027.",
    category: "Crypto",
    marketType: "binary",
    yesPrice: 0.12,
    noPrice: 0.88,
    volume: 4700000,
    liquidity: 2100000,
    participants: 28900,
    endDate: "2027-01-01",
    creatorAddress: "0xuv1w...2x3y",
    creatorName: "DeFiDegen",
    imageUrl: "/images/market-eth.jpg",
    trending: true,
    createdAt: "2026-03-04T07:00:00Z",
  },
];

export const categoryColors: Record<string, string> = {
  Crypto: "from-amber-500/20 to-orange-600/20",
  "AI & Tech": "from-blue-500/20 to-cyan-500/20",
  Science: "from-purple-500/20 to-pink-500/20",
  Economy: "from-emerald-500/20 to-teal-500/20",
  Entertainment: "from-rose-500/20 to-fuchsia-500/20",
  Sports: "from-green-500/20 to-emerald-500/20",
  Politics: "from-indigo-500/20 to-violet-500/20",
};

// categoryIcons moved to src/components/CategoryIcon.tsx as Lucide components
