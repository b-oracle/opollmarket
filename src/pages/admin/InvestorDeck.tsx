import { useRef, useState, useEffect, useCallback } from "react";
import { ArrowLeft, Download, FileText, Presentation } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import opollLogo from "@/assets/logo.png";

/* ─── ScaledSlide: renders children at 1920×1080 and scales to fit parent ─── */

const SLIDE_W = 1920;
const SLIDE_H = 1080;

const ScaledSlide = ({ children, bg }: { children: React.ReactNode; bg: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);

  const recalc = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setScale(Math.min(width / SLIDE_W, height / SLIDE_H));
  }, []);

  useEffect(() => {
    recalc();
    const ro = new ResizeObserver(recalc);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [recalc]);

  return (
    <div
      ref={containerRef}
      className={`deck-slide bg-gradient-to-br ${bg} rounded-2xl border border-white/10 overflow-hidden shadow-2xl relative`}
      style={{ aspectRatio: "16/9" }}
    >
      <div
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
};

/* ───────────────────────────── slide data ───────────────────────────── */
/* All content is authored at 1920×1080. No responsive breakpoints needed. */

const slides = [
  // 1 — Title
  {
    bg: "from-[hsl(220,20%,6%)] via-[hsl(193,50%,10%)] to-[hsl(220,20%,6%)]",
    content: (
      <div className="flex flex-col items-center justify-center h-full text-center px-20">
        <div className="w-32 h-32 rounded-[2rem] bg-gradient-to-br from-[hsl(193,98%,50%)] to-[hsl(193,80%,30%)] flex items-center justify-center mb-10 shadow-2xl shadow-[hsl(193,98%,50%)/0.3] p-4">
          <img src={opollLogo} alt="OPoll" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-[80px] font-black text-white mb-4 tracking-tight leading-none">OPoll Market</h1>
        <p className="text-[32px] text-[hsl(193,98%,50%)] font-semibold mb-4">Predict. Trade. Win.</p>
        <p className="text-[22px] text-white/50 max-w-[900px] leading-relaxed">The next-generation prediction market platform powering decentralized forecasting for crypto, sports, politics, and more.</p>
        <div className="mt-16 flex items-center gap-4 text-[18px] text-white/30">
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
      <div className="flex flex-col justify-center h-full px-[100px] py-[80px]">
        <p className="text-[16px] font-bold text-[hsl(0,85%,55%)] uppercase tracking-[0.2em] mb-4">The Problem</p>
        <h2 className="text-[56px] font-black text-white mb-12 leading-[1.1]">Markets lack efficient<br /> price discovery for<br /> future events</h2>
        <div className="grid grid-cols-3 gap-8">
          {[
            { num: "$1.4T", label: "Sports betting market largely centralized with opaque odds" },
            { num: "72%", label: "Of retail traders lack access to event-based trading instruments" },
            { num: "0", label: "Platforms combining social, AI, and prediction markets seamlessly" },
          ].map((item, i) => (
            <div key={i} className="bg-white/5 rounded-3xl p-8 border border-white/10">
              <p className="text-[48px] font-black text-[hsl(193,98%,50%)] mb-2">{item.num}</p>
              <p className="text-[18px] text-white/60 leading-snug">{item.label}</p>
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
      <div className="flex flex-col justify-center h-full px-[100px] py-[80px]">
        <p className="text-[16px] font-bold text-[hsl(193,98%,50%)] uppercase tracking-[0.2em] mb-4">Our Solution</p>
        <h2 className="text-[52px] font-black text-white mb-10 leading-[1.1]">A complete prediction<br /> market ecosystem</h2>
        <div className="grid grid-cols-2 gap-8">
          {[
            { icon: "🎯", title: "Binary & Multi-Outcome Markets", desc: "Create markets on anything — crypto prices, elections, sports, pop culture." },
            { icon: "⚡", title: "Quick Trade", desc: "30-second price prediction rounds with streaks and multipliers. Gamified." },
            { icon: "🤖", title: "AI-Powered Creation", desc: "Auto-generate market descriptions, details, and cover images using AI." },
            { icon: "👥", title: "Social & Copy Trading", desc: "Follow top traders, copy their positions, and earn commissions." },
          ].map((item, i) => (
            <div key={i} className="bg-white/5 rounded-3xl p-10 border border-white/10">
              <span className="text-[48px] mb-3 block">{item.icon}</span>
              <h3 className="text-[24px] font-bold text-white mb-2">{item.title}</h3>
              <p className="text-[18px] text-white/60 leading-snug">{item.desc}</p>
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
      <div className="flex flex-col justify-center h-full px-[100px] py-[80px]">
        <p className="text-[16px] font-bold text-[hsl(145,80%,42%)] uppercase tracking-[0.2em] mb-4">Market Opportunity</p>
        <h2 className="text-[52px] font-black text-white mb-10 leading-[1.1]">Massive & growing<br /> addressable market</h2>
        <div className="flex items-end gap-10 mb-8">
          {[
            { h: 200, value: "$65B", label: "TAM", sub: "Global prediction & betting" },
            { h: 300, value: "$12B", label: "SAM", sub: "Online prediction markets" },
            { h: 420, value: "$2.5B", label: "SOM", sub: "Crypto-native users" },
          ].map((item, i) => (
            <div key={i} className="flex-1 flex flex-col items-center">
              <div
                className="w-full rounded-3xl bg-gradient-to-t from-[hsl(193,98%,50%)] to-[hsl(193,80%,35%)] flex items-end justify-center pb-4 shadow-lg"
                style={{ height: item.h }}
              >
                <span className="text-[32px] font-black text-white">{item.value}</span>
              </div>
              <p className="text-[20px] font-bold text-white mt-3">{item.label}</p>
              <p className="text-[16px] text-white/50 text-center">{item.sub}</p>
            </div>
          ))}
        </div>
        <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
          <p className="text-[18px] text-white/60">📈 The prediction market industry is projected to grow at <span className="text-[hsl(193,98%,50%)] font-bold">35% CAGR</span> through 2030, driven by crypto adoption and demand for event-based trading.</p>
        </div>
      </div>
    ),
  },
  // 5 — Product Features
  {
    bg: "from-[hsl(220,20%,8%)] via-[hsl(193,40%,8%)] to-[hsl(220,20%,10%)]",
    content: (
      <div className="flex flex-col justify-center h-full px-[100px] py-[70px]">
        <p className="text-[16px] font-bold text-[hsl(193,98%,50%)] uppercase tracking-[0.2em] mb-4">Platform Features</p>
        <h2 className="text-[48px] font-black text-white mb-8 leading-[1.1]">Everything you need.<br /> Nothing you don't.</h2>
        <div className="grid grid-cols-3 gap-5">
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
            <div key={i} className="bg-white/[0.03] rounded-2xl p-6 border border-white/[0.06]">
              <span className="text-[36px] mb-2 block">{item.icon}</span>
              <h3 className="text-[18px] font-bold text-white">{item.title}</h3>
              <p className="text-[15px] text-white/50 leading-tight">{item.desc}</p>
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
      <div className="flex flex-col justify-center h-full px-[100px] py-[80px]">
        <p className="text-[16px] font-bold text-[hsl(145,80%,42%)] uppercase tracking-[0.2em] mb-4">Business Model</p>
        <h2 className="text-[52px] font-black text-white mb-10 leading-[1.1]">Multiple revenue<br /> streams</h2>
        <div className="grid grid-cols-2 gap-8">
          {[
            { icon: "💸", title: "Trading Fees", desc: "Admin + creator fee split on every trade. Configurable commission rates.", pct: "3–10%" },
            { icon: "⚡", title: "Quick Trade Rake", desc: "Platform fee on every 30s prediction round. High frequency = high volume.", pct: "5%" },
            { icon: "🔥", title: "Market Boosts", desc: "Creators pay to boost markets to the homepage carousel. Crypto payments.", pct: "Pay-per-boost" },
            { icon: "🏧", title: "Withdrawal Fees", desc: "Percentage-based fee on all crypto withdrawals. Configurable by admin.", pct: "1–3%" },
          ].map((item, i) => (
            <div key={i} className="bg-white/5 rounded-3xl p-8 border border-white/10 relative overflow-hidden">
              <div className="absolute top-5 right-5 bg-[hsl(193,98%,50%)]/20 text-[hsl(193,98%,50%)] text-[14px] font-bold px-3 py-1 rounded-full">{item.pct}</div>
              <span className="text-[42px] mb-3 block">{item.icon}</span>
              <h3 className="text-[24px] font-bold text-white mb-1">{item.title}</h3>
              <p className="text-[18px] text-white/60 leading-snug">{item.desc}</p>
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
      <div className="flex flex-col justify-center h-full px-[100px] py-[80px]">
        <p className="text-[16px] font-bold text-[hsl(193,98%,50%)] uppercase tracking-[0.2em] mb-4">Technology</p>
        <h2 className="text-[52px] font-black text-white mb-10 leading-[1.1]">Built for speed,<br /> scale & security</h2>
        <div className="grid grid-cols-2 gap-12">
          <div className="space-y-4">
            <h3 className="text-[22px] font-bold text-white/80 mb-2">Frontend</h3>
            {["React 18 + TypeScript", "Tailwind CSS + Framer Motion", "PWA with push notifications", "Web3 wallet via WalletConnect"].map((t, i) => (
              <div key={i} className="flex items-center gap-4 bg-white/5 rounded-2xl px-6 py-4 border border-white/10">
                <div className="w-3 h-3 rounded-full bg-[hsl(193,98%,50%)] shrink-0" />
                <span className="text-[20px] text-white/80">{t}</span>
              </div>
            ))}
          </div>
          <div className="space-y-4">
            <h3 className="text-[22px] font-bold text-white/80 mb-2">Backend</h3>
            {["Lovable Cloud (Postgres + Auth + Realtime)", "Edge Functions (Deno runtime)", "AI Gateway (Gemini / GPT)", "NOWPayments crypto gateway"].map((t, i) => (
              <div key={i} className="flex items-center gap-4 bg-white/5 rounded-2xl px-6 py-4 border border-white/10">
                <div className="w-3 h-3 rounded-full bg-[hsl(145,80%,42%)] shrink-0" />
                <span className="text-[20px] text-white/80">{t}</span>
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
      <div className="flex flex-col justify-center h-full px-[100px] py-[80px]">
        <p className="text-[16px] font-bold text-[hsl(0,85%,55%)] uppercase tracking-[0.2em] mb-4">Why Us</p>
        <h2 className="text-[52px] font-black text-white mb-8 leading-[1.1]">Unfair advantages</h2>
        <div className="space-y-4">
          {[
            { title: "All-in-one platform", desc: "Predictions + Quick Trade + Social + Copy Trading in a single app." },
            { title: "AI-native creation", desc: "Markets created in seconds with AI-generated content. 10x faster." },
            { title: "Gamification engine", desc: "Streaks, leaderboards, milestones drive retention and engagement." },
            { title: "Full admin control", desc: "Enterprise-grade dashboard with moderation, analytics, and audit logs." },
            { title: "Mobile-first PWA", desc: "Native app experience without app store friction. One-tap install." },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-5 bg-white/[0.03] rounded-2xl p-5 border border-white/[0.06]">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[hsl(193,98%,50%)] to-[hsl(193,80%,35%)] flex items-center justify-center shrink-0 text-[22px] font-black text-white">{i + 1}</div>
              <div>
                <h3 className="text-[22px] font-bold text-white">{item.title}</h3>
                <p className="text-[18px] text-white/50 leading-snug">{item.desc}</p>
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
      <div className="flex flex-col justify-center h-full px-[100px] py-[80px]">
        <p className="text-[16px] font-bold text-[hsl(193,98%,50%)] uppercase tracking-[0.2em] mb-4">Roadmap</p>
        <h2 className="text-[52px] font-black text-white mb-8 leading-[1.1]">What's next</h2>
        <div className="grid grid-cols-4 gap-6">
          {[
            { q: "Q1 2026", status: "✅ Done", items: ["Core platform launch", "Quick Trade engine", "AI market creation", "Referral system"] },
            { q: "Q2 2026", status: "🔨 Building", items: ["Mobile app (Capacitor)", "Polymarket import", "Sports auto-resolve", "Revenue share program"] },
            { q: "Q3 2026", status: "📋 Planned", items: ["Token launch", "On-chain settlement", "API for developers", "Multi-language support"] },
            { q: "Q4 2026", status: "🔮 Vision", items: ["Decentralized governance", "Cross-chain support", "Institutional accounts", "Market maker SDK"] },
          ].map((phase, i) => (
            <div key={i} className="bg-white/5 rounded-3xl p-8 border border-white/10 flex flex-col">
              <p className="text-[14px] text-white/40 mb-1">{phase.status}</p>
              <p className="text-[24px] font-bold text-[hsl(193,98%,50%)] mb-4">{phase.q}</p>
              <ul className="space-y-2 flex-1">
                {phase.items.map((item, j) => (
                  <li key={j} className="text-[18px] text-white/60 flex items-start gap-2">
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
      <div className="flex flex-col items-center justify-center h-full text-center px-[100px] py-[60px]">
        <p className="text-[16px] font-bold text-[hsl(193,98%,50%)] uppercase tracking-[0.2em] mb-6">The Ask</p>
        <h2 className="text-[64px] font-black text-white mb-4 leading-[1.1]">Let's build the future<br /> of prediction markets</h2>
        <p className="text-[22px] text-white/60 max-w-[1000px] mb-10 leading-relaxed">Our product is 100% built and live. We're raising a seed round to secure licensing, scale operations, forge strategic partnerships, and accelerate marketing.</p>
        <div className="grid grid-cols-4 gap-6 max-w-[1200px] w-full mb-10">
          {[
            { label: "Raising", value: "$2M", sub: "Seed Round" },
            { label: "Licensing", value: "30%", sub: "Regulatory & compliance" },
            { label: "Growth", value: "40%", sub: "Marketing & partnerships" },
            { label: "Operations", value: "30%", sub: "Scaling & infrastructure" },
          ].map((item, i) => (
            <div key={i} className="bg-white/5 rounded-3xl p-6 border border-[hsl(193,98%,50%)]/20">
              <p className="text-[14px] text-white/40 uppercase tracking-wider mb-1">{item.label}</p>
              <p className="text-[52px] font-black text-[hsl(193,98%,50%)] leading-none">{item.value}</p>
              <p className="text-[16px] text-white/50 mt-1">{item.sub}</p>
            </div>
          ))}
        </div>
        <div className="bg-[hsl(145,80%,42%)]/10 border border-[hsl(145,80%,42%)]/20 rounded-2xl px-8 py-4 mb-6">
          <p className="text-[20px] text-[hsl(145,80%,42%)] font-semibold">✅ Product 100% complete — Zero engineering risk</p>
        </div>
        <div className="text-white/40 text-[18px]">
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

  const captureSlides = async () => {
    const html2canvas = (await import("html2canvas")).default;
    const slideEls = deckRef.current?.querySelectorAll(".deck-slide");
    if (!slideEls?.length) return [];

    const images: string[] = [];
    for (let i = 0; i < slideEls.length; i++) {
      const el = slideEls[i] as HTMLElement;
      const canvas = await html2canvas(el, {
        width: el.scrollWidth,
        height: el.scrollHeight,
        scale: 1920 / el.scrollWidth, // scale up to 1920 wide
        useCORS: true,
        backgroundColor: "#0a0c14",
        logging: false,
      });
      images.push(canvas.toDataURL("image/jpeg", 0.92));
    }
    return images;
  };

  const handleDownloadPDF = async () => {
    if (!deckRef.current?.querySelectorAll(".deck-slide")?.length) return;
    const toastId = toast.loading("Generating PDF…");
    try {
      const images = await captureSlides();
      if (!images.length) throw new Error("No slides captured");
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1920, 1080] });
      images.forEach((img, i) => {
        if (i > 0) pdf.addPage([1920, 1080], "landscape");
        pdf.addImage(img, "JPEG", 0, 0, 1920, 1080);
      });
      pdf.save("OPoll_Investor_Deck.pdf");
      toast.success("PDF downloaded!", { id: toastId });
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate PDF", { id: toastId });
    }
  };

  const handleDownloadPPTX = async () => {
    if (!deckRef.current?.querySelectorAll(".deck-slide")?.length) return;
    const toastId = toast.loading("Generating PowerPoint…");
    try {
      const images = await captureSlides();
      if (!images.length) throw new Error("No slides captured");
      const PptxGenJS = (await import("pptxgenjs")).default;
      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_WIDE";
      images.forEach((img) => {
        const slide = pptx.addSlide();
        slide.addImage({ data: img, x: 0, y: 0, w: "100%", h: "100%" });
      });
      await pptx.writeFile({ fileName: "OPoll_Investor_Deck.pptx" });
      toast.success("PowerPoint downloaded!", { id: toastId });
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate PowerPoint", { id: toastId });
    }
  };

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
            <p className="text-[10px] sm:text-sm text-muted-foreground">10-slide pitch deck — download as PDF or PowerPoint</p>
          </div>
          <div className="flex gap-1.5 sm:gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => navigate("/admin")} className="h-8 px-2.5 sm:px-3 text-xs">
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="gap-1 h-8 px-2.5 sm:px-3 text-xs">
                  <Download className="w-3.5 h-3.5" /> Download
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDownloadPDF} className="gap-2">
                  <FileText className="w-4 h-4" /> Download as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownloadPPTX} className="gap-2">
                  <Presentation className="w-4 h-4" /> Download as PowerPoint
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Deck */}
        <div id="investor-deck" ref={deckRef} className="space-y-4 sm:space-y-6">
          {slides.map((slide, i) => (
            <ScaledSlide key={i} bg={slide.bg}>
              {slide.content}
            </ScaledSlide>
          ))}
        </div>
      </div>
    </>
  );
};

export default InvestorDeck;
