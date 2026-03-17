import { useRef } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import opollLogo from "@/assets/logo.png";

/* ───────────────────────────── slide data ───────────────────────────── */

const slides = [
  // 1 — Title
  {
    bg: "from-[hsl(220,20%,6%)] via-[hsl(193,50%,10%)] to-[hsl(220,20%,6%)]",
    content: (
      <div className="flex flex-col items-center justify-center h-full text-center px-4 py-4 sm:px-10 sm:py-6">
        <div className="w-12 h-12 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-[hsl(193,98%,50%)] to-[hsl(193,80%,30%)] flex items-center justify-center mb-3 sm:mb-5 shadow-2xl shadow-[hsl(193,98%,50%)/0.3] p-2 sm:p-2.5">
          <img src={opollLogo} alt="OPoll" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-xl sm:text-4xl lg:text-5xl font-black text-white mb-1.5 tracking-tight leading-none">OPoll Market</h1>
        <p className="text-sm sm:text-lg lg:text-xl text-[hsl(193,98%,50%)] font-semibold mb-1.5 sm:mb-2">Predict. Trade. Win.</p>
        <p className="text-[9px] sm:text-sm lg:text-base text-white/50 max-w-xl leading-relaxed">The next-generation prediction market platform powering decentralized forecasting for crypto, sports, politics, and more.</p>
        <div className="mt-4 sm:mt-8 flex items-center gap-2 text-[8px] sm:text-xs text-white/30">
          <span>Investor Presentation</span>
          <span>•</span>
          <span>{new Date().getFullYear()}</span>
        </div>
      </div>
    ),
  },
  // 2 — Problem
  {
    bg: "from-[hsl(220,20%,8%)] to-[hsl(220,20%,14%)]",
    content: (
      <div className="flex flex-col justify-center h-full px-4 py-4 sm:px-10 sm:py-6">
        <p className="text-[8px] sm:text-[10px] font-bold text-[hsl(0,85%,55%)] uppercase tracking-widest mb-1.5 sm:mb-2">The Problem</p>
        <h2 className="text-lg sm:text-2xl lg:text-3xl font-black text-white mb-3 sm:mb-6 leading-tight">Markets lack efficient<br className="hidden sm:block" /> price discovery for<br className="hidden sm:block" /> future events</h2>
        <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:gap-5">
          {[
            { num: "$1.4T", label: "Sports betting market largely centralized with opaque odds" },
            { num: "72%", label: "Of retail traders lack access to event-based trading instruments" },
            { num: "0", label: "Platforms combining social, AI, and prediction markets seamlessly" },
          ].map((item, i) => (
            <div key={i} className="bg-white/5 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 border border-white/10">
              <p className="text-base sm:text-xl lg:text-2xl font-black text-[hsl(193,98%,50%)] mb-0.5">{item.num}</p>
              <p className="text-[8px] sm:text-[10px] lg:text-xs text-white/60 leading-snug">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  // 3 — Solution
  {
    bg: "from-[hsl(193,40%,6%)] via-[hsl(220,20%,10%)] to-[hsl(220,20%,8%)]",
    content: (
      <div className="flex flex-col justify-center h-full px-4 py-4 sm:px-10 sm:py-6">
        <p className="text-[8px] sm:text-[10px] font-bold text-[hsl(193,98%,50%)] uppercase tracking-widest mb-1 sm:mb-2">Our Solution</p>
        <h2 className="text-lg sm:text-2xl lg:text-3xl font-black text-white mb-3 sm:mb-4 leading-tight">A complete prediction<br className="hidden sm:block" /> market ecosystem</h2>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:gap-4">
          {[
            { icon: "🎯", title: "Binary & Multi-Outcome Markets", desc: "Create markets on anything — crypto prices, elections, sports, pop culture." },
            { icon: "⚡", title: "Quick Trade", desc: "30-second price prediction rounds with streaks and multipliers. Gamified." },
            { icon: "🤖", title: "AI-Powered Creation", desc: "Auto-generate market descriptions, details, and cover images using AI." },
            { icon: "👥", title: "Social & Copy Trading", desc: "Follow top traders, copy their positions, and earn commissions." },
          ].map((item, i) => (
            <div key={i} className="bg-white/5 rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-white/10">
              <span className="text-lg sm:text-2xl mb-1 sm:mb-2 block">{item.icon}</span>
              <h3 className="text-[10px] sm:text-sm lg:text-base font-bold text-white mb-0.5">{item.title}</h3>
              <p className="text-[8px] sm:text-[10px] lg:text-xs text-white/60 leading-snug">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  // 4 — Market Opportunity
  {
    bg: "from-[hsl(220,20%,8%)] to-[hsl(220,25%,12%)]",
    content: (
      <div className="flex flex-col justify-center h-full px-4 py-4 sm:px-10 sm:py-6">
        <p className="text-[8px] sm:text-[10px] font-bold text-[hsl(145,80%,42%)] uppercase tracking-widest mb-1 sm:mb-2">Market Opportunity</p>
        <h2 className="text-lg sm:text-2xl lg:text-3xl font-black text-white mb-3 sm:mb-4 leading-tight">Massive & growing<br className="hidden sm:block" /> addressable market</h2>
        <div className="flex items-end gap-2 sm:gap-5 lg:gap-6 mb-3 sm:mb-4">
          {[
            { size: "h-14 sm:h-24 lg:h-28", value: "$65B", label: "TAM", sub: "Global prediction & betting" },
            { size: "h-20 sm:h-32 lg:h-40", value: "$12B", label: "SAM", sub: "Online prediction markets" },
            { size: "h-28 sm:h-44 lg:h-52", value: "$2.5B", label: "SOM", sub: "Crypto-native users" },
          ].map((item, i) => (
            <div key={i} className="flex-1 flex flex-col items-center">
              <div className={`${item.size} w-full rounded-lg sm:rounded-2xl bg-gradient-to-t from-[hsl(193,98%,50%)] to-[hsl(193,80%,35%)] flex items-end justify-center pb-1.5 sm:pb-2 shadow-lg`}>
                <span className="text-xs sm:text-lg lg:text-xl font-black text-white">{item.value}</span>
              </div>
              <p className="text-[9px] sm:text-xs lg:text-sm font-bold text-white mt-1">{item.label}</p>
              <p className="text-[7px] sm:text-[9px] lg:text-[10px] text-white/50 text-center">{item.sub}</p>
            </div>
          ))}
        </div>
        <div className="bg-white/5 rounded-lg sm:rounded-xl p-2 sm:p-2.5 border border-white/10">
          <p className="text-[8px] sm:text-[10px] lg:text-xs text-white/60">📈 The prediction market industry is projected to grow at <span className="text-[hsl(193,98%,50%)] font-bold">35% CAGR</span> through 2030, driven by crypto adoption and demand for event-based trading.</p>
        </div>
      </div>
    ),
  },
  // 5 — Product Features
  {
    bg: "from-[hsl(220,20%,8%)] via-[hsl(193,40%,8%)] to-[hsl(220,20%,10%)]",
    content: (
      <div className="flex flex-col justify-center h-full px-4 py-4 sm:px-10 sm:py-6">
        <p className="text-[8px] sm:text-[10px] font-bold text-[hsl(193,98%,50%)] uppercase tracking-widest mb-1 sm:mb-2">Platform Features</p>
        <h2 className="text-lg sm:text-2xl font-black text-white mb-2 sm:mb-3 leading-tight">Everything you need.<br className="hidden sm:block" /> Nothing you don't.</h2>
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 lg:gap-3">
          {[
            { icon: "📊", title: "Order Book & Limits", desc: "Professional-grade trading" },
            { icon: "🔔", title: "Push Notifications", desc: "Real-time alerts via web & Telegram" },
            { icon: "🏆", title: "Leaderboards", desc: "Compete for top trader status" },
            { icon: "💰", title: "Deposit & Withdraw", desc: "Crypto on/off ramp" },
            { icon: "🛡️", title: "2FA Security", desc: "PIN + TOTP authentication" },
            { icon: "🎨", title: "AI Image Gen", desc: "Auto-generate market cover art" },
            { icon: "📱", title: "PWA Mobile App", desc: "Install on any device" },
            { icon: "🔗", title: "Wallet Connect", desc: "Web3 wallet integration" },
            { icon: "🚀", title: "Market Boosts", desc: "Paid promotion visibility" },
          ].map((item, i) => (
            <div key={i} className="bg-white/[0.03] rounded-lg sm:rounded-xl p-2 sm:p-3 lg:p-4 border border-white/[0.06]">
              <span className="text-sm sm:text-lg lg:text-xl mb-0.5 sm:mb-1 block">{item.icon}</span>
              <h3 className="text-[8px] sm:text-[10px] lg:text-xs font-bold text-white">{item.title}</h3>
              <p className="text-[7px] sm:text-[9px] lg:text-[10px] text-white/50 hidden sm:block leading-tight">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  // 6 — Business Model
  {
    bg: "from-[hsl(220,20%,8%)] to-[hsl(220,20%,12%)]",
    content: (
      <div className="flex flex-col justify-center h-full px-4 py-4 sm:px-10 sm:py-6">
        <p className="text-[8px] sm:text-[10px] font-bold text-[hsl(145,80%,42%)] uppercase tracking-widest mb-1 sm:mb-2">Business Model</p>
        <h2 className="text-lg sm:text-2xl lg:text-3xl font-black text-white mb-3 sm:mb-4 leading-tight">Multiple revenue<br className="hidden sm:block" /> streams</h2>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:gap-4">
          {[
            { icon: "💸", title: "Trading Fees", desc: "Admin + creator fee split on every trade. Configurable commission rates.", pct: "3–10%" },
            { icon: "⚡", title: "Quick Trade Rake", desc: "Platform fee on every 30s prediction round. High frequency = high volume.", pct: "5%" },
            { icon: "🔥", title: "Market Boosts", desc: "Creators pay to boost markets to the homepage carousel. Crypto payments.", pct: "Pay-per-boost" },
            { icon: "🏧", title: "Withdrawal Fees", desc: "Percentage-based fee on all crypto withdrawals. Configurable by admin.", pct: "1–3%" },
          ].map((item, i) => (
            <div key={i} className="bg-white/5 rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-white/10 relative overflow-hidden">
              <div className="absolute top-1.5 right-1.5 sm:top-2.5 sm:right-2.5 bg-[hsl(193,98%,50%)]/20 text-[hsl(193,98%,50%)] text-[7px] sm:text-[9px] lg:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full">{item.pct}</div>
              <span className="text-lg sm:text-2xl mb-1 sm:mb-1.5 block">{item.icon}</span>
              <h3 className="text-[10px] sm:text-sm lg:text-base font-bold text-white mb-0.5">{item.title}</h3>
              <p className="text-[8px] sm:text-[10px] lg:text-xs text-white/60 leading-snug">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  // 7 — Technology
  {
    bg: "from-[hsl(220,25%,10%)] to-[hsl(193,30%,8%)]",
    content: (
      <div className="flex flex-col justify-center h-full px-4 py-4 sm:px-10 sm:py-6">
        <p className="text-[8px] sm:text-[10px] font-bold text-[hsl(193,98%,50%)] uppercase tracking-widest mb-1 sm:mb-2">Technology</p>
        <h2 className="text-lg sm:text-2xl lg:text-3xl font-black text-white mb-3 sm:mb-4 leading-tight">Built for speed,<br className="hidden sm:block" /> scale & security</h2>
        <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:gap-6">
          <div className="space-y-1 sm:space-y-2">
            <h3 className="text-[10px] sm:text-sm lg:text-base font-bold text-white/80 mb-0.5">Frontend</h3>
            {["React 18 + TypeScript", "Tailwind CSS + Framer Motion", "PWA with push notifications", "Web3 wallet via WalletConnect"].map((t, i) => (
              <div key={i} className="flex items-center gap-1.5 sm:gap-2.5 bg-white/5 rounded-lg sm:rounded-xl px-2 sm:px-3 py-1 sm:py-2 border border-white/10">
                <div className="w-1.5 h-1.5 rounded-full bg-[hsl(193,98%,50%)] shrink-0" />
                <span className="text-[8px] sm:text-[10px] lg:text-xs text-white/80">{t}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1 sm:space-y-2">
            <h3 className="text-[10px] sm:text-sm lg:text-base font-bold text-white/80 mb-0.5">Backend</h3>
            {["Lovable Cloud (Postgres + Auth + Realtime)", "Edge Functions (Deno runtime)", "AI Gateway (Gemini / GPT)", "NOWPayments crypto gateway"].map((t, i) => (
              <div key={i} className="flex items-center gap-1.5 sm:gap-2.5 bg-white/5 rounded-lg sm:rounded-xl px-2 sm:px-3 py-1 sm:py-2 border border-white/10">
                <div className="w-1.5 h-1.5 rounded-full bg-[hsl(145,80%,42%)] shrink-0" />
                <span className="text-[8px] sm:text-[10px] lg:text-xs text-white/80">{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  // 8 — Competitive Advantage
  {
    bg: "from-[hsl(220,20%,8%)] to-[hsl(220,20%,12%)]",
    content: (
      <div className="flex flex-col justify-center h-full px-4 py-4 sm:px-10 sm:py-6">
        <p className="text-[8px] sm:text-[10px] font-bold text-[hsl(0,85%,55%)] uppercase tracking-widest mb-1 sm:mb-2">Why Us</p>
        <h2 className="text-lg sm:text-2xl lg:text-3xl font-black text-white mb-2 sm:mb-4 leading-tight">Unfair advantages</h2>
        <div className="space-y-1 sm:space-y-2">
          {[
            { title: "All-in-one platform", desc: "Predictions + Quick Trade + Social + Copy Trading in a single app." },
            { title: "AI-native creation", desc: "Markets created in seconds with AI-generated content. 10x faster." },
            { title: "Gamification engine", desc: "Streaks, leaderboards, milestones drive retention and engagement." },
            { title: "Full admin control", desc: "Enterprise-grade dashboard with moderation, analytics, and audit logs." },
            { title: "Mobile-first PWA", desc: "Native app experience without app store friction. One-tap install." },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2 sm:gap-3 bg-white/[0.03] rounded-lg sm:rounded-xl p-2 sm:p-3 lg:p-3.5 border border-white/[0.06]">
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-gradient-to-br from-[hsl(193,98%,50%)] to-[hsl(193,80%,35%)] flex items-center justify-center shrink-0 text-[10px] sm:text-sm font-black text-white">{i + 1}</div>
              <div className="min-w-0">
                <h3 className="text-[9px] sm:text-xs lg:text-sm font-bold text-white">{item.title}</h3>
                <p className="text-[8px] sm:text-[10px] lg:text-xs text-white/50 leading-snug">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  // 9 — Roadmap
  {
    bg: "from-[hsl(193,40%,6%)] to-[hsl(220,20%,10%)]",
    content: (
      <div className="flex flex-col justify-center h-full px-4 py-4 sm:px-10 sm:py-6">
        <p className="text-[8px] sm:text-[10px] font-bold text-[hsl(193,98%,50%)] uppercase tracking-widest mb-1 sm:mb-2">Roadmap</p>
        <h2 className="text-lg sm:text-2xl lg:text-3xl font-black text-white mb-2 sm:mb-4 leading-tight">What's next</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 lg:gap-3">
          {[
            { q: "Q1 2026", status: "✅ Done", items: ["Core platform launch", "Quick Trade engine", "AI market creation", "Referral system"] },
            { q: "Q2 2026", status: "🔨 Building", items: ["Mobile app (Capacitor)", "Polymarket import", "Sports auto-resolve", "Revenue share program"] },
            { q: "Q3 2026", status: "📋 Planned", items: ["Token launch", "On-chain settlement", "API for developers", "Multi-language support"] },
            { q: "Q4 2026", status: "🔮 Vision", items: ["Decentralized governance", "Cross-chain support", "Institutional accounts", "Market maker SDK"] },
          ].map((phase, i) => (
            <div key={i} className="bg-white/5 rounded-lg sm:rounded-2xl p-2.5 sm:p-4 border border-white/10 flex flex-col">
              <p className="text-[7px] sm:text-[9px] text-white/40 mb-0.5">{phase.status}</p>
              <p className="text-[10px] sm:text-sm lg:text-base font-bold text-[hsl(193,98%,50%)] mb-1 sm:mb-2">{phase.q}</p>
              <ul className="space-y-0.5 sm:space-y-1 flex-1">
                {phase.items.map((item, j) => (
                  <li key={j} className="text-[7px] sm:text-[10px] lg:text-xs text-white/60 flex items-start gap-1">
                    <span className="text-white/30 mt-0.5 shrink-0">•</span><span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  // 10 — The Ask
  {
    bg: "from-[hsl(220,20%,8%)] via-[hsl(193,50%,10%)] to-[hsl(220,20%,8%)]",
    content: (
      <div className="flex flex-col items-center justify-center h-full text-center px-4 py-4 sm:px-10 sm:py-6">
        <p className="text-[8px] sm:text-[10px] font-bold text-[hsl(193,98%,50%)] uppercase tracking-widest mb-2 sm:mb-3">The Ask</p>
        <h2 className="text-xl sm:text-3xl lg:text-4xl font-black text-white mb-1.5 sm:mb-3 leading-tight">Let's build the future<br className="hidden sm:block" /> of prediction markets</h2>
        <p className="text-[8px] sm:text-xs lg:text-sm text-white/60 max-w-2xl mb-3 sm:mb-5 leading-relaxed">Our product is 100% built and live. We're raising a seed round to secure licensing, scale operations, forge strategic partnerships, and accelerate marketing.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-3 max-w-3xl w-full mb-3 sm:mb-5">
          {[
            { label: "Raising", value: "$2M", sub: "Seed Round" },
            { label: "Licensing", value: "30%", sub: "Regulatory & compliance" },
            { label: "Growth", value: "40%", sub: "Marketing & partnerships" },
            { label: "Operations", value: "30%", sub: "Scaling & infrastructure" },
          ].map((item, i) => (
            <div key={i} className="bg-white/5 rounded-lg sm:rounded-2xl p-2 sm:p-4 border border-[hsl(193,98%,50%)]/20">
              <p className="text-[7px] sm:text-[9px] lg:text-[10px] text-white/40 uppercase tracking-wider mb-0.5">{item.label}</p>
              <p className="text-lg sm:text-2xl lg:text-3xl font-black text-[hsl(193,98%,50%)]">{item.value}</p>
              <p className="text-[7px] sm:text-[9px] lg:text-xs text-white/50">{item.sub}</p>
            </div>
          ))}
        </div>
        <div className="bg-[hsl(145,80%,42%)]/10 border border-[hsl(145,80%,42%)]/20 rounded-lg sm:rounded-xl px-3 py-1.5 sm:px-5 sm:py-2 mb-2 sm:mb-3">
          <p className="text-[8px] sm:text-[10px] lg:text-xs text-[hsl(145,80%,42%)] font-semibold">✅ Product 100% complete — Zero engineering risk</p>
        </div>
        <div className="text-white/40 text-[8px] sm:text-[10px] lg:text-xs">
          <p>📧 Contact: <span className="text-[hsl(193,98%,50%)]">invest@opollmarket.com</span></p>
        </div>
      </div>
    ),
  },
];

/* ───────────────────────────── component ───────────────────────────── */

const InvestorDeck = () => {
  const navigate = useNavigate();
  const deckRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #investor-deck, #investor-deck * { visibility: visible !important; }
          #investor-deck { position: absolute; left: 0; top: 0; width: 100%; }
          .deck-controls { display: none !important; }
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

      <div className="space-y-4 sm:space-y-6">
        {/* Controls */}
        <div className="deck-controls flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-2xl font-bold">Investor Deck</h2>
            <p className="text-[10px] sm:text-sm text-muted-foreground">10-slide pitch deck — print or save as PDF</p>
          </div>
          <div className="flex gap-1.5 sm:gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => navigate("/admin")} className="h-8 px-2.5 sm:px-3 text-xs">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
            </Button>
            <Button size="sm" onClick={() => window.print()} className="gap-1 h-8 px-2.5 sm:px-3 text-xs">
              <Printer className="w-3.5 h-3.5" /> Print / PDF
            </Button>
          </div>
        </div>

        {/* Deck */}
        <div id="investor-deck" ref={deckRef} className="space-y-4 sm:space-y-6">
          {slides.map((slide, i) => (
            <div
              key={i}
              className={`deck-slide bg-gradient-to-br ${slide.bg} rounded-2xl border border-white/10 overflow-hidden shadow-2xl`}
              style={{ aspectRatio: "16/9" }}
            >
              {slide.content}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default InvestorDeck;
