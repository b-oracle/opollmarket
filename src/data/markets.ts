export interface Market {
  id: string;
  title: string;
  description: string;
  category: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity: number;
  participants: number;
  endDate: string;
  creatorAddress: string;
  creatorName: string;
  imageUrl: string;
  trending: boolean;
}

export const mockMarkets: Market[] = [
  {
    id: "1",
    title: "Will Bitcoin hit $150K before July 2026?",
    description: "Resolves YES if BTC/USD reaches $150,000 on any major exchange before July 1, 2026.",
    category: "Crypto",
    yesPrice: 0.62,
    noPrice: 0.38,
    volume: 2450000,
    liquidity: 890000,
    participants: 12847,
    endDate: "2026-07-01",
    creatorAddress: "0x1a2b...3c4d",
    creatorName: "CryptoOracle",
    imageUrl: "",
    trending: true,
  },
  {
    id: "2",
    title: "Will AI pass the Turing Test by end of 2026?",
    description: "Resolves YES if a publicly available AI system passes a formal Turing Test judged by a panel of experts.",
    category: "AI & Tech",
    yesPrice: 0.45,
    noPrice: 0.55,
    volume: 1870000,
    liquidity: 620000,
    participants: 9234,
    endDate: "2026-12-31",
    creatorAddress: "0x5e6f...7g8h",
    creatorName: "TechFuturist",
    imageUrl: "",
    trending: true,
  },
  {
    id: "3",
    title: "Will SpaceX land humans on Mars by 2030?",
    description: "Resolves YES if SpaceX successfully lands at least one human on Mars before January 1, 2030.",
    category: "Science",
    yesPrice: 0.18,
    noPrice: 0.82,
    volume: 3200000,
    liquidity: 1100000,
    participants: 21050,
    endDate: "2030-01-01",
    creatorAddress: "0x9i0j...1k2l",
    creatorName: "SpaceWatcher",
    imageUrl: "",
    trending: false,
  },
  {
    id: "4",
    title: "Will the US enter a recession in 2026?",
    description: "Resolves YES if the NBER officially declares a US recession starting in 2026.",
    category: "Economy",
    yesPrice: 0.34,
    noPrice: 0.66,
    volume: 5100000,
    liquidity: 1800000,
    participants: 34200,
    endDate: "2027-03-01",
    creatorAddress: "0x3m4n...5o6p",
    creatorName: "MacroTrader",
    imageUrl: "",
    trending: true,
  },
  {
    id: "5",
    title: "Will Taylor Swift announce a new album before September?",
    description: "Resolves YES if Taylor Swift officially announces a new studio album before September 1, 2026.",
    category: "Entertainment",
    yesPrice: 0.78,
    noPrice: 0.22,
    volume: 920000,
    liquidity: 340000,
    participants: 15600,
    endDate: "2026-09-01",
    creatorAddress: "0x7q8r...9s0t",
    creatorName: "PopCulture",
    imageUrl: "",
    trending: false,
  },
  {
    id: "6",
    title: "Will Ethereum flip Bitcoin in market cap by 2027?",
    description: "Resolves YES if Ethereum's market cap surpasses Bitcoin's at any point before January 1, 2027.",
    category: "Crypto",
    yesPrice: 0.12,
    noPrice: 0.88,
    volume: 4700000,
    liquidity: 2100000,
    participants: 28900,
    endDate: "2027-01-01",
    creatorAddress: "0xuv1w...2x3y",
    creatorName: "DeFiDegen",
    imageUrl: "",
    trending: true,
  },
];

export const categoryColors: Record<string, string> = {
  Crypto: "from-amber-500/20 to-orange-600/20",
  "AI & Tech": "from-blue-500/20 to-cyan-500/20",
  Science: "from-purple-500/20 to-pink-500/20",
  Economy: "from-emerald-500/20 to-teal-500/20",
  Entertainment: "from-rose-500/20 to-fuchsia-500/20",
};

export const categoryIcons: Record<string, string> = {
  Crypto: "₿",
  "AI & Tech": "🤖",
  Science: "🚀",
  Economy: "📈",
  Entertainment: "🎵",
};
