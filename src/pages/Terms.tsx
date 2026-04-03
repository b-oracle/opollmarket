import SEOHead from "@/components/SEOHead";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BackToTop from "@/components/BackToTop";
import LegalTableOfContents from "@/components/LegalTableOfContents";

const tocItems = [
  { id: "acceptance", label: "Acceptance of Terms" },
  { id: "eligibility", label: "Eligibility" },
  { id: "account", label: "Account Registration & Security" },
  { id: "services", label: "Platform Services" },
  { id: "trading", label: "Trading Rules & AMM Pricing" },
  { id: "quicktrade", label: "Quick Trade" },
  { id: "fees", label: "Fees & Commissions" },
  { id: "deposits", label: "Deposits & Withdrawals" },
  { id: "creation", label: "Market Creation & Token-Gating" },
  { id: "verification", label: "Verification Badges" },
  { id: "copytrade", label: "Copy Trading" },
  { id: "dm", label: "Direct Messaging" },
  { id: "spaces", label: "Spaces (Live Rooms)" },
  { id: "social", label: "Stories & Social Features" },
  { id: "kyc", label: "KYC & Identity Verification" },
  { id: "moderation", label: "Content Moderation & Community Guidelines" },
  { id: "resolution", label: "Market Resolution" },
  { id: "boosting", label: "Market Boosting" },
  { id: "referral", label: "Referral Program" },
  { id: "security", label: "Account Security (PIN & TOTP)" },
  { id: "conduct", label: "Prohibited Conduct" },
  { id: "ip", label: "Intellectual Property" },
  { id: "liability", label: "Limitation of Liability" },
  { id: "indemnification", label: "Indemnification" },
  { id: "termination", label: "Termination" },
  { id: "disputes", label: "Dispute Resolution" },
  { id: "law", label: "Governing Law" },
  { id: "severability", label: "Severability" },
  { id: "contact", label: "Contact Information" },
];

