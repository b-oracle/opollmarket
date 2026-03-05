import SEOHead from "@/components/SEOHead";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BackToTop from "@/components/BackToTop";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

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
      { question: "How do withdrawals work?", answer: "1. Enter your external wallet address.\n2. Confirm the transaction.\n3. Funds are transferred directly to the specified wallet." },
      { question: "Are there fees?", answer: "Network transaction fees (gas fees) may apply, depending on the blockchain used." },
    ],
  },
  {
    title: "Markets",
    items: [
      { question: "Who may create a market?", answer: "Users meeting eligibility requirements (e.g., NFT holders or holding 10,000,000+ BC400 tokens) may create markets." },
      { question: "What types of markets are supported?", answer: "• Political events\n• Technology and innovation\n• Cryptocurrency prices\n• Sports outcomes\n• Community milestones\n• Custom event-based questions" },
      { question: "Can a market be edited after creation?", answer: "No. Core parameters cannot be modified once a market is live, ensuring fairness and integrity." },
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
      { question: "What does my Portfolio display?", answer: "• Total balance\n• Active predictions\n• Shares owned\n• Realized gains\n• Unrealized PnL" },
      { question: "What are shares?", answer: "Shares reflect your position in a specific outcome." },
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

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <SEOHead title="FAQ – OPollMarket" description="Frequently asked questions about OPollMarket — deposits, withdrawals, market creation, boosts, Telegram & WhatsApp integration, and more." path="/faq" />
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Frequently Asked Questions</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-6">
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
      <BackToTop />
    </div>
  );
};

export default FAQ;
