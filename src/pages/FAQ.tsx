import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BackToTop from "@/components/BackToTop";

const faqItems = [
  {
    question: "What is this platform?",
    answer: "This is a prediction market platform where you can trade on the outcomes of real-world events. You buy shares in outcomes you believe will happen, and earn returns if you're correct."
  },
  {
    question: "How do prediction markets work?",
    answer: "Prediction markets allow you to buy and sell shares in the outcome of events. Each share is priced between 0¢ and 100¢, representing the market's estimated probability of that outcome occurring. If the outcome you hold shares in is resolved as correct, each share pays out 100¢."
  },
  {
    question: "How do I place a bet?",
    answer: "Navigate to any market, choose YES or NO (or select an option in multi-choice markets), enter the amount you'd like to wager, and confirm your trade. Your position will appear in your Portfolio."
  },
  {
    question: "What is the minimum trade amount?",
    answer: "The minimum trade amount is $1. There is no maximum limit, though large trades may move the market price."
  },
  {
    question: "How are markets resolved?",
    answer: "Each market has a specified resolution source and end date. Once the event outcome is known, the market creator or platform administrators resolve the market based on the stated resolution criteria."
  },
  {
    question: "How do I deposit or withdraw funds?",
    answer: "You can deposit and withdraw funds through the wallet section in your profile. Supported methods include cryptocurrency transfers. Navigate to your profile and tap the wallet balance to access deposit and withdrawal options."
  },
  {
    question: "What fees are charged?",
    answer: "The platform charges a small commission on winning trades. The exact fee percentage is displayed before you confirm any trade. There are no fees on losing positions."
  },
  {
    question: "Can I create my own market?",
    answer: "Yes! Navigate to the Create page to propose a new prediction market. You'll need to provide a clear question, resolution criteria, end date, and initial liquidity. Markets are reviewed before going live."
  },
  {
    question: "What happens if a market is cancelled?",
    answer: "If a market is cancelled or deemed invalid, all shares are refunded at their original purchase price. You will receive a full refund to your account balance."
  },
  {
    question: "How does the referral program work?",
    answer: "Share your unique referral link with friends. When they sign up and place their first trade, both you and your friend receive a bonus reward credited to your account balance."
  },
  {
    question: "What is boosting a market?",
    answer: "Boosting increases a market's visibility by featuring it in the promoted carousel on the homepage. You can boost markets for different durations and tiers, with higher tiers offering more prominent placement."
  },
  {
    question: "Is my data secure?",
    answer: "Yes. We use industry-standard encryption and security practices to protect your personal information and funds. Please review our Privacy Policy for full details on data handling."
  },
];

const FAQ = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Frequently Asked Questions</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        {faqItems.map((item, i) => (
          <div key={i} className="glass rounded-xl p-4 space-y-2">
            <h3 className="font-semibold text-foreground">{item.question}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{item.answer}</p>
          </div>
        ))}
      </div>
      <BackToTop />
    </div>
  );
};

export default FAQ;
