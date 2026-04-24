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
  { id: "dm-messaging", label: "Direct Messaging & Money Transfers" },
  { id: "dm-calls", label: "Voice & Video Calls" },
  { id: "communities", label: "Community Chats" },
  { id: "support-chat", label: "In-App Support" },
  { id: "spaces-social", label: "Spaces, Stories & Social" },
  { id: "kyc-data", label: "KYC & Identity Verification Data" },
  { id: "data-sharing", label: "Data Sharing & Disclosure" },
  { id: "blockchain-data", label: "Blockchain Data & Public Information" },
  { id: "data-security", label: "Data Security" },
  { id: "push-notifications", label: "Push Notifications" },
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
    <div className="min-h-screen bg-background text-foreground" style={{ paddingBottom: 'calc(1rem + var(--content-bottom))' }}>
      <SEOHead title="Privacy Policy – OPollMarket" description="Learn how OPollMarket collects, uses, and protects your personal data. Our privacy policy covers data security, cookies, and your rights." path="/privacy" />
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border" style={{ paddingTop: 'var(--safe-top)' }}>
        <div className="max-w-lg md:max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Privacy Policy</h1>
        </div>
      </div>

      <div className="max-w-lg md:max-w-3xl mx-auto px-4 pt-6 space-y-6 text-sm text-muted-foreground leading-relaxed">
        {/* At-a-glance summary (matches /data-use disclosure required by Google verification) */}
        <section
          id="at-a-glance"
          aria-label="Privacy at a glance"
          className="rounded-2xl border border-primary/30 bg-primary/5 p-5 space-y-3 scroll-mt-20"
        >
          <h2 className="text-base font-bold text-foreground">Privacy at a glance</h2>
          <p className="text-foreground/90">
            OPollMarket collects only the data needed to run the features you use. We <strong>never sell</strong> your
            personal information. Sensitive permissions (microphone, camera, location, contacts, notifications) are
            requested only when you tap to use that specific feature, and you can revoke them any time from your device
            settings.
          </p>
          <div className="grid sm:grid-cols-2 gap-3 pt-1">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-foreground mb-1">What we collect</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Account info (email, display name, optional avatar)</li>
                <li>Trades, balances, deposits and withdrawals</li>
                <li>Messages, posts, calls and Spaces you join</li>
                <li>KYC documents (only if you choose to verify)</li>
                <li>Device, IP and analytics data for security</li>
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-foreground mb-1">Why we use it</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Sign you in and keep your account secure</li>
                <li>Execute trades and process payments</li>
                <li>Deliver messages, notifications and live audio</li>
                <li>Comply with anti-fraud and AML obligations</li>
                <li>Improve performance and fix bugs</li>
              </ul>
            </div>
          </div>
          <p className="pt-1">
            For a plain-English breakdown of every permission and purpose, see{" "}
            <a href="/data-use" className="text-primary font-semibold underline">How We Use Your Data</a>.
          </p>
        </section>

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
            <li><strong>Financial Information:</strong> Transaction amounts, trade details, deposit/withdrawal data, referral information, bonus balance usage, limit order history, exit fee records, Quick Trade round history, copy trade settings, and DM money transfer records.</li>
            <li><strong>Direct Messages:</strong> Message content, gift emoji selections, gift amounts, money transfer amounts, and conversation metadata exchanged through the Platform's direct messaging feature.</li>
            <li><strong>Voice & Video Calls:</strong> Call metadata including caller/callee identifiers, call duration, timestamps, and call status. Audio/video streams are not recorded by the Platform.</li>
            <li><strong>Community Chat Data:</strong> Messages, images, reactions, and tagged market references shared in community chat rooms.</li>
            <li><strong>Support Chat Data:</strong> Messages exchanged with support, including AI auto-reply interactions and uploaded images for issue documentation.</li>
            <li><strong>KYC Documents:</strong> Full name, date of birth, phone number, selfie photographs, government-issued identification (front/back), proof of address, and utility bills submitted for identity verification.</li>
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
            <li><strong>Payment Processors:</strong> Transaction confirmation data from integrated payment providers (e.g., NOWPayments, Payaza, Flutterwave) for deposit and withdrawal processing.</li>
            <li><strong>KYC Device Fingerprinting:</strong> During KYC submission, we collect device data including IP address, user agent, screen dimensions, device pixel ratio, platform, language, and timezone for fraud prevention.</li>
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

        <section id="dm-messaging" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">5. Direct Messaging & Money Transfers</h2>
          <p>The Platform provides a direct messaging feature restricted to mutual follows. By using direct messaging, you acknowledge that:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Message Content:</strong> Message text, gift emojis, gift amounts, and money transfer amounts are stored in our database and associated with your user ID and conversation.</li>
            <li><strong>Money Transfers:</strong> When you send money directly in a DM, the transfer amount, fee, sender, and recipient are logged as financial transactions for audit and regulatory compliance purposes.</li>
            <li><strong>Encryption:</strong> Messages are encrypted in transit via TLS and at rest in the database. The Platform does not currently implement client-side end-to-end encryption.</li>
            <li><strong>Access Control:</strong> Only the two participants of a conversation can read their messages. Row-Level Security policies enforce this at the database level.</li>
            <li><strong>Rate Limiting:</strong> Message sending is rate-limited (5 messages per 10 seconds per conversation) to prevent abuse. Rate limit data is processed server-side.</li>
            <li><strong>Gift & Transfer Transactions:</strong> In-chat gifts and money transfers create financial transactions that are logged for audit purposes, including sender, recipient, emoji/amount, and fees.</li>
          </ul>
        </section>

        <section id="dm-calls" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">5b. Voice & Video Calls</h2>
          <p>The Platform provides one-on-one voice and video calling between DM participants. By using this feature, you acknowledge that:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Call Metadata:</strong> Call records (caller, callee, start/end times, duration, status) are stored in our database for analytics and dispute resolution.</li>
            <li><strong>Audio/Video Streams:</strong> Real-time audio and video are transmitted via encrypted WebRTC connections through a third-party service (LiveKit). The Platform does not record call audio or video content.</li>
            <li><strong>Privacy Settings:</strong> You can disable incoming calls from the Messages → Settings privacy preferences.</li>
          </ul>
        </section>

        <section id="communities" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">5c. Community Chats</h2>
          <p>The Platform provides group chat rooms ("Communities"). By participating, you acknowledge that:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Message Content:</strong> Community messages (text, images, reactions, tagged markets) are stored in our database and visible to all community members.</li>
            <li><strong>Membership Data:</strong> Your community memberships and join dates are recorded.</li>
            <li><strong>Privacy Settings:</strong> You can control whether you receive community invites from the Messages → Settings privacy preferences.</li>
          </ul>
        </section>

        <section id="support-chat" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">5d. In-App Support</h2>
          <p>The Platform provides an in-app support chat. By using this feature, you acknowledge that:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Support Messages:</strong> All messages exchanged with support are stored and accessible to authorized support staff and administrators.</li>
            <li><strong>AI Auto-Reply:</strong> An AI system may process your messages to generate automated responses. Your message content is sent to AI providers for this purpose.</li>
            <li><strong>Support Images:</strong> Images uploaded in support conversations are stored in a secure storage bucket with access restricted to you and authorized staff.</li>
          </ul>
        </section>

        <section id="spaces-social" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">6. Spaces, Stories & Social Features</h2>
          <p className="font-medium text-foreground">6.1 Spaces (Live Audio/Video Rooms)</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>When you join or host a Space, your participation (user ID, role, join/leave timestamps) is recorded.</li>
            <li>Chat messages sent within a Space are stored and visible to all participants.</li>
            <li>If recording is enabled by the host, audio/video streams may be recorded and stored. Participants are notified when recording is active.</li>
            <li>Gift transactions during Spaces are logged with sender, recipient, emoji, amount, and Space ID.</li>
            <li>Listener and participant counts are tracked for analytics.</li>
          </ul>
          <p className="font-medium text-foreground mt-3">6.2 Stories</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Stories (text, images, market shares) are visible to all users and automatically expire after 24 hours.</li>
            <li>Story views and likes are recorded and associated with your user ID.</li>
            <li>Expired stories are periodically cleaned up from the database.</li>
          </ul>
          <p className="font-medium text-foreground mt-3">6.3 Status Posts</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Status posts, including text, images, and tagged markets, are publicly visible and permanent unless deleted by you.</li>
            <li>Likes, comments, and view counts on status posts are recorded.</li>
          </ul>
        </section>

        <section id="kyc-data" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">7. KYC & Identity Verification Data</h2>
          <p>The Platform implements a multi-tiered Know Your Customer (KYC) system for withdrawal eligibility. By submitting KYC information, you acknowledge that:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Document Storage:</strong> KYC documents (selfies, government IDs, utility bills) are stored in a private, access-controlled storage bucket. Only authorized administrators can access these documents for review.</li>
            <li><strong>Device Fingerprinting:</strong> During KYC submission, we collect device information (IP address, user agent, screen dimensions, device pixel ratio, platform, language, timezone) to detect fraud and prevent duplicate accounts.</li>
            <li><strong>Retention:</strong> KYC data is retained for the duration of your account plus a minimum of 5 years for regulatory compliance. Device logs are retained for fraud investigation purposes.</li>
            <li><strong>Review Process:</strong> KYC submissions are reviewed by authorized administrators. Admin notes, reviewer identity, and review timestamps are recorded.</li>
            <li><strong>Purpose Limitation:</strong> KYC data is used exclusively for identity verification, fraud prevention, and regulatory compliance. It is not used for marketing or shared with third parties except as required by law.</li>
          </ul>
        </section>

        <section id="data-sharing" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">8. Data Sharing & Disclosure</h2>
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
          <h2 className="text-base font-semibold text-foreground">9. Blockchain Data & Public Information</h2>
          <p>You acknowledge that:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Blockchain transactions are publicly visible, permanently recorded, and immutable. We cannot delete, modify, or redact blockchain data once a transaction is confirmed.</li>
            <li>Your connected wallet address and associated on-chain transaction history are inherently public information.</li>
            <li>Trade activity on the Platform (side, amount, price) is visible to all users through the order book and recent trades feed as part of market transparency.</li>
            <li>Comments, display names, and market proposals you submit are publicly visible on the Platform.</li>
          </ul>
        </section>

        <section id="data-security" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">10. Data Security</h2>
          <p>We implement industry-standard technical and organizational measures to protect your information, including:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Encryption of data in transit (TLS/SSL) and at rest.</li>
            <li>Secure authentication protocols with password hashing and session management.</li>
            <li>Row-Level Security (RLS) policies ensuring users can only access their own data.</li>
            <li>Role-based access controls for system-mod functions.</li>
            <li>Regular security reviews and vulnerability assessments.</li>
            <li>Secure storage of uploaded files in isolated, access-controlled storage buckets.</li>
            <li>Database-level rate limiting on messaging to prevent spam and abuse.</li>
            <li>Private KYC document storage with restricted admin-only access.</li>
          </ul>
          <p>Despite these measures, no system is 100% secure. We cannot guarantee absolute security of your data. You are responsible for maintaining the security of your account credentials and connected wallets.</p>
        </section>

        <section id="push-notifications" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">11. Push Notifications</h2>
          <p>The Platform may send push notifications to your browser or device for important updates including:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Market resolutions and payout notifications.</li>
            <li>New direct messages and chat gifts.</li>
            <li>Copy trade alerts and follower activity.</li>
            <li>Space invitations and scheduled Space reminders.</li>
            <li>Platform announcements and promotional broadcasts.</li>
          </ul>
          <p>Push notification subscriptions (endpoint URL, encryption keys) are stored securely. You can disable push notifications at any time through your browser settings or the Platform's notification preferences. We use third-party push notification services (Aimtell) to deliver notifications.</p>
        </section>

        <section id="cookies" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">12. Cookies & Local Storage</h2>
          <p>The Platform uses the following browser storage technologies:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Essential Cookies & Session Storage:</strong> To maintain your authentication session, remember your theme preference (light/dark mode), and store temporary state necessary for Platform operation.</li>
            <li><strong>Local Storage:</strong> To cache user preferences, terms acceptance status, and application state for improved performance.</li>
            <li><strong>Analytics:</strong> Our internal analytics system records usage events to improve the Platform. We do not use third-party advertising trackers or cross-site tracking cookies.</li>
          </ul>
          <p>You can control cookie settings through your browser. Disabling essential cookies may prevent you from using certain Platform features.</p>
        </section>

        <section id="your-rights" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">13. Your Rights</h2>
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
          <h2 className="text-base font-semibold text-foreground">14. Data Retention</h2>
          <p>We retain your personal data according to the following principles:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Active Accounts:</strong> Data is retained for as long as your account remains active.</li>
            <li><strong>Financial Records:</strong> Transaction records, trade history, and deposit/withdrawal logs are retained for a minimum of 5 years for regulatory compliance and audit purposes.</li>
            <li><strong>Direct Messages:</strong> Message content is retained for the lifetime of the conversation. Gift transaction records are retained alongside financial records.</li>
            <li><strong>KYC Documents:</strong> Identity verification documents and device fingerprints are retained for the account duration plus 5 years for regulatory compliance and fraud prevention.</li>
            <li><strong>Stories:</strong> Stories expire and are automatically deleted after 24 hours. Story view and like data may be retained in anonymized form.</li>
            <li><strong>Moderation Logs:</strong> Content moderation records are retained for accountability and dispute resolution for a minimum of 2 years.</li>
            <li><strong>Analytics Data:</strong> Anonymized and aggregated analytics data may be retained indefinitely for trend analysis and Platform improvement.</li>
            <li><strong>Account Deletion:</strong> Upon account deletion request, personal identifiers are removed or anonymized. Blockchain data and transaction records required for legal compliance are retained as permitted by law.</li>
          </ul>
        </section>

        <section id="international" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">15. International Data Transfers</h2>
          <p>Your data may be processed and stored in jurisdictions outside your country of residence where our servers and service providers are located. We ensure appropriate safeguards are in place for international data transfers, including standard contractual clauses and data processing agreements that comply with applicable data protection regulations.</p>
        </section>

        <section id="children" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">16. Children's Privacy</h2>
          <p>The Platform is not intended for users under 18 years of age. We do not knowingly collect personal information from minors. If we become aware that a user under 18 has created an account or provided personal data, we will take prompt steps to delete the account and associated information. If you believe a minor has provided us with personal data, please contact us immediately.</p>
        </section>

        <section id="changes" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">17. Changes to This Policy</h2>
          <p>We may update this Privacy Policy periodically to reflect changes in our practices, legal requirements, or Platform features. Material changes will be communicated through:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>In-app notifications or banners.</li>
            <li>Email notification to the address associated with your account.</li>
            <li>Updated "Last updated" date at the bottom of this policy.</li>
          </ul>
          <p>Your continued use of the Platform after changes take effect constitutes acceptance of the updated policy. We encourage you to review this policy periodically.</p>
        </section>

        <section id="contact" className="space-y-2 scroll-mt-20">
          <h2 className="text-base font-semibold text-foreground">18. Contact Us</h2>
          <p>If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us through the Platform's support channels or via the contact information provided in the application. We aim to respond to all inquiries within 30 days.</p>
        </section>

        <p className="text-xs text-muted-foreground/60 pt-4 pb-8">Last updated: April 6, 2026</p>
      </div>
      <BackToTop />
    </div>
  );
};

export default Privacy;
