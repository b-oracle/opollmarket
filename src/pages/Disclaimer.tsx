import SEOHead from "@/components/SEOHead";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BackToTop from "@/components/BackToTop";
import LegalTableOfContents from "@/components/LegalTableOfContents";

const tocItems = [
  { id: "general", label: "General Disclaimer" },
  { id: "no-advice", label: "No Financial, Investment, or Legal Advice" },
  { id: "risk", label: "Risk of Loss" },
  { id: "quicktrade-risk", label: "Quick Trade Risks" },
  { id: "copytrade-risk", label: "Copy Trading Risks" },
  { id: "dm-transfer-risk", label: "DM Money Transfer Risks" },
  { id: "verification-disclaimer", label: "Verification Badges" },
  { id: "crypto-risks", label: "Cryptocurrency & Blockchain Risks" },
  { id: "market-resolution", label: "Market Creation & Resolution" },
  { id: "ai-systems", label: "AI & Automated Systems" },
  { id: "availability", label: "Platform Availability" },
  { id: "third-party", label: "Third-Party Services & Content" },
  { id: "regulatory", label: "Regulatory Compliance" },
  { id: "liability", label: "Limitation of Liability" },
];

const Disclaimer = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ paddingBottom: 'calc(1rem + var(--content-bottom))' }}>
      <SEOHead title="Disclaimer – OPollMarket" description="Important disclaimers about using OPollMarket prediction markets. No financial advice — trade responsibly." path="/disclaimer" />
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border" style={{ paddingTop: 'var(--safe-top)' }}>
        <div className="max-w-lg md:max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Disclaimer</h1>
        </div>
      </div>

      <div className="max-w-lg md:max-w-3xl mx-auto px-4 pt-6 space-y-6 text-sm text-muted-foreground leading-relaxed">
        <LegalTableOfContents items={tocItems} />

        <section id="general" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">General Disclaimer</h2>
          <p>The information, services, and content provided on the OPollMarket platform ("Platform") are for general informational and entertainment purposes only. Participation in prediction markets involves financial risk, including the potential loss of your entire invested capital. You should not trade with funds you cannot afford to lose.</p>
          <p>The Platform is provided on an "AS IS" and "AS AVAILABLE" basis. We make no representations or warranties of any kind, express or implied, regarding the accuracy, completeness, reliability, suitability, or availability of the Platform or any information contained therein.</p>
        </section>

        <section id="no-advice" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">No Financial, Investment, or Legal Advice</h2>
          <p>Nothing on this Platform constitutes financial, investment, legal, tax, or any other form of professional advice. Specifically:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Market prices reflect the collective opinion of participants and are determined by an Automated Market Maker (AMM) algorithm — they are not guaranteed predictions of future events.</li>
            <li>Percentage probabilities displayed for market outcomes represent market sentiment, not objective likelihood assessments.</li>
            <li>Historical price charts, trading volumes, and order book data are provided for informational purposes only and should not be interpreted as buy or sell signals.</li>
            <li>Trending market rankings, boost promotions, and featured markets do not constitute endorsements or recommendations.</li>
          </ul>
          <p>Always conduct your own research and consult qualified financial, legal, or tax professionals before making any financial decisions.</p>
        </section>

        <section id="risk" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">Risk of Loss</h2>
          <p>Trading on prediction markets carries significant inherent risks, including but not limited to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Capital Loss:</strong> You may lose some or all of the funds you invest. Losing shares expire worthless with no payout upon market resolution.</li>
            <li><strong>Price Volatility:</strong> Market prices can fluctuate rapidly and unpredictably based on participant activity and external events.</li>
            <li><strong>Liquidity Risk:</strong> Markets with low liquidity may experience significant price slippage, and you may not be able to exit positions at your desired price.</li>
            <li><strong>AMM Mechanics:</strong> The constant-product AMM formula means that larger trades result in greater price impact. Displayed prices may differ from execution prices.</li>
            <li><strong>Early Exit Penalty:</strong> Selling a position before market resolution incurs an early exit fee (percentage configured by the System-Mod Engine). This fee is deducted from sale proceeds and reduces your net payout.</li>
            <li><strong>Limit Order Risk:</strong> Limit orders may not be filled if market conditions do not reach the target price. Unfilled orders tie up your balance until cancelled.</li>
            <li><strong>Resolution Risk:</strong> Market outcomes depend on real-world events and the interpretation of resolution criteria by the System-Mod Engine. Resolution decisions are final.</li>
            <li><strong>Counterparty Risk:</strong> While the Platform holds user funds in managed accounts, there is inherent risk in any centralized custody arrangement.</li>
          </ul>
          <p className="font-medium text-foreground">Past performance of any market, position, or trading strategy does not guarantee future results.</p>
        </section>

        <section id="quicktrade-risk" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">Quick Trade Risks</h2>
          <p>Quick Trade involves predicting short-term price movements within fixed time windows. Additional risks include:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Short Timeframes:</strong> Rounds as short as 1 minute leave minimal time for price analysis, increasing the element of chance.</li>
            <li><strong>Streak Multipliers:</strong> While streak bonuses can amplify winnings, they do not reduce the inherent risk of each individual trade.</li>
            <li><strong>Data Feed Dependency:</strong> Results depend on real-time price data from external sources. Delays or inaccuracies in price feeds may affect outcomes.</li>
            <li><strong>Asset Availability:</strong> Available assets and timeframes may be changed at any time without notice.</li>
          </ul>
        </section>

        <section id="copytrade-risk" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">Copy Trading Risks</h2>
          <p>Copy trading allows you to replicate another user's trades. You should be aware that:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>No Guaranteed Returns:</strong> Past performance of any trader you copy does not guarantee future results.</li>
            <li><strong>Your Responsibility:</strong> You remain fully responsible for all trades executed on your account through copy trading.</li>
            <li><strong>Commission Deduction:</strong> A copy trade commission is deducted from your profits on successful copied trades.</li>
            <li><strong>Execution Differences:</strong> Copied trades may execute at different prices than the original trader's due to timing and liquidity.</li>
          </ul>
        </section>

        <section id="dm-transfer-risk" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">DM Money Transfer Risks</h2>
          <p>The Platform allows direct money transfers between users via DM. You should be aware that:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Irreversible Transfers:</strong> All money transfers sent via DM are <strong>final and non-reversible</strong>. The Platform cannot reverse or refund completed transfers.</li>
            <li><strong>Recipient Verification:</strong> You are solely responsible for verifying the identity of the recipient before sending money. The Platform is not liable for transfers sent to the wrong user.</li>
            <li><strong>Platform Fee:</strong> A fee (percentage set by the System-Mod Engine) is deducted from each transfer. The fee and net amount are displayed before you confirm.</li>
            <li><strong>No Guarantee:</strong> The Platform does not guarantee that the recipient will provide any goods, services, or reciprocal actions in exchange for your transfer.</li>
            <li><strong>Fraud Risk:</strong> Be cautious of social engineering, impersonation, or scam attempts. Never send money to users you do not trust.</li>
          </ul>
        </section>

        <section id="verification-disclaimer" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">Verification Badges</h2>
          <p>Blue Tick and Gold Tick verification badges indicate that a user holds qualifying BC400 tokens and/or NFTs at the time of verification. You should be aware that:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Verification badges are <strong>not endorsements</strong> of a user's trading ability, trustworthiness, or the quality of their market predictions.</li>
            <li>Badge status is based on wallet holdings at the time of verification and may change if a user's holdings change.</li>
            <li>Trending boosts and revenue share bonus benefits associated with verification do not guarantee increased market success or returns.</li>
            <li>Token and NFT requirements for each tier are set by the System-Mod Engine and may be adjusted at any time.</li>
          </ul>
        </section>

        <section id="crypto-risks" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">Cryptocurrency & Blockchain Risks</h2>
          <p>The Platform involves interaction with cryptocurrency and blockchain technology, which carries additional risks:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Cryptocurrency Volatility:</strong> The value of cryptocurrencies used for deposits and withdrawals (including USDT, BNB, and others) can fluctuate significantly.</li>
            <li><strong>Transaction Irreversibility:</strong> Blockchain transactions are final and irreversible once confirmed. Sending funds to an incorrect wallet address may result in permanent loss.</li>
            <li><strong>Network Congestion:</strong> Blockchain network congestion may cause delays in deposit confirmations, withdrawal processing, or transaction failures.</li>
            <li><strong>Smart Contract Risk:</strong> While the Platform references on-chain interactions, any smart contract code is subject to potential vulnerabilities, bugs, or exploits.</li>
            <li><strong>Regulatory Uncertainty:</strong> The legal status of cryptocurrencies and prediction markets varies by jurisdiction and is subject to change.</li>
            <li><strong>Private Key Security:</strong> If you lose access to your wallet's private keys or seed phrase, you may permanently lose access to your connected assets. The Platform cannot recover lost private keys.</li>
          </ul>
        </section>

        <section id="market-resolution" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">Market Creation & Resolution</h2>
          <p>Markets on the Platform are created by users and the System-Mod Engine. You should be aware that:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Resolution criteria are defined at the time of market creation and may be subject to interpretation.</li>
            <li>Markets are resolved by the System-Mod Engine based on publicly available information and the specified resolution source.</li>
            <li>Resolution decisions are final once confirmed. While disputed resolutions are reviewed, the moderation team's determination is binding.</li>
            <li>Markets may be cancelled by the System-Mod Engine at any time, in which case all confirmed positions are refunded.</li>
            <li>Initial trading activity (volume, participant counts) on certain markets may reflect simulated data set during market creation.</li>
          </ul>
        </section>

        <section id="ai-systems" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">AI & Automated Systems</h2>
          <p>The Platform uses AI-powered automated systems for content moderation, market similarity detection, and trending algorithms. These systems:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>May produce false positives or false negatives in content moderation.</li>
            <li>Do not guarantee the accuracy, appropriateness, or safety of all user-generated content.</li>
            <li>Are supplemented by human review but may not catch all violations in real time.</li>
          </ul>
        </section>

        <section id="availability" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">Platform Availability</h2>
          <p>We do not guarantee uninterrupted, continuous, or error-free access to the Platform. Services may be temporarily or permanently unavailable due to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Scheduled or emergency maintenance and updates.</li>
            <li>Server outages, database failures, or infrastructure issues.</li>
            <li>Blockchain network disruptions or third-party service provider failures.</li>
            <li>Distributed denial-of-service attacks or other security incidents.</li>
            <li>Force majeure events (natural disasters, government actions, pandemics).</li>
          </ul>
          <p>We are not liable for any losses, missed opportunities, or damages resulting from Platform downtime, delays, or technical issues.</p>
        </section>

        <section id="third-party" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">Third-Party Services & Content</h2>
          <p>The Platform may integrate with, link to, or reference third-party services, including but not limited to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Cryptocurrency payment processors (NOWPayments).</li>
            <li>Blockchain networks and wallet providers.</li>
            <li>Social media platforms (X/Twitter, Telegram, WhatsApp) for sharing functionality.</li>
            <li>Decentralized exchange interfaces (PancakeSwap) for token acquisition.</li>
            <li>YouTube for embedded video content in market descriptions.</li>
          </ul>
          <p>We do not endorse, control, or assume responsibility for the content, privacy practices, security, or availability of any third-party services. Your use of third-party services is governed by their respective terms and policies.</p>
        </section>

        <section id="regulatory" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">Regulatory Compliance</h2>
          <p>It is your sole responsibility to determine whether your participation in prediction markets complies with all applicable laws, regulations, and restrictions in your jurisdiction. Prediction markets may be restricted, regulated, or prohibited in certain countries, states, or territories.</p>
          <p>By using this Platform, you represent and warrant that you are legally permitted to participate in prediction markets and cryptocurrency transactions in your jurisdiction. OPollMarket does not provide legal advice regarding jurisdictional compliance and is not responsible for any legal consequences arising from your use of the Platform in violation of local laws.</p>
        </section>

        <section id="liability" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">Limitation of Liability</h2>
          <p>To the fullest extent permitted by law, OPollMarket and its operators, affiliates, employees, and agents disclaim all liability for any direct, indirect, incidental, special, consequential, or punitive damages — including loss of profits, data, digital assets, or goodwill — arising from your use of or inability to use the Platform, regardless of the cause of action or the theory of liability.</p>
        </section>

        <p className="text-xs text-muted-foreground/60 pt-4 pb-8">Last updated: March 10, 2026</p>
      </div>
      <BackToTop />
    </div>
  );
};

export default Disclaimer;
