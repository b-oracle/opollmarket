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
      { question: "What digital assets are supported?", answer: "We support stablecoin deposits including USDT, USDC, and DAI across multiple networks (BEP20, TRC20, ERC20, Polygon, Solana). Fiat (NGN) deposits are also available via bank transfer. Non-stablecoin cryptocurrencies (BTC, ETH, BNB, etc.) are not accepted for deposits." },
      { question: "How do I deposit assets?", answer: "1. Copy the provided deposit address from OPollMarket.\n2. Send supported tokens to the address.\n3. Funds will be reflected in your portfolio after blockchain confirmation." },
      { question: "How do withdrawals work?", answer: "1. Enter your external wallet address.\n2. Confirm the transaction.\n3. Funds are transferred directly to the specified wallet.\n\nNote: You must have at least one confirmed deposit before you can withdraw. A minimum withdrawal amount applies." },
      { question: "Are there fees?", answer: "Yes. The Platform charges several types of fees:\n\n• **Trading Fees:** A percentage commission is deducted from winning payouts (split between platform and market creator).\n• **Early Exit Fee:** Selling a position before market resolution incurs an exit fee (percentage set by the admin). This fee is returned to the market pool.\n• **Market Creation Fee:** Users who don't hold qualifying tokens/NFTs pay a flat creation fee.\n• **Network Fees:** Blockchain gas fees may apply to deposits and withdrawals.\n\nAll fee percentages are displayed in the Platform and can be adjusted by the admin." },
    ],
  },
  {
    title: "Markets",
    items: [
      { question: "Who may create a market?", answer: "Users meeting eligibility requirements (e.g., NFT holders or holding the minimum required BC400 tokens) may create markets for free. Users who do not meet these requirements can pay a Market Creation Fee to proceed." },
      { question: "What types of markets are supported?", answer: "• Political events\n• Technology and innovation\n• Cryptocurrency prices\n• Sports outcomes\n• Community milestones\n• Custom event-based questions" },
      { question: "Can a market be edited after creation?", answer: "No. Core parameters cannot be modified once a market is live, ensuring fairness and integrity." },
      { question: "What happens if my market is flagged for inappropriate content?", answer: "All market submissions are screened by our AI moderation system for profanity, nudity, hate speech, violence, and other guideline violations. If your market is flagged and rejected:\n\n• The Market Creation Fee is permanently forfeited (non-refundable)\n• Only your initial liquidity will be refunded to your balance\n\nThis policy exists to discourage misuse and ensure a safe community. Repeated violations may lead to account suspension." },
    ],
  },
  {
    title: "Verification Badges",
    items: [
      { question: "What are verification badges?", answer: "Verification badges (Blue Tick and Gold Tick) are awarded to users who hold qualifying BC400 tokens and/or NFTs. They indicate community commitment and unlock platform benefits." },
      { question: "How do I get a Blue Tick?", answer: "You qualify for the **Blue Tick** by meeting **at least one** of:\n\n• Holding the minimum BC400 tokens required for the Blue tier\n• Holding a qualifying BC400 NFT **and** using it as your profile avatar\n\nThe exact token threshold is set by the admin and displayed when you tap any verification badge." },
      { question: "How do I get a Gold Tick?", answer: "You qualify for the **Gold Tick** by meeting **both** requirements:\n\n• Holding the minimum BC400 tokens required for the Gold tier (higher than Blue)\n• Holding a qualifying BC400 NFT **and** using it as your profile avatar\n\nThe exact token threshold is set by the admin and displayed when you tap any verification badge." },
      { question: "What benefits do verified users get?", answer: "Verified users enjoy:\n\n• **Trending Boost:** Markets by verified creators get a multiplied trending score (Gold gets a higher multiplier than Blue)\n• **Revenue Share Bonus:** An additional bonus percentage on top of your standard creator fee, paid from platform revenue when your markets resolve\n• **Creator Badge:** A visible 'CREATOR' badge on your profile\n• **Visual Badge:** Blue or Gold tick displayed across your profile, rankings, comments, and social feeds" },
      { question: "How do I refresh my verification?", answer: "Visit your Profile page and the platform automatically checks your wallet holdings. Admins can also trigger a bulk refresh for all users." },
    ],
  },
  {
    title: "Quick Trade",
    items: [
      { question: "What is Quick Trade?", answer: "Quick Trade lets you predict short-term price movements (UP or DOWN) on assets like BTC, ETH, Gold, Forex, and more within fixed time windows (1, 3, 5, or 15 minutes)." },
      { question: "How do Quick Trade payouts work?", answer: "All bets in a round are pooled. A platform fee is deducted from the losing pool, and the remainder is distributed proportionally to winners." },
      { question: "What are streak multipliers?", answer: "Consecutive winning trades earn streak bonus multipliers on your payouts. The multiplier increases with each consecutive win (2×, 3×, 4×, 5× streaks). Multiplier values are configured by the admin." },
      { question: "What assets are available?", answer: "Available assets include cryptocurrencies (BTC, ETH, BNB, SOL, etc.), commodities (Gold, Silver, Oil), and forex pairs (EUR/USD, GBP/USD, etc.). The admin can enable or disable specific assets at any time." },
    ],
  },
  {
    title: "Copy Trading",
    items: [
      { question: "What is Copy Trading?", answer: "Copy Trading allows you to follow other users and automatically replicate their trades (predictions and/or Quick Trades)." },
      { question: "How do I set up Copy Trading?", answer: "Visit any user's profile page, tap the copy icon, and configure:\n\n• **Max amount** per copied trade\n• Whether to copy predictions, Quick Trades, or both\n• **Auto-copy** (instant) or manual approval mode" },
      { question: "Is there a commission?", answer: "Yes. When a copied trade wins, a commission (percentage set by the admin) is deducted from your profit and credited to the original trader." },
      { question: "Can I lose money with Copy Trading?", answer: "Yes. Copy Trading does not guarantee profits. Past performance of any trader does not predict future results. You are responsible for all trades on your account." },
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
    title: "Direct Messaging",
    items: [
      { question: "How do I send a direct message?", answer: "Tap the chat icon (💬) in the top bar to open your conversations. You can start a new conversation with any user you mutually follow." },
      { question: "Who can I message?", answer: "Direct messaging is available only between **mutual follows** — both you and the other user must follow each other. This prevents unsolicited messages." },
      { question: "Can I send gifts in chat?", answer: "Yes! Tap the gift icon next to the message input to send an emoji gift. Each emoji has a fixed dollar value (e.g., 💸 $1, 💰 $5, 👱🏼‍♀️ $50). The amount is deducted from your **gift balance** and credited to the recipient's **rewards balance**." },
      { question: "Can I send money directly in chat?", answer: "Yes! In addition to emoji gifts, you can send a **custom dollar amount** directly from your main balance to another user. Tap the gift icon, switch to the 'Send Money' tab, enter the amount, and confirm with your Security PIN. A platform fee applies and is shown before you confirm. Minimum transfer is $0.50." },
      { question: "Can I make voice or video calls?", answer: "Yes! You can make one-on-one **voice and video calls** directly from a DM conversation. Tap the phone or video icon in the chat header to initiate a call. The recipient will see an incoming call banner and can accept or decline." },
      { question: "Are messages encrypted?", answer: "Messages are encrypted in transit (TLS) and at rest in the database. The Platform does not offer client-side end-to-end encryption at this time." },
      { question: "Is there a message rate limit?", answer: "Yes. To prevent spam, you can send a maximum of 5 messages per 10 seconds in any conversation." },
      { question: "Can I control who messages or calls me?", answer: "Yes. Go to Messages → Settings to manage your privacy preferences:\n\n• **Allow DMs** — toggle direct messages on/off\n• **Allow Calls** — toggle voice/video calls on/off\n• **Allow Money Transfers** — toggle incoming money transfers\n• **Allow Community Invites** — toggle community chat invites\n• **Message Notifications** — mute or unmute chat notifications" },
    ],
  },
  {
    title: "Community Chats",
    items: [
      { question: "What are Community Chats?", answer: "Community Chats are group conversations organized around topics. You can join existing communities or be invited by other members. Messages, images, reactions, and market tags are all supported." },
      { question: "How do I join a Community?", answer: "Go to Messages → Communities tab to browse available communities. Tap a community to join and start chatting." },
      { question: "Can I share markets in community chats?", answer: "Yes! When composing a message, you can tag prediction markets to share them with the community. Tagged markets appear as interactive cards in the chat." },
    ],
  },
  {
    title: "In-App Support",
    items: [
      { question: "How do I contact support?", answer: "Go to Messages → Support tab to open a chat with our support team. You can describe your issue and receive help directly in the app." },
      { question: "Is there an AI assistant?", answer: "Yes. The support chat includes an AI auto-reply that can help answer common questions instantly. For complex issues, a human support agent will follow up." },
      { question: "Can I search my support messages?", answer: "Yes. Use the search bar at the top of the support chat to filter through your previous messages and find past conversations." },
    ],
  },
  {
    title: "Spaces (Live Rooms)",
    items: [
      { question: "What are Spaces?", answer: "Spaces are live audio/video rooms where users can host conversations, discussions, and debates with their followers in real-time." },
      { question: "How do I create a Space?", answer: "Go to the Social tab and tap 'Create Space'. You can set a title, tag markets for discussion, invite co-hosts, and optionally schedule it for later." },
      { question: "Can I send gifts during a Space?", answer: "Yes! Listeners can send emoji gifts to speakers and co-hosts during live Spaces. Gift values are deducted from your gift balance and credited to the recipient's rewards balance." },
      { question: "Can I use video in Spaces?", answer: "Yes. Hosts and co-hosts can enable their camera, including switching between front and back cameras on mobile devices." },
    ],
  },
  {
    title: "Stories & Status Posts",
    items: [
      { question: "What are Stories?", answer: "Stories are short-lived visual posts (text, images, or market shares) that expire after 24 hours. They appear in the stories carousel at the top of the Social feed." },
      { question: "What are Status Posts?", answer: "Status posts are permanent social updates you can share with your followers, including text content, images, and tagged markets. Other users can like, comment, and engage with your posts." },
    ],
  },
  {
    title: "KYC (Identity Verification)",
    items: [
      { question: "What is KYC?", answer: "KYC (Know Your Customer) is an identity verification process that helps maintain platform security and comply with regulations. It is **optional during registration** — you can skip it and complete it later from your Security & KYC hub." },
      { question: "What are the KYC tiers?", answer: "**Tier 1 (Basic):** Requires your name, date of birth, phone number, and a selfie with a verification note.\n\n**Tier 2 (Full):** Requires government-issued ID (front & back), address proof, and utility bills." },
      { question: "How do withdrawal limits work with KYC?", answer: "Without KYC, you have a lower daily withdrawal limit. Completing Tier 1 increases your limit, and Tier 2 unlocks the highest daily withdrawal allowance. Exact limits are set by the admin." },
      { question: "Is my KYC data secure?", answer: "Yes. KYC documents are stored in a private, access-controlled storage bucket. Device fingerprinting (IP, browser, screen size) is logged during submission for fraud prevention." },
    ],
  },
  {
    title: "Security & Privacy",
    items: [
      { question: "Is OPollMarket secure?", answer: "Yes. The platform implements secure wallet authentication, blockchain-based settlement, row-level security policies, hardened database access controls, and standard cybersecurity measures." },
      { question: "What is the Security PIN?", answer: "You can set up a 6-digit Security PIN to protect sensitive actions like login, withdrawals, and **money transfers in DMs**. Go to your Profile → Security Settings to enable it." },
      { question: "What is TOTP (2FA)?", answer: "TOTP (Time-based One-Time Password) adds two-factor authentication using apps like Google Authenticator. You can require it for login and/or withdrawals from Security Settings." },
      { question: "Are funds custodial?", answer: "No. Funds remain under the control of users via their wallets; OPollMarket does not hold custodial access." },
      { question: "How is user data protected?", answer: "User data is safeguarded through authentication protocols, Row-Level Security policies, encrypted storage, hardened security settings that prevent client-side tampering, and compliance with applicable privacy standards. See our Privacy Policy for full details." },
      { question: "What are Feature Toggles?", answer: "The platform uses feature toggles to enable or disable specific features (e.g., DM money transfers, voice calls, community chats, support chat). Admins can toggle features on/off without requiring a code deployment." },
    ],
  },
];

