import SEOHead from "@/components/SEOHead";
import { ArrowLeft, Search, Sparkles, X, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BackToTop from "@/components/BackToTop";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useState, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/faq-ai`;

const faqSections = [
  {
    title: "General",
    items: [
      { question: "What is OPollMarket?", answer: "OPollMarket is a decentralized prediction market platform that allows users to create markets, participate in predictions, provide liquidity, and earn rewards based on real-world outcomes." },
      { question: "Who is eligible to use OPollMarket?", answer: "Any individual with access to a supported wallet or verified email login may access OPollMarket, subject to applicable laws and regulations in their jurisdiction. Users must be legally permitted to hold and transact with digital assets." },
      { question: "How does OPollMarket differ from other platforms?", answer: "OPollMarket integrates decentralized finance principles, community-driven prediction markets, and optional market boost mechanics to enhance engagement and transparency." },
    ],
  },
  {
    title: "Account & Wallet",
    items: [
      { question: "How can I connect?", answer: "Users may connect via:\n• Email login (OTP verification)\n• Supported wallets (e.g., Trust Wallet, MetaMask, Bitget Wallet)" },
      { question: "Is prior experience with cryptocurrencies required?", answer: "No. OPollMarket is designed to be accessible to both novice and experienced users, though familiarity with basic wallet operations is recommended." },
      { question: "Is a wallet mandatory?", answer: "Yes. A digital wallet is required to deposit funds, create or participate in markets, and withdraw rewards." },
    ],
  },
  {
    title: "Deposits & Withdrawals",
    items: [
      { question: "What digital assets are supported?", answer: "Currently, USDC, USDT, BNB, and BC400 are supported, subject to network availability and operational requirements." },
      { question: "How do I deposit assets?", answer: "1. Copy the provided deposit address from OPollMarket.\n2. Send supported tokens to the address.\n3. Funds will be reflected in your portfolio after blockchain confirmation." },
      { question: "How do withdrawals work?", answer: "1. Enter your external wallet address.\n2. Confirm the transaction.\n3. Funds are transferred directly to the specified wallet.\n\nNote: You must have at least one confirmed deposit before you can withdraw. A minimum withdrawal amount applies." },
      { question: "Are there fees?", answer: "Yes. The Platform charges several types of fees:\n\n• **Trading Fees:** A percentage commission is deducted from winning payouts (split between platform and market creator).\n• **Early Exit Fee:** Selling a position before market resolution incurs an exit fee (percentage set by the admin). This fee is returned to the market pool.\n• **Market Creation Fee:** Users who don't hold qualifying tokens/NFTs pay a flat creation fee.\n• **Network Fees:** Blockchain gas fees may apply to deposits and withdrawals.\n\nAll fee percentages are displayed in the Platform and can be adjusted by the admin." },
    ],
  },
  {
    title: "Markets",
    items: [
      { question: "Who may create a market?", answer: "Users meeting eligibility requirements (e.g., NFT holders or holding 10,000,000+ BC400 tokens) may create markets. Users who do not meet these requirements can pay a Market Creation Fee to proceed." },
      { question: "What types of markets are supported?", answer: "• Political events\n• Technology and innovation\n• Cryptocurrency prices\n• Sports outcomes\n• Community milestones\n• Custom event-based questions" },
      { question: "Can a market be edited after creation?", answer: "No. Core parameters cannot be modified once a market is live, ensuring fairness and integrity." },
      { question: "What happens if my market is flagged for inappropriate content?", answer: "All market submissions are screened by our AI moderation system for profanity, nudity, hate speech, violence, and other guideline violations. If your market is flagged and rejected:\n\n• The Market Creation Fee is permanently forfeited (non-refundable)\n• Only your initial liquidity will be refunded to your balance\n\nThis policy exists to discourage misuse and ensure a safe community. Repeated violations may lead to account suspension." },
    ],
  },
  {
    title: "Boosts",
    items: [
      { question: "What is a Boost?", answer: "A Boost is an optional mechanism to increase market visibility, attract participants, and enhance liquidity." },
      { question: "What Boost options are available?", answer: "• Flash Boost – 12 hours\n• Standard Boost – 24 hours\n• Whale Pin – 7 days" },
      { question: "Does a Boost affect market outcomes?", answer: "No. A Boost only increases visibility and engagement; it does not alter probabilities or outcomes." },
    ],
  },
  {
    title: "Telegram Integration",
    items: [
      { question: "Can I place predictions through Telegram?", answer: "Yes. Integrated bot functionality allows predictions via Telegram, linked to your OPollMarket portfolio." },
      { question: "How does Telegram integration work?", answer: "1. Launch the prediction function from Telegram via the web app.\n2. Connect your Telegram account.\n3. A wallet is automatically generated.\n4. Copy the wallet address and transfer supported tokens.\n5. Select a market and choose an outcome.\n6. Confirm the prediction.\n\nAll transactions are synchronized with your OPollMarket portfolio." },
    ],
  },
  {
    title: "WhatsApp Integration",
    items: [
      { question: "Can predictions be made through WhatsApp?", answer: "Yes. WhatsApp integration allows for seamless participation." },
      { question: "How does WhatsApp integration work?", answer: "1. Launch the prediction function from WhatsApp via the web app.\n2. Connect your WhatsApp account.\n3. A wallet is automatically generated.\n4. Copy the wallet address and transfer supported tokens.\n5. Select a market and choose an outcome.\n6. Confirm the prediction.\n\nAll transactions are synchronized with your OPollMarket portfolio." },
    ],
  },
  {
    title: "Liquidity",
    items: [
      { question: "What is liquidity in OPollMarket?", answer: "Liquidity represents the funds supporting each market outcome, influencing price movement and probability shifts." },
      { question: "Why is liquidity important?", answer: "Higher liquidity improves price accuracy, reduces slippage, and enhances market stability." },
    ],
  },
  {
    title: "Leaderboard & Rankings",
    items: [
      { question: "What is the Leaderboard?", answer: "The Leaderboard ranks users based on prediction accuracy and profitability." },
      { question: "Are there rewards associated with the Leaderboard?", answer: "Leaderboard recognition may include future incentives and rewards, subject to OPollMarket discretion." },
    ],
  },
  {
    title: "Portfolio & Shares",
    items: [
      { question: "What does my Portfolio display?", answer: "• Total balance (main + referral bonus)\n• Active predictions\n• Shares owned\n• Realized gains\n• Unrealized PnL\n• Limit order status" },
      { question: "What are shares?", answer: "Shares reflect your position in a specific outcome." },
      { question: "Can I sell my position before a market resolves?", answer: "Yes. You can exit a position early by selling your shares. An early exit fee (set by the admin) is deducted from the sale proceeds and returned to the market pool. If you have referral bonus balance, it will automatically be applied to offset the exit fee before your main proceeds are reduced. The net payout is shown in the sell confirmation." },
      { question: "What are Limit Orders?", answer: "Limit orders let you specify a target price at which you want to buy shares. Your order will be automatically matched when market conditions reach your target price. You can view and cancel pending limit orders from your Portfolio page." },
    ],
  },
  {
    title: "Resolution",
    items: [
      { question: "How are markets resolved?", answer: "Markets are resolved using verified, publicly available data, based on predefined rules." },
      { question: "Who determines outcomes?", answer: "Outcomes are determined according to OPollMarket resolution protocols and trusted data sources." },
      { question: "What happens after resolution?", answer: "Winning shares are settled automatically, and funds are credited to users' balances." },
    ],
  },
  {
    title: "Referral Program",
    items: [
      { question: "How does the Referral Program work?", answer: "Share your unique referral link (based on your display name) with friends. When a referred user places their first trade, you receive a bonus reward." },
      { question: "What can I use my referral bonus for?", answer: "Referral bonus balance is a **fee credit only**. It is automatically applied to cover Platform fees (trading fees, exit fees, market creation fees) before your main balance is charged. It cannot be withdrawn, transferred, or used to fund trade amounts." },
      { question: "How do I check my referral bonus?", answer: "Your referral bonus balance is displayed on your Profile page and in the sell/buy confirmation modals when applicable." },
    ],
  },
  {
    title: "Security & Privacy",
    items: [
      { question: "Is OPollMarket secure?", answer: "Yes. The platform implements secure wallet authentication, blockchain-based settlement, and standard cybersecurity measures." },
      { question: "Are funds custodial?", answer: "No. Funds remain under the control of users via their wallets; OPollMarket does not hold custodial access." },
      { question: "How is user data protected?", answer: "User data is safeguarded through authentication protocols, secure infrastructure, and compliance with applicable privacy standards." },
    ],
  },
];

const FAQ = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showAiAnswer, setShowAiAnswer] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleAskAI = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 3 || isStreaming) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsStreaming(true);
    setAiAnswer("");
    setShowAiAnswer(true);

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ question: trimmed }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Something went wrong" }));
        toast.error(err.error || "Failed to get answer");
        setIsStreaming(false);
        setShowAiAnswer(false);
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              accumulated += content;
              setAiAnswer(accumulated);
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        for (let raw of buffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              accumulated += content;
              setAiAnswer(accumulated);
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        toast.error("Failed to get answer. Please try again.");
        setShowAiAnswer(false);
      }
    } finally {
      setIsStreaming(false);
    }
  }, [query, isStreaming]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAskAI();
    }
  };

  const clearAnswer = () => {
    abortRef.current?.abort();
    setShowAiAnswer(false);
    setAiAnswer("");
    setIsStreaming(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
      <SEOHead title="FAQ – OPollMarket" description="Frequently asked questions about OPollMarket — deposits, withdrawals, market creation, boosts, Telegram & WhatsApp integration, and more." path="/faq" />
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-lg md:max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Frequently Asked Questions</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* AI Search Bar */}
        <div className="space-y-3">
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about OPollMarket…"
              className="w-full pl-10 pr-20 py-3 rounded-xl glass border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
            />
            <button
              onClick={handleAskAI}
              disabled={isStreaming || query.trim().length < 3}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {isStreaming ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              {isStreaming ? "Thinking…" : "Ask AI"}
            </button>
          </div>

          {/* AI Answer Panel */}
          <AnimatePresence>
            {showAiAnswer && (
              <motion.div
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="overflow-hidden"
              >
                <div className="glass-strong rounded-xl border border-primary/20 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-semibold text-primary">AI Answer</span>
                    </div>
                    <button
                      onClick={clearAnswer}
                      className="p-1 rounded-md hover:bg-muted transition"
                    >
                      <X className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                  <div className="text-sm text-foreground leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-headings:my-2">
                    {aiAnswer ? (
                      <ReactMarkdown>{aiAnswer}</ReactMarkdown>
                    ) : isStreaming ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Thinking…</span>
                      </div>
                    ) : null}
                  </div>
                  {isStreaming && aiAnswer && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      <span className="text-[10px] text-muted-foreground">Generating…</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* FAQ Sections */}
        <div className="space-y-6 pt-2">
          {faqSections.map((section, si) => (
            <div key={si}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 px-1">{section.title}</h2>
              <Accordion type="single" collapsible className="space-y-2">
                {section.items.map((item, i) => (
                  <AccordionItem key={i} value={`faq-${si}-${i}`} className="glass rounded-xl border-none px-4">
                    <AccordionTrigger className="text-sm font-semibold text-foreground hover:no-underline py-4">
                      {item.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4 whitespace-pre-line">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ))}
        </div>
      </div>
      <BackToTop />
    </div>
  );
};

export default FAQ;
