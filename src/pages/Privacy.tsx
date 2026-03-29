import SEOHead from "@/components/SEOHead";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BackToTop from "@/components/BackToTop";
import LegalTableOfContents from "@/components/LegalTableOfContents";

const tocItems = [
  { id: "introduction", label: "Introduction" },
  { id: "info-collect", label: "Information We Collect" },
  { id: "how-use", label: "How We Use Your Information" },
  { id: "ai-processing", label: "AI & Automated Processing" },
  { id: "data-sharing", label: "Data Sharing & Disclosure" },
  { id: "blockchain-data", label: "Blockchain Data & Public Information" },
  { id: "data-security", label: "Data Security" },
  { id: "cookies", label: "Cookies & Local Storage" },
  { id: "your-rights", label: "Your Rights" },
  { id: "data-retention", label: "Data Retention" },
  { id: "international", label: "International Data Transfers" },
  { id: "children", label: "Children's Privacy" },
  { id: "changes", label: "Changes to This Policy" },
  { id: "contact", label: "Contact Us" },
];

const Privacy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
      <SEOHead title="Privacy Policy – OPollMarket" description="Learn how OPollMarket collects, uses, and protects your personal data. Our privacy policy covers data security, cookies, and your rights." path="/privacy" />
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-lg md:max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Privacy Policy</h1>
        </div>
      </div>

      <div className="max-w-lg md:max-w-3xl mx-auto px-4 pt-6 space-y-6 text-sm text-muted-foreground leading-relaxed">
        <LegalTableOfContents items={tocItems} />

        <section id="introduction" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">1. Introduction</h2>
          <p>OPollMarket ("we," "us," "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, store, share, and protect your personal information when you use the OPollMarket platform ("Platform"), including our website, mobile applications, and all related services.</p>
          <p>By using the Platform, you consent to the data practices described in this policy. If you do not agree with this policy, please do not use the Platform.</p>
        </section>

        <section id="info-collect" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">2. Information We Collect</h2>
          <p className="font-medium text-foreground">2.1 Information You Provide Directly</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Account Information:</strong> Email address, display name, and profile avatar when you register an account.</li>
            <li><strong>Authentication Data:</strong> Credentials from third-party OAuth providers (Google, Apple) if you choose to sign in via social login. We receive only the data necessary for authentication (email, name, profile picture).</li>
            <li><strong>Wallet Information:</strong> Public blockchain wallet addresses you connect to the Platform (e.g., MetaMask, Trust Wallet, SafePal, Coinbase Wallet, Rabby, Binance Wallet, Bitget Wallet). We never request or store your private keys or seed phrases.</li>
            <li><strong>User-Generated Content:</strong> Market proposals, comments, display names, and uploaded images (market covers, profile avatars).</li>
            <li><strong>Financial Information:</strong> Transaction amounts, trade details, deposit/withdrawal data, referral information, bonus balance usage, limit order history, exit fee records, Quick Trade round history, and copy trade settings.</li>
            <li><strong>Security Settings:</strong> Security PIN preferences and TOTP enrollment status (we never store plaintext PINs or TOTP secrets in reversible form).</li>
            <li><strong>Communication Data:</strong> Any information you provide when contacting support or submitting feedback.</li>
          </ul>

          <p className="font-medium text-foreground mt-3">2.2 Information Collected Automatically</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Analytics Events:</strong> We track in-app events such as page views, trade actions, feature interactions, and terms acceptance using our internal analytics system. Events may be associated with your user ID or stored anonymously.</li>
            <li><strong>Device & Technical Data:</strong> Browser type and version, operating system, device type, screen resolution, language preferences, and referring URLs.</li>
            <li><strong>Usage Data:</strong> Pages visited, features used, click patterns, session duration, and navigation paths.</li>
            <li><strong>Network Data:</strong> IP address, approximate geographic location (country/region level), and internet service provider.</li>
          </ul>

          <p className="font-medium text-foreground mt-3">2.3 Information from Third Parties</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Blockchain Data:</strong> Publicly available on-chain data including token balances, NFT ownership, and transaction histories associated with wallet addresses you connect.</li>
            <li><strong>Payment Processors:</strong> Transaction confirmation data from integrated payment providers (e.g., NOWPayments) for deposit and withdrawal processing.</li>
          </ul>
        </section>

        <section id="how-use" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">3. How We Use Your Information</h2>
          <p>We process your information for the following purposes:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Service Delivery:</strong> To create and maintain your account, execute trades, process deposits and withdrawals, manage Quick Trade rounds, and provide core Platform functionality.</li>
            <li><strong>Token-Gate & Verification:</strong> To verify BC400 token balances and NFT ownership for market creation eligibility and verification badge assignment (Blue Tick and Gold Tick) using connected wallet addresses.</li>
            <li><strong>Content Moderation:</strong> User-generated content (market titles, descriptions, images, comments, display names) is processed by automated AI moderation systems to enforce community guidelines and platform safety.</li>
            <li><strong>Market Operations:</strong> To calculate AMM prices, process market resolutions, compute payouts, and manage liquidity pools.</li>
            <li><strong>Copy Trading:</strong> To manage copy trade subscriptions, execute replicated trades, and calculate copy trade commissions.</li>
            <li><strong>Fraud Prevention:</strong> To detect, investigate, and prevent fraudulent activities, market manipulation, wash trading, and unauthorized account access.</li>
            <li><strong>Communications:</strong> To send in-app notifications, push notifications, and Telegram alerts about market resolutions, payouts, referral rewards, copy trade actions, follower activity, and important platform updates.</li>
            <li><strong>Analytics & Improvement:</strong> To analyze usage patterns, optimize Platform performance, identify popular features, and improve user experience through aggregated and anonymized data analysis.</li>
            <li><strong>Legal Compliance:</strong> To comply with applicable laws, regulations, legal processes, or governmental requests.</li>
            <li><strong>Referral Program:</strong> To track referral relationships, verify eligibility, distribute referral bonus rewards, and apply bonus balance as fee credits.</li>
            <li><strong>Limit Order Processing:</strong> To manage, match, and execute limit orders based on market price movements.</li>
            <li><strong>Verification System:</strong> To assess and assign verification badge levels (Blue/Gold) based on token holdings and NFT ownership, and to calculate associated benefits such as trending multipliers and revenue share bonus.</li>
          </ul>
        </section>

        <section id="ai-processing" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">4. AI & Automated Processing</h2>
          <p>The Platform employs AI-powered automated systems for the following purposes:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Content Moderation:</strong> Market submissions, comments, display names, and uploaded images are screened by AI models (Google Gemini) for policy compliance. Flagged content is logged for review by the System-Mod Engine.</li>
            <li><strong>Market Similarity Detection:</strong> New market proposals are compared against existing markets using AI to identify potential duplicates.</li>
            <li><strong>Trending Calculation:</strong> Automated scoring algorithms analyze volume, participation, recent activity, comments, and likes to identify trending markets. Verified users (Blue/Gold Tick holders) receive trending score multipliers configured by the System-Mod Engine.</li>
            <li><strong>FAQ AI Assistant:</strong> The Platform provides an AI-powered FAQ search that processes user questions to generate contextual answers about platform features.</li>
          </ul>
          <p>Automated moderation decisions that result in content rejection or account restrictions are subject to human review upon request. Moderation logs are retained for accountability and dispute resolution purposes.</p>
        </section>

        <section id="data-sharing" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">5. Data Sharing & Disclosure</h2>
          <p><strong>We do not sell, rent, or trade your personal data to third parties for marketing purposes.</strong></p>
          <p>We may share your information in the following circumstances:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Service Providers:</strong> With trusted third-party providers who assist in operating the Platform (payment processing, cloud hosting, analytics, AI moderation). These providers are contractually bound to process data only as instructed and maintain appropriate security measures.</li>
            <li><strong>Blockchain Networks:</strong> Trade transactions and wallet interactions are broadcast to public blockchain networks. This data is inherently public and immutable.</li>
            <li><strong>Legal Requirements:</strong> When required by law, subpoena, court order, or governmental regulation, or when we believe in good faith that disclosure is necessary to protect our rights, your safety, or the safety of others.</li>
            <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, reorganization, or sale of assets, your information may be transferred to the acquiring entity, subject to the same privacy protections described herein.</li>
            <li><strong>With Your Consent:</strong> We may share information in other ways if you specifically consent to such sharing.</li>
          </ul>
        </section>

        <section id="blockchain-data" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">6. Blockchain Data & Public Information</h2>
          <p>You acknowledge that:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Blockchain transactions are publicly visible, permanently recorded, and immutable. We cannot delete, modify, or redact blockchain data once a transaction is confirmed.</li>
            <li>Your connected wallet address and associated on-chain transaction history are inherently public information.</li>
            <li>Trade activity on the Platform (side, amount, price) is visible to all users through the order book and recent trades feed as part of market transparency.</li>
            <li>Comments, display names, and market proposals you submit are publicly visible on the Platform.</li>
          </ul>
        </section>

        <section id="data-security" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">7. Data Security</h2>
          <p>We implement industry-standard technical and organizational measures to protect your information, including:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Encryption of data in transit (TLS/SSL) and at rest.</li>
            <li>Secure authentication protocols with password hashing and session management.</li>
            <li>Row-Level Security (RLS) policies ensuring users can only access their own data.</li>
            <li>Role-based access controls for system-mod functions.</li>
            <li>Regular security reviews and vulnerability assessments.</li>
            <li>Secure storage of uploaded files in isolated, access-controlled storage buckets.</li>
          </ul>
          <p>Despite these measures, no system is 100% secure. We cannot guarantee absolute security of your data. You are responsible for maintaining the security of your account credentials and connected wallets.</p>
        </section>

        <section id="cookies" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">8. Cookies & Local Storage</h2>
          <p>The Platform uses the following browser storage technologies:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Essential Cookies & Session Storage:</strong> To maintain your authentication session, remember your theme preference (light/dark mode), and store temporary state necessary for Platform operation.</li>
            <li><strong>Local Storage:</strong> To cache user preferences, terms acceptance status, and application state for improved performance.</li>
            <li><strong>Analytics:</strong> Our internal analytics system records usage events to improve the Platform. We do not use third-party advertising trackers or cross-site tracking cookies.</li>
          </ul>
          <p>You can control cookie settings through your browser. Disabling essential cookies may prevent you from using certain Platform features.</p>
        </section>

        <section id="your-rights" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">9. Your Rights</h2>
          <p>Depending on your jurisdiction (including under GDPR, CCPA, and similar regulations), you may have the following rights regarding your personal data:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Right of Access:</strong> Request a copy of the personal data we hold about you.</li>
            <li><strong>Right of Rectification:</strong> Request correction of inaccurate or incomplete data.</li>
            <li><strong>Right of Erasure:</strong> Request deletion of your personal data, subject to legal retention requirements and the immutability of blockchain data.</li>
            <li><strong>Right to Restrict Processing:</strong> Request that we limit how we process your data in certain circumstances.</li>
            <li><strong>Right to Data Portability:</strong> Request your data in a structured, commonly used, machine-readable format.</li>
            <li><strong>Right to Object:</strong> Object to processing of your data for certain purposes, including automated decision-making.</li>
            <li><strong>Right to Withdraw Consent:</strong> Where processing is based on consent, you may withdraw consent at any time without affecting the lawfulness of prior processing.</li>
            <li><strong>Right to Non-Discrimination (CCPA):</strong> We will not discriminate against you for exercising your privacy rights.</li>
          </ul>
          <p>To exercise any of these rights, contact us through the Platform's support channels. We will respond within the timeframe required by applicable law (typically 30 days). Identity verification may be required before processing requests.</p>
        </section>

        <section id="data-retention" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">10. Data Retention</h2>
          <p>We retain your personal data according to the following principles:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Active Accounts:</strong> Data is retained for as long as your account remains active.</li>
            <li><strong>Financial Records:</strong> Transaction records, trade history, and deposit/withdrawal logs are retained for a minimum of 5 years for regulatory compliance and audit purposes.</li>
            <li><strong>Moderation Logs:</strong> Content moderation records are retained for accountability and dispute resolution for a minimum of 2 years.</li>
            <li><strong>Analytics Data:</strong> Anonymized and aggregated analytics data may be retained indefinitely for trend analysis and Platform improvement.</li>
            <li><strong>Account Deletion:</strong> Upon account deletion request, personal identifiers are removed or anonymized. Blockchain data and transaction records required for legal compliance are retained as permitted by law.</li>
          </ul>
        </section>

        <section id="international" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">11. International Data Transfers</h2>
          <p>Your data may be processed and stored in jurisdictions outside your country of residence where our servers and service providers are located. We ensure appropriate safeguards are in place for international data transfers, including standard contractual clauses and data processing agreements that comply with applicable data protection regulations.</p>
        </section>

        <section id="children" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">12. Children's Privacy</h2>
          <p>The Platform is not intended for users under 18 years of age. We do not knowingly collect personal information from minors. If we become aware that a user under 18 has created an account or provided personal data, we will take prompt steps to delete the account and associated information. If you believe a minor has provided us with personal data, please contact us immediately.</p>
        </section>

        <section id="changes" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">13. Changes to This Policy</h2>
          <p>We may update this Privacy Policy periodically to reflect changes in our practices, legal requirements, or Platform features. Material changes will be communicated through:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>In-app notifications or banners.</li>
            <li>Email notification to the address associated with your account.</li>
            <li>Updated "Last updated" date at the bottom of this policy.</li>
          </ul>
          <p>Your continued use of the Platform after changes take effect constitutes acceptance of the updated policy. We encourage you to review this policy periodically.</p>
        </section>

        <section id="contact" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">14. Contact Us</h2>
          <p>If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us through the Platform's support channels or via the contact information provided in the application. We aim to respond to all inquiries within 30 days.</p>
        </section>

        <p className="text-xs text-muted-foreground/60 pt-4 pb-8">Last updated: March 10, 2026</p>
      </div>
      <BackToTop />
    </div>
  );
};

export default Privacy;