const MAX_AI_RESPONSES = 3;

const findBestFaqMatch = (userQuery: string) => {
  const words = userQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  let bestMatch: { question: string; answer: string } | null = null;
  let bestScore = 0;

  for (const section of faqSections) {
    for (const item of section.items) {
      const text = (item.question + " " + item.answer).toLowerCase();
      const score = words.reduce((acc, word) => acc + (text.includes(word) ? 1 : 0), 0);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    }
  }

  return bestScore >= 1 ? bestMatch : null;
};

const FAQ = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showAiAnswer, setShowAiAnswer] = useState(false);
  const [isLimitFallback, setIsLimitFallback] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const aiUsageCount = useRef(0);

  const handleAskAI = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 3 || isStreaming) return;

    // Check session limit
    if (aiUsageCount.current >= MAX_AI_RESPONSES) {
      const match = findBestFaqMatch(trimmed);
      setIsLimitFallback(true);
      setShowAiAnswer(true);
      if (match) {
        setAiAnswer(`**You've reached the AI assist limit for this session.** Here's a related answer from our FAQ:\n\n**${match.question}**\n\n${match.answer}`);
      } else {
        setAiAnswer("**You've reached the AI assist limit for this session.** Please browse the FAQ sections below for answers, or reload the page to start a new session.");
      }
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsStreaming(true);
    setAiAnswer("");
    setShowAiAnswer(true);
    setIsLimitFallback(false);

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

      // Increment usage count on successful AI response
      aiUsageCount.current += 1;
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

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqSections.flatMap((s) =>
      s.items.map((it) => ({
        "@type": "Question",
        name: it.question,
        acceptedAnswer: { "@type": "Answer", text: it.answer },
      }))
    ),
  };

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ paddingBottom: 'calc(1rem + var(--content-bottom))' }}>
      <SEOHead title="FAQ" description="Frequently asked questions about OPollMarket — deposits, withdrawals, market creation, boosts, Telegram & WhatsApp integration, and more." path="/faq" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border" style={{ paddingTop: 'var(--safe-top)' }}>
        <div className="max-w-lg md:max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Frequently Asked Questions</h1>
        </div>
      </div>

      <div className="max-w-lg md:max-w-3xl mx-auto px-4 pt-4 space-y-4">
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
              className="w-full pl-10 pr-32 py-3 rounded-xl glass border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
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
              {isStreaming ? "Thinking…" : "Ask OPoll AI"}
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
                      <span className="text-xs font-semibold text-primary">{isLimitFallback ? "FAQ Match" : "AI Answer"}</span>
                      {!isLimitFallback && aiUsageCount.current < MAX_AI_RESPONSES && (
                        <span className="text-[10px] text-muted-foreground">({MAX_AI_RESPONSES - aiUsageCount.current} left)</span>
                      )}
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