const Terms = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
      <SEOHead title="Terms & Conditions – OPollMarket" description="Read the Terms & Conditions governing your use of OPollMarket prediction markets, trading rules, fees, and user responsibilities." path="/terms" />
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-lg md:max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Terms & Conditions</h1>
        </div>
      </div>

      <div className="max-w-lg md:max-w-3xl mx-auto px-4 pt-6 space-y-6 text-sm text-muted-foreground leading-relaxed">
        <LegalTableOfContents items={tocItems} />

        <section id="acceptance" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">1. Acceptance of Terms</h2>
          <p>By accessing, browsing, or using the OPollMarket platform ("Platform"), including all associated features, services, and applications, you acknowledge that you have read, understood, and agree to be bound by these Terms & Conditions ("Terms"). If you do not agree with any part of these Terms, you must immediately discontinue use of the Platform.</p>
          <p>We reserve the right to modify these Terms at any time. Material changes will be communicated via in-app notifications or email. Your continued use of the Platform after such changes constitutes acceptance of the revised Terms. We recommend reviewing these Terms periodically.</p>
        </section>

        <section id="eligibility" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">2. Eligibility</h2>
          <p>You must be at least 18 years of age (or the age of majority in your jurisdiction, whichever is greater) to use the Platform. By creating an account, you represent and warrant that:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>You meet the minimum age requirement.</li>
            <li>All registration information you provide is truthful, accurate, and complete.</li>
            <li>Your use of the Platform does not violate any applicable law or regulation in your jurisdiction.</li>
            <li>You are not located in, or a resident of, any jurisdiction where prediction market participation is prohibited or restricted.</li>
            <li>You are not on any sanctions list or otherwise prohibited from engaging in financial transactions.</li>
          </ul>
        </section>

        <section id="account" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">3. Account Registration & Security</h2>
          <p>To access certain features, you must create an account using your email address or through a supported third-party authentication provider (Google, Apple). You may also connect an EVM-compatible cryptocurrency wallet (e.g., MetaMask, Trust Wallet, SafePal, Coinbase Wallet, Rabby, Binance Wallet, Bitget Wallet) for specific platform functions.</p>
          <p>You are solely responsible for:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Maintaining the confidentiality of your login credentials and wallet private keys.</li>
            <li>All activities that occur under your account, whether authorized or not.</li>
            <li>Notifying us immediately of any unauthorized access or security breach.</li>
          </ul>
          <p>We are not liable for losses resulting from unauthorized account access, compromised wallets, or failure to maintain adequate security measures. Creating multiple accounts to circumvent restrictions, manipulate markets, or abuse platform features is strictly prohibited.</p>
        </section>

        <section id="services" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">4. Platform Services</h2>
          <p>OPollMarket provides a peer-to-peer prediction market platform where users can:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Trade predictions</strong> on binary (Yes/No), multiple-choice, and range-bracket markets using an Automated Market Maker (AMM) pricing mechanism.</li>
            <li><strong>Quick Trade</strong> on short-term price prediction rounds for assets including cryptocurrencies, commodities, and forex pairs with configurable timeframes.</li>
            <li><strong>Create markets</strong> by proposing prediction questions, providing initial liquidity, and defining clear resolution criteria.</li>
            <li><strong>Copy trade</strong> by following successful traders and automatically replicating their predictions and Quick Trades.</li>
            <li><strong>Earn verification badges</strong> (Blue Tick, Gold Tick) by holding qualifying BC400 tokens and/or NFTs, unlocking benefits such as trending boosts and revenue share bonus.</li>
            <li><strong>Boost markets</strong> to increase visibility through paid promotional tiers.</li>
            <li><strong>Engage socially</strong> by commenting on markets, liking content, bookmarking markets, following users, and sharing via integrated social channels (X/Twitter, Telegram, WhatsApp).</li>
            <li><strong>Participate in a referral program</strong> to earn bonus rewards for introducing new users.</li>
            <li><strong>View real-time data</strong> including order book depth, price history charts, live trade feeds, and live sports scores.</li>
          </ul>
        </section>

        <section id="trading" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">5. Trading Rules & AMM Pricing</h2>
          <p>All trades on the Platform are executed through an Automated Market Maker (AMM) using a constant-product formula. By placing a trade, you acknowledge and agree that:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>All trades are final once confirmed and cannot be reversed, cancelled, or refunded.</li>
            <li>Market prices are dynamically determined by supply, demand, and available liquidity — not by the Platform.</li>
            <li>Order book depth levels displayed are derived from the AMM formula and represent potential liquidity, not traditional limit orders.</li>
            <li><strong>Limit Orders:</strong> Users may place limit orders specifying a target price. Limit orders are matched automatically when market conditions meet the specified price. Unfilled or partially filled limit orders may be cancelled by the user. Limit order matching is not guaranteed and depends on market activity.</li>
            <li>Slippage may occur, and the execution price may differ from the displayed price at the time of order placement.</li>
            <li><strong>Early Exit:</strong> Users may sell their positions before market resolution. An early exit fee (percentage set by the System-Mod Engine) is deducted from the sale proceeds and returned to the market pool.</li>
            <li>The Platform does not guarantee any particular outcome, return, or profit.</li>
            <li>Past market performance is not indicative of future results.</li>
          </ul>
        </section>

        <section id="quicktrade" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">5b. Quick Trade</h2>
          <p>Quick Trade allows users to predict short-term price movements of assets (cryptocurrencies, commodities, forex) within fixed time windows. By participating in Quick Trade, you agree that:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Each Quick Trade round has a fixed duration (e.g., 1, 3, 5, or 15 minutes) set by the Platform.</li>
            <li>You predict whether the asset price will go <strong>UP</strong> or <strong>DOWN</strong> during the round.</li>
            <li>Winning payouts are calculated based on the total pool minus the Platform fee, distributed proportionally to winners.</li>
            <li>A <strong>streak multiplier</strong> system rewards consecutive winning trades with bonus multipliers on payouts.</li>
            <li>Minimum and maximum trade amounts are configurable by the System-Mod Engine and displayed within the Platform.</li>
            <li>Available assets and timeframes may be enabled or disabled at any time by the System-Mod Engine.</li>
            <li>Quick Trade results are determined by real-time market prices from external data sources. The Platform is not responsible for data feed delays or inaccuracies.</li>
          </ul>
        </section>

        <section id="fees" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">6. Fees & Commissions</h2>
          <p>The Platform charges the following fees, which are subject to change with notice:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Platform Fee:</strong> A percentage commission is deducted from winning payouts upon market resolution. The current fee structure (platform fee and creator fee percentages) is displayed within the Platform.</li>
            <li><strong>Early Exit Fee:</strong> Selling a position before market resolution incurs an early exit fee (percentage configurable by the System-Mod Engine). The exit fee is deducted from sale proceeds and returned to the market liquidity pool, increasing potential payouts for remaining participants.</li>
            <li><strong>Market Creation Fee:</strong> Users who do not meet token-gating requirements (BC400 token holding or NFT ownership) may create markets by paying a flat creation fee. This fee is <strong>non-refundable</strong> if the market is rejected for content violations. It is refundable only if the market is cancelled by the System-Mod Engine before approval.</li>
            <li><strong>Market Boost Fee:</strong> Optional paid promotion fees vary by tier (Silver, Gold, Diamond) and duration.</li>
          </ul>
          <p className="font-medium text-foreground">Referral Bonus as Fee Credit:</p>
          <p>Referral bonus rewards credited to your account are designated exclusively as <strong>fee credits</strong>. When any fee is charged (platform fee, exit fee, or market creation fee), the Platform will automatically apply your available referral bonus balance to offset those fees before deducting from your main balance. Referral bonus cannot be used to fund trade principal, deposits, or withdrawals — only to cover Platform fees.</p>
          <p>All fee amounts and percentages are managed centrally and may be adjusted by the System-Mod Engine. Current rates are always visible within the Platform interface.</p>
        </section>

        <section id="deposits" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">7. Deposits & Withdrawals</h2>
          <p>The Platform supports cryptocurrency deposits and withdrawals processed through integrated payment providers (NOWPayments). By using these services, you agree that:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Deposits are credited to your Platform balance upon blockchain confirmation.</li>
            <li>Withdrawal requests are subject to review and processing times.</li>
            <li>Network fees, gas costs, and third-party processing fees are borne by the user.</li>
            <li>The Platform is not responsible for delays, errors, or losses caused by blockchain network congestion, incorrect wallet addresses, or third-party payment processor issues.</li>
            <li>Minimum withdrawal amounts and supported cryptocurrencies are displayed within the Platform.</li>
          </ul>
        </section>

        <section id="creation" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">8. Market Creation & Token-Gating</h2>
          <p>Market creation access is determined by a tiered verification system:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Verified Creators:</strong> Users who hold a minimum balance of BC400 tokens (as configured by the System-Mod Engine) or own a qualifying BC400 NFT may create markets without additional fees.</li>
            <li><strong>Fee-Based Creators:</strong> Users who do not meet token-gating requirements may create markets by paying a market creation fee. Fee-based markets require System-Mod Engine approval before going live.</li>
            <li><strong>First Prediction Requirement:</strong> Market creators must place a minimum $5 prediction on their own market after creation to make it officially public. This records initial volume and trading activity.</li>
          </ul>
          <p>All market creators must provide clear, unambiguous resolution criteria and a resolution source. The Platform reserves the right to approve, reject, modify, or cancel any market at its sole discretion.</p>
        </section>

        <section id="verification" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">8b. Verification Badges (Blue Tick & Gold Tick)</h2>
          <p>The Platform offers a tiered verification badge system that recognizes users who hold qualifying BC400 tokens and/or NFTs:</p>
          <p className="font-medium text-foreground">Blue Tick (Blue Verified)</p>
          <p>A user qualifies for the Blue Tick by meeting <strong>at least one</strong> of the following:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Holding the minimum BC400 token balance for the Blue tier (threshold configured by the System-Mod Engine and displayed in the Platform).</li>
            <li>Holding a qualifying BC400 NFT <strong>and</strong> using that NFT as their profile avatar.</li>
          </ul>
          <p className="font-medium text-foreground mt-2">Gold Tick (Gold Verified)</p>
          <p>A user qualifies for the Gold Tick by meeting <strong>both</strong> of the following:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Holding the minimum BC400 token balance for the Gold tier (a higher threshold than Blue, configured by the System-Mod Engine).</li>
            <li>Holding a qualifying BC400 NFT <strong>and</strong> using that NFT as their profile avatar.</li>
          </ul>
          <p className="font-medium text-foreground mt-2">Verification Benefits</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Trending Boost:</strong> Markets created by verified users receive a trending score multiplier (higher for Gold than Blue), increasing their visibility in trending rankings.</li>
            <li><strong>Revenue Share Bonus:</strong> Verified creators may receive an additional bonus percentage on top of their standard creator fee from their own resolved markets, distributed as bonus balance. Percentages differ by tier and are configurable by the System-Mod Engine.</li>
            <li><strong>Creator Badge:</strong> A "CREATOR" badge is displayed on verified users' profiles.</li>
            <li><strong>Visual Badge:</strong> Blue and Gold verification ticks are displayed across profiles, rankings, followers lists, comments, and social feeds.</li>
          </ul>
          <p>Token and NFT requirements are verified automatically by checking connected wallet balances. Verification levels may be refreshed at any time by the user or in bulk by the System-Mod Engine. The System-Mod Engine reserves the right to modify thresholds, benefits, and eligibility criteria at any time.</p>
        </section>

        <section id="copytrade" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">8c. Copy Trading</h2>
          <p>The Platform offers a copy trading feature that allows users to follow and replicate the trades of other users. By using copy trading, you agree that:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>You may configure copy settings per trader, including maximum copy amount, and whether to copy predictions, Quick Trades, or both.</li>
            <li><strong>Manual copy trades</strong> require your approval before execution within a time-limited window. Trades not approved within the window expire automatically.</li>
            <li><strong>Auto-copy trades</strong> (when enabled) are executed automatically without confirmation.</li>
            <li>A <strong>copy trade commission</strong> (percentage set by the System-Mod Engine) is deducted from the copier's profit and credited to the original trader when a copied trade wins.</li>
            <li>Copy trading does not guarantee profits. You remain solely responsible for all trades executed on your account, whether initiated manually or via copy trading.</li>
            <li>The Platform is not responsible for losses incurred through copy trading.</li>
          </ul>
        </section>

        <section id="moderation" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">9. Content Moderation & Community Guidelines</h2>
          <p>All user-generated content — including market titles, descriptions, answer options, cover images, comments, display names, and avatars — is subject to automated AI moderation and manual review by the System-Mod Engine. Content that violates community guidelines will be removed or flagged.</p>
          <p className="font-medium text-foreground">Prohibited content includes but is not limited to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Profane, obscene, or vulgar language.</li>
            <li>Nudity, sexually explicit, or graphic violent imagery.</li>
            <li>Hate speech, discrimination, or incitement to violence.</li>
            <li>Personally identifiable information of third parties without consent.</li>
            <li>Spam, misleading information, or fraudulent content.</li>
            <li>Content that promotes illegal activities.</li>
          </ul>
          <p className="font-medium text-foreground">Fee Forfeiture Policy:</p>
          <p>If a market created via the fee-based pathway is <strong>rejected</strong> due to content moderation violations, the market creation fee is <strong>permanently forfeited and non-refundable</strong>. Only the initial liquidity deposit will be returned to the creator's balance. If a market is <strong>cancelled</strong> by the System-Mod Engine (for reasons other than content violations), both the creation fee and initial liquidity are refunded. Repeated violations may result in temporary suspension or permanent ban from the Platform.</p>
        </section>

        <section id="resolution" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">10. Market Resolution</h2>
          <p>Markets are resolved by the System-Mod Engine based on the resolution criteria and source specified at the time of market creation. Resolution follows these principles:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Winning shares pay out at $1.00 per share, less applicable platform and creator fees.</li>
            <li>Losing shares expire worthless with no payout.</li>
            <li>For multiple-choice markets, the winning option is determined by the System-Mod Engine and all other options are treated as losing.</li>
            <li>Resolution decisions are final once confirmed. Disputed resolutions are reviewed by the moderation team.</li>
            <li>Cancelled markets result in full refund of all confirmed position amounts to respective user balances.</li>
          </ul>
        </section>

        <section id="boosting" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">11. Market Boosting</h2>
          <p>Users may purchase promotional boosts to increase market visibility. Boost purchases are processed via cryptocurrency payment and are subject to confirmation by the System-Mod Engine. Boost durations and pricing are determined by the selected tier. Boost fees are non-refundable once the boost period has commenced.</p>
        </section>

        <section id="referral" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">12. Referral Program</h2>
          <p>The Platform offers a referral program where existing users may invite new users using their display name as a referral code. Upon a referred user's first qualifying trade (buy), the referrer receives a bonus reward credited to their <strong>bonus balance</strong>. Referral rewards are subject to the following conditions:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Only one referral reward is issued per referred user.</li>
            <li>Bonus rewards are classified as <strong>fee credits only</strong> — they can only be used to offset Platform fees (trading fees, exit fees, market creation fees) and cannot be withdrawn, transferred, or used to fund trade principal.</li>
            <li>When a fee is charged, the Platform automatically prioritizes the bonus balance before deducting from the main balance.</li>
            <li>Self-referrals, fraudulent referrals, or referral manipulation schemes are prohibited and may result in forfeiture of rewards and account suspension.</li>
            <li>Reward amounts are set by the Platform and may be adjusted at any time.</li>
          </ul>
        </section>

        <section id="conduct" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">14. Account Security (PIN & TOTP)</h2>
          <p>The Platform offers optional security features to protect your account:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Security PIN:</strong> A 6-digit PIN that can be required for login and/or withdrawal actions.</li>
            <li><strong>TOTP (Time-based One-Time Password):</strong> Two-factor authentication using authenticator apps (e.g., Google Authenticator) for additional login and withdrawal security.</li>
          </ul>
          <p>You are solely responsible for keeping your PIN and TOTP secret secure. The Platform cannot recover lost PINs or TOTP secrets. In exceptional circumstances, the System-Mod Engine may reset security settings upon identity verification.</p>
        </section>

        <section id="conduct" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">15. Prohibited Conduct</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Use the Platform for money laundering, terrorist financing, or other illegal activities.</li>
            <li>Attempt to manipulate market outcomes through wash trading, coordinated trading, insider information, or exploitation of system vulnerabilities.</li>
            <li>Create multiple accounts to circumvent restrictions, abuse promotions, or inflate referral rewards.</li>
            <li>Use automated bots, scripts, or tools to interact with the Platform without prior written authorization.</li>
            <li>Harass, threaten, defame, or abuse other users through comments or any communication channel.</li>
            <li>Interfere with the Platform's operation, security, or infrastructure.</li>
            <li>Reverse-engineer, decompile, or attempt to extract the source code of the Platform.</li>
            <li>Submit false, misleading, or fraudulent market proposals or resolution claims.</li>
            <li>Circumvent or attempt to circumvent content moderation, token-gating, verification badge requirements, or any other access control mechanism.</li>
            <li>Abuse the copy trading system to artificially generate commissions or manipulate trading patterns.</li>
          </ul>
        </section>

        <section id="ip" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">14. Intellectual Property</h2>
          <p>All content, branding, trademarks, logos, software, and technology on the Platform (collectively, "Platform IP") are the exclusive property of OPollMarket or its licensors. You may not reproduce, distribute, modify, or create derivative works of Platform IP without explicit written permission.</p>
          <p>By submitting user-generated content (comments, market proposals, images), you grant OPollMarket a non-exclusive, worldwide, royalty-free, perpetual license to display, distribute, and use such content in connection with Platform operations.</p>
        </section>

        <section id="liability" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">15. Limitation of Liability</h2>
          <p>To the maximum extent permitted by applicable law:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>The Platform is provided on an "AS IS" and "AS AVAILABLE" basis without warranties of any kind, express or implied.</li>
            <li>We do not warrant that the Platform will be uninterrupted, error-free, secure, or free of viruses or harmful components.</li>
            <li>We shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Platform, including but not limited to loss of profits, data, or digital assets.</li>
            <li>Our total aggregate liability for all claims shall not exceed the total fees paid by you to the Platform in the twelve (12) months preceding the claim.</li>
            <li>We are not liable for losses caused by blockchain network failures, smart contract vulnerabilities, third-party payment processor errors, or events beyond our reasonable control.</li>
          </ul>
        </section>

        <section id="indemnification" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">16. Indemnification</h2>
          <p>You agree to indemnify, defend, and hold harmless OPollMarket, its operators, affiliates, directors, officers, employees, and agents from any and all claims, liabilities, damages, losses, costs, and expenses (including reasonable legal fees) arising from: (a) your use of the Platform; (b) your violation of these Terms; (c) your violation of any third-party rights; or (d) any content you submit to the Platform.</p>
        </section>

        <section id="termination" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">17. Termination</h2>
          <p>We reserve the right to suspend or terminate your account at any time, with or without notice, for violation of these Terms, suspected fraudulent activity, or for any other reason at our sole discretion. Upon termination:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Your right to access and use the Platform ceases immediately.</li>
            <li>Outstanding balances will be handled in accordance with our withdrawal policies, subject to any applicable holds or legal requirements.</li>
            <li>Provisions that by their nature should survive termination (including Limitation of Liability, Indemnification, and Intellectual Property) shall remain in effect.</li>
          </ul>
        </section>

        <section id="disputes" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">18. Dispute Resolution</h2>
          <p>Any dispute arising from or relating to these Terms or the Platform shall first be attempted to be resolved through good-faith negotiation between the parties. If negotiation fails, disputes shall be resolved through binding arbitration in accordance with the rules of the jurisdiction in which OPollMarket is incorporated, unless otherwise required by applicable consumer protection laws.</p>
        </section>

        <section id="law" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">19. Governing Law</h2>
          <p>These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which OPollMarket operates, without regard to conflict of law principles. You consent to the exclusive jurisdiction of the courts in that jurisdiction for any legal proceedings.</p>
        </section>

        <section id="severability" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">20. Severability</h2>
          <p>If any provision of these Terms is found to be invalid, illegal, or unenforceable by a court of competent jurisdiction, such provision shall be modified to the minimum extent necessary to make it enforceable, and the remaining provisions shall continue in full force and effect.</p>
        </section>

        <section id="contact" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">21. Contact Information</h2>
          <p>For questions, concerns, or requests relating to these Terms, please contact us through the Platform's support channels or via the contact information provided in the application.</p>
        </section>

        <p className="text-xs text-muted-foreground/60 pt-4 pb-8">Last updated: March 10, 2026</p>
      </div>
      <BackToTop />
    </div>
  );
};

export default Terms;
