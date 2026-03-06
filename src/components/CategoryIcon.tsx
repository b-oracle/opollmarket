import { Bitcoin, Bot, Rocket, TrendingUp, Music, Trophy, Landmark, Lightbulb, BarChart3, ArrowLeftRight, type LucideIcon } from "lucide-react";

export const categoryIconMap: Record<string, LucideIcon> = {
  Crypto: Bitcoin,
  Commodities: BarChart3,
  Forex: ArrowLeftRight,
  "AI & Tech": Bot,
  Science: Rocket,
  Economy: TrendingUp,
  Entertainment: Music,
  Sports: Trophy,
  Politics: Landmark,
  Other: Lightbulb,
};

interface CategoryIconProps {
  category: string;
  className?: string;
}

const CategoryIcon = ({ category, className = "w-4 h-4" }: CategoryIconProps) => {
  const Icon = categoryIconMap[category] || Lightbulb;
  return <Icon className={className} />;
};

export default CategoryIcon;
