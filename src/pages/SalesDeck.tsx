import { useRef, useState } from "react";
import { Printer, ArrowLeft, Share2, Copy, Check } from "lucide-react";
import opollLogo from "@/assets/logo.png";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { getCanonicalOrigin } from "@/lib/canonical";

const slides = [
  // Slide 1 — Hero
  {
    bg: "from-[hsl(220,20%,6%)] via-[hsl(193,50%,10%)] to-[hsl(220,20%,6%)]",
    content: (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8 sm:px-16">
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-br from-[hsl(193,98%,50%)] to-[hsl(193,80%,30%)] flex items-center justify-center mb-5 shadow-2xl shadow-[hsl(193,98%,50%)/0.3]">
          <span className="text-3xl sm:text-4xl font-black text-white tracking-tighter">oP</span>
        </div>
        <h1 className="text-3xl sm:text-6xl font-black text-white mb-2 tracking-tight leading-none">oPoll Market</h1>
        <p className="text-lg sm:text-2xl text-[hsl(193,98%,50%)] font-semibold mb-3">Turn Your Predictions Into Profits</p>
        <p className="text-sm sm:text-lg text-white/50 max-w-lg">The smartest way to bet on real-world events — crypto, sports, politics, entertainment & more.</p>
        <div className="mt-8 px-6 py-2.5 rounded-full bg-[hsl(193,98%,50%)] text-[hsl(220,20%,6%)] font-bold text-sm sm:text-base">
          Join Free Today →
        </div>
      </div>
    ),
  },
  // Slide 2 — What is it
  {
    bg: "from-[hsl(220,20%,8%)] to-[hsl(220,20%,12%)]",
    content: (
      <div className="flex flex-col justify-center h-full px-6 py-8 sm:px-16">
        <p className="text-xs font-bold text-[hsl(193,98%,50%)] uppercase tracking-widest mb-3">What Is oPoll Market?</p>
        <h2 className="text-2xl sm:text-4xl font-black text-white mb-6 leading-tight">Predict outcomes.<br/>Buy shares. Win big.</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {[
            { step: "1", emoji: "🔍", title: "Pick a Market", desc: "Browse hundreds of prediction markets on trending topics — from BTC price to election results." },
            { step: "2", emoji: "💰", title: "Place Your Prediction", desc: "Buy YES or NO shares at dynamic prices. The earlier you're right, the bigger your profit." },
            { step: "3", emoji: "🎉", title: "Cash Out", desc: "When the event resolves, winning shares pay out $1 each. Withdraw your profits in crypto." },
          ].map((item, i) => (
            <div key={i} className="bg-white/5 rounded-2xl p-5 border border-white/10 text-center">
              <span className="text-3xl mb-2 block">{item.emoji}</span>
              <div className="w-7 h-7 rounded-full bg-[hsl(193,98%,50%)]/20 text-[hsl(193,98%,50%)] font-black text-xs flex items-center justify-center mx-auto mb-2">{item.step}</div>
              <h3 className="text-base font-bold text-white mb-1">{item.title}</h3>
              <p className="text-xs text-white/50 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  // Slide 3 — Why oPoll
  {
    bg: "from-[hsl(193,40%,6%)] via-[hsl(220,20%,10%)] to-[hsl(220,20%,8%)]",
    content: (
      <div className="flex flex-col justify-center h-full px-6 py-8 sm:px-16">
        <p className="text-xs font-bold text-[hsl(145,80%,42%)] uppercase tracking-widest mb-3">Why oPoll Market?</p>
        <h2 className="text-2xl sm:text-4xl font-black text-white mb-6 leading-tight">Not just another<br/>betting app</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: "🎯", title: "Smart Markets", desc: "AI-powered markets on everything that matters — updated in real-time." },
            { icon: "⚡", title: "Quick Trade", desc: "30-second rounds. Predict if prices go UP or DOWN. Win instantly." },
            { icon: "👥", title: "Copy Top Traders", desc: "Follow winning traders and auto-copy their moves. Learn while you earn." },
            { icon: "🏆", title: "Climb Rankings", desc: "Compete on leaderboards. Build your reputation. Become the best." },
            { icon: "💸", title: "Crypto Payouts", desc: "Deposit and withdraw in crypto. No banks, no delays." },
            { icon: "📱", title: "Mobile-First", desc: "Install as an app on your phone. Trade anywhere, anytime." },
          ].map((item, i) => (
            <div key={i} className="bg-white/[0.04] rounded-xl p-4 border border-white/[0.07]">
              <span className="text-xl mb-1.5 block">{item.icon}</span>
              <h3 className="text-xs font-bold text-white mb-0.5">{item.title}</h3>
              <p className="text-[10px] sm:text-xs text-white/50 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  // Slide 4 — Quick Trade
  {
    bg: "from-[hsl(220,20%,8%)] to-[hsl(220,25%,12%)]",
    content: (
      <div className="flex flex-col justify-center h-full px-6 py-8 sm:px-16">
        <p className="text-xs font-bold text-[hsl(193,98%,50%)] uppercase tracking-widest mb-3">Fan Favorite</p>
        <h2 className="text-2xl sm:text-4xl font-black text-white mb-3 leading-tight">Quick Trade ⚡</h2>
        <p className="text-sm text-white/50 mb-6 max-w-lg">The most addictive feature. Predict price direction in 30-second rounds.</p>
        <div className="grid grid-cols-3 gap-3 sm:gap-6">
          <div className="bg-gradient-to-br from-[hsl(145,80%,42%)]/20 to-[hsl(145,80%,42%)]/5 rounded-2xl p-5 sm:p-8 border border-[hsl(145,80%,42%)]/20 text-center">
            <p className="text-3xl sm:text-5xl font-black text-[hsl(145,80%,42%)] mb-1">↑</p>
            <p className="text-base sm:text-xl font-bold text-white mb-0.5">UP</p>
            <p className="text-[10px] sm:text-sm text-white/50">Price goes higher</p>
          </div>
          <div className="flex flex-col items-center justify-center text-center">
            <p className="text-3xl sm:text-5xl font-black text-[hsl(193,98%,50%)] mb-1">30s</p>
            <p className="text-[10px] sm:text-sm text-white/40">Per round</p>
            <div className="mt-3 space-y-1.5 text-left">
              <p className="text-[10px] sm:text-xs text-white/60">🔥 2 wins = <span className="text-[hsl(193,98%,50%)] font-bold">2x</span></p>
              <p className="text-[10px] sm:text-xs text-white/60">🔥 3 wins = <span className="text-[hsl(193,98%,50%)] font-bold">3x</span></p>
              <p className="text-[10px] sm:text-xs text-white/60">🔥 5 wins = <span className="text-[hsl(193,98%,50%)] font-bold">5x</span></p>
            </div>
          </div>
          <div className="bg-gradient-to-br from-[hsl(0,85%,55%)]/20 to-[hsl(0,85%,55%)]/5 rounded-2xl p-5 sm:p-8 border border-[hsl(0,85%,55%)]/20 text-center">
            <p className="text-3xl sm:text-5xl font-black text-[hsl(0,85%,55%)] mb-1">↓</p>
            <p className="text-base sm:text-xl font-bold text-white mb-0.5">DOWN</p>
            <p className="text-[10px] sm:text-sm text-white/50">Price goes lower</p>
          </div>
        </div>
      </div>
    ),
  },
  // Slide 5 — Earn
  {
    bg: "from-[hsl(220,20%,8%)] via-[hsl(145,30%,8%)] to-[hsl(220,20%,10%)]",
    content: (
      <div className="flex flex-col justify-center h-full px-6 py-8 sm:px-16">
        <p className="text-xs font-bold text-[hsl(145,80%,42%)] uppercase tracking-widest mb-3">Earn Money</p>
        <h2 className="text-2xl sm:text-4xl font-black text-white mb-6 leading-tight">Multiple ways<br/>to earn 💰</h2>
        <div className="space-y-3">
          {[
            { icon: "🎯", title: "Win Predictions", desc: "Buy shares at low prices, earn $1 per share when you're right.", tag: "TRADING" },
            { icon: "⚡", title: "Quick Trade Streaks", desc: "Build winning streaks for up to 5x multiplier on your trades.", tag: "GAMING" },
            { icon: "👥", title: "Copy Trade Commissions", desc: "Let others copy your trades and earn a commission on profits.", tag: "PASSIVE" },
            { icon: "🔗", title: "Refer Friends", desc: "Share your referral link and earn bonus when friends trade.", tag: "REFERRAL" },
            { icon: "🏪", title: "Create Markets", desc: "Launch prediction markets and earn creator fees on every trade.", tag: "CREATOR" },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 bg-white/[0.04] rounded-xl p-3 sm:p-4 border border-white/[0.07]">
              <span className="text-2xl shrink-0">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-xs sm:text-sm font-bold text-white">{item.title}</h3>
                  <span className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider bg-[hsl(193,98%,50%)]/15 text-[hsl(193,98%,50%)] px-1.5 py-0.5 rounded-full">{item.tag}</span>
                </div>
                <p className="text-[10px] sm:text-xs text-white/50">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  // Slide 6 — Social Proof
  {
    bg: "from-[hsl(220,20%,8%)] to-[hsl(220,20%,12%)]",
    content: (
      <div className="flex flex-col justify-center h-full px-6 py-8 sm:px-16">
        <p className="text-xs font-bold text-[hsl(193,98%,50%)] uppercase tracking-widest mb-3">Community</p>
        <h2 className="text-2xl sm:text-4xl font-black text-white mb-6 leading-tight">Join a thriving<br/>community of traders</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { value: "🌍", label: "Global Community", sub: "Traders worldwide" },
            { value: "24/7", label: "Always Open", sub: "Markets never sleep" },
            { value: "📊", label: "Live Rankings", sub: "Prove your skill" },
            { value: "🤝", label: "Social Trading", sub: "Follow the best" },
          ].map((item, i) => (
            <div key={i} className="bg-white/5 rounded-2xl p-4 border border-white/10 text-center">
              <p className="text-2xl mb-1">{item.value}</p>
              <p className="text-xs font-bold text-white">{item.label}</p>
              <p className="text-[10px] text-white/40">{item.sub}</p>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {[
            { quote: "Quick Trade is insanely fun — I'm hooked on building streaks!", name: "Crypto Trader" },
            { quote: "I made 5x on my first prediction market. This platform is legit.", name: "Sports Fan" },
            { quote: "Copy trading changed the game for me. I earn while I learn.", name: "New Predictor" },
          ].map((t, i) => (
            <div key={i} className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
              <p className="text-xs text-white/70 italic mb-1">"{t.quote}"</p>
              <p className="text-[10px] text-[hsl(193,98%,50%)] font-semibold">— {t.name}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  // Slide 7 — Getting Started
  {
    bg: "from-[hsl(193,50%,8%)] to-[hsl(220,20%,8%)]",
    content: (
      <div className="flex flex-col justify-center h-full px-6 py-8 sm:px-16">
        <p className="text-xs font-bold text-[hsl(193,98%,50%)] uppercase tracking-widest mb-3">Get Started</p>
        <h2 className="text-2xl sm:text-4xl font-black text-white mb-6 leading-tight">Start in under<br/>2 minutes ⏱️</h2>
        <div className="space-y-4">
          {[
            { step: "1", title: "Sign Up Free", desc: "Create your account with just an email. No credit card needed.", color: "from-[hsl(193,98%,50%)] to-[hsl(193,80%,35%)]" },
            { step: "2", title: "Deposit Crypto", desc: "Fund your account with USDT, USDC, or DAI across multiple networks.", color: "from-[hsl(145,80%,42%)] to-[hsl(145,60%,30%)]" },
            { step: "3", title: "Start Predicting", desc: "Browse markets, place predictions, and start earning.", color: "from-[hsl(280,80%,55%)] to-[hsl(280,60%,40%)]" },
            { step: "4", title: "Withdraw Profits", desc: "Cash out winnings directly to your crypto wallet anytime.", color: "from-[hsl(30,90%,50%)] to-[hsl(30,70%,35%)]" },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className={`w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center shrink-0 shadow-lg`}>
                <span className="text-lg sm:text-2xl font-black text-white">{item.step}</span>
              </div>
              <div>
                <h3 className="text-sm sm:text-lg font-bold text-white mb-0.5">{item.title}</h3>
                <p className="text-xs sm:text-sm text-white/50">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  // Slide 8 — CTA
  {
    bg: "from-[hsl(220,20%,6%)] via-[hsl(193,60%,12%)] to-[hsl(220,20%,6%)]",
    content: (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8 sm:px-16">
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-[hsl(193,98%,50%)] to-[hsl(193,80%,30%)] flex items-center justify-center mb-5 shadow-2xl shadow-[hsl(193,98%,50%)/0.4]">
          <span className="text-2xl sm:text-3xl font-black text-white">oP</span>
        </div>
        <h2 className="text-3xl sm:text-5xl font-black text-white mb-3 leading-tight">Ready to predict<br/>the future?</h2>
        <p className="text-sm sm:text-xl text-white/50 max-w-xl mb-6">Join thousands of traders already earning on oPoll Market. Sign up takes 30 seconds.</p>
        <div className="px-8 py-3 rounded-full bg-[hsl(193,98%,50%)] text-[hsl(220,20%,6%)] font-bold text-sm sm:text-lg shadow-xl shadow-[hsl(193,98%,50%)/0.3]">
          🚀 Start Predicting Now
        </div>
        <div className="mt-8 space-y-1 text-white/30 text-[10px] sm:text-xs">
          <p>No minimum deposit • Instant signup • Crypto-powered</p>
          <p>opoll.org</p>
        </div>
      </div>
    ),
  },
];

const SalesDeck = () => {
  const navigate = useNavigate();
  const deckRef = useRef<HTMLDivElement>(null);
  const { displayName } = useAuth();
  const [copied, setCopied] = useState(false);

  const handlePrint = () => window.print();

  const getShareUrl = () => {
    const base = `${getCanonicalOrigin()}/auth`;
    return displayName ? `${base}?ref=${encodeURIComponent(displayName)}` : base;
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(getShareUrl());
    setCopied(true);
    toast.success("Link copied with your referral code!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    const text = `🔥 Check out oPoll Market — predict real-world events and win! Join here: ${getShareUrl()}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handleTelegram = () => {
    const text = `🔥 Check out oPoll Market — predict real-world events and win!`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(getShareUrl())}&text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #sales-deck, #sales-deck * { visibility: visible !important; }
          #sales-deck { position: absolute; left: 0; top: 0; width: 100%; }
          .deck-controls, .top-bar-wrapper, .bottom-nav-wrapper { display: none !important; }
          .deck-slide {
            page-break-after: always;
            page-break-inside: avoid;
            height: 100vh !important;
            width: 100vw !important;
            margin: 0 !important;
            border-radius: 0 !important;
            border: none !important;
          }
          @page { size: landscape; margin: 0; }
        }
      `}</style>

      <div className="top-bar-wrapper"><TopBar /></div>

      <div className="min-h-screen bg-background px-3 sm:px-4 pt-20 pb-24">
        {/* Controls */}
        <div className="deck-controls max-w-4xl mx-auto flex items-center justify-between mb-4 gap-3">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold">Sales Deck</h2>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Share with potential predictors</p>
          </div>
          <div className="flex gap-1.5 sm:gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => navigate("/profile")} className="h-8 px-2.5 sm:px-3 text-xs">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
            </Button>
            <Button size="sm" onClick={handlePrint} className="gap-1 h-8 px-2.5 sm:px-3 text-xs">
              <Printer className="w-3.5 h-3.5" /> PDF
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="gap-1 h-8 px-2.5 sm:px-3 text-xs">
                  <Share2 className="w-3.5 h-3.5" /> Share
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleCopyLink} className="gap-2">
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied!" : "Copy Link"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleWhatsApp} className="gap-2">
                  <span className="text-sm">💬</span> WhatsApp
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleTelegram} className="gap-2">
                  <span className="text-sm">✈️</span> Telegram
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Deck */}
        <div id="sales-deck" ref={deckRef} className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
          {slides.map((slide, i) => (
            <div
              key={i}
              className={`deck-slide bg-gradient-to-br ${slide.bg} rounded-2xl border border-white/10 overflow-hidden shadow-2xl min-h-[420px] sm:min-h-0`}
              style={{ aspectRatio: window.innerWidth >= 640 ? "16/9" : undefined }}
            >
              {slide.content}
            </div>
          ))}
        </div>
      </div>

      <div className="bottom-nav-wrapper"><BottomNav /></div>
    </>
  );
};

export default SalesDeck;
