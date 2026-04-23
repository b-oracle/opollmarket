import SEOHead from "@/components/SEOHead";
import { ArrowLeft, Shield, User, MessageCircle, Bell, CreditCard, Camera, MapPin, Mic, Contact, Database, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BackToTop from "@/components/BackToTop";

interface DataPurpose {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  whatWeCollect: string;
  whyWeUseIt: string;
  optional?: boolean;
}

const purposes: DataPurpose[] = [
  {
    icon: User,
    title: "Account & Profile",
    whatWeCollect: "Email address, display name, username, and (optionally) a profile photo. If you sign in with Google or Apple, we receive your name, email, and profile picture from that provider.",
    whyWeUseIt: "To create your account, sign you in securely, identify you to other users you interact with, and recover your account if you lose access.",
  },
  {
    icon: Lock,
    title: "Security & Fraud Prevention",
    whatWeCollect: "Login timestamps, device type, IP address, security PIN/TOTP settings, and session activity.",
    whyWeUseIt: "To detect suspicious activity, prevent unauthorized access to your funds, enforce session timeouts, and meet anti-fraud obligations.",
  },
  {
    icon: CreditCard,
    title: "Predictions, Trades & Wallet Activity",
    whatWeCollect: "Your bets, positions, transaction history, USDT/Naira balances, deposit/withdrawal records, and (where applicable) wallet addresses or bank account details.",
    whyWeUseIt: "To execute the trades you request, settle markets, process deposits and withdrawals, and show you accurate balances and PnL.",
  },
  {
    icon: Shield,
    title: "Identity Verification (KYC)",
    whatWeCollect: "Full name, date of birth, address, government-issued ID images, selfie, and (for higher tiers) a utility bill. Only requested when you choose to verify.",
    whyWeUseIt: "To raise your withdrawal limits, comply with anti-money-laundering requirements, and protect the platform from impersonation. KYC documents are encrypted and never shared publicly.",
    optional: true,
  },
  {
    icon: MessageCircle,
    title: "Messages, Spaces & Communities",
    whatWeCollect: "Direct messages, community chat posts, Spaces audio (when you join or host), reactions, gifts sent/received, and read receipts.",
    whyWeUseIt: "To deliver your messages, host live audio rooms, render reactions in real time, and let you reply to or quote prior messages.",
  },
  {
    icon: Mic,
    title: "Microphone & Voice/Video Calls",
    whatWeCollect: "Live audio (and video, if enabled) during 1:1 calls and Spaces. Audio is streamed in real time via LiveKit; recordings are only made for Spaces when the host enables them.",
    whyWeUseIt: "To power voice/video calls and live audio rooms. We never record private 1:1 calls. Microphone access is only requested when you tap to start or join a call.",
    optional: true,
  },
  {
    icon: Camera,
    title: "Camera & Photo Uploads",
    whatWeCollect: "Photos you upload for your avatar, posts, stories, market images, KYC documents, or chat attachments.",
    whyWeUseIt: "To display your content where you choose to share it. Camera/photo access is only requested when you tap to upload.",
    optional: true,
  },
  {
    icon: Bell,
    title: "Push Notifications",
    whatWeCollect: "A device push token (FCM/APNs/Web Push) and notification preferences.",
    whyWeUseIt: "To alert you about market resolutions, copy-trade events, gifts, mentions, and direct messages. You can disable notifications at any time in your device settings.",
    optional: true,
  },
  {
    icon: MapPin,
    title: "Approximate Location (optional)",
    whatWeCollect: "Country/region derived from your IP address, or a location you voluntarily set on your profile.",
    whyWeUseIt: "To show you the right currency (USD/NGN), the right payment provider, and to comply with regional restrictions. We do not track your precise GPS location.",
    optional: true,
  },
  {
    icon: Contact,
    title: "Connected Accounts (optional)",
    whatWeCollect: "If you link X (Twitter), Telegram, or WhatsApp, we receive your handle and an authentication token from those providers.",
    whyWeUseIt: "To verify ownership of social handles, post on your behalf when you ask, and deliver bot notifications. You can unlink at any time from your profile.",
    optional: true,
  },
  {
    icon: Database,
    title: "Analytics & Service Improvement",
    whatWeCollect: "Anonymous usage events (pages viewed, features used, errors encountered) and basic device info (browser, OS).",
    whyWeUseIt: "To understand which features matter, fix bugs faster, and improve performance. We do not sell this data to third parties.",
  },
];

const DataUse = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ paddingBottom: "calc(1rem + var(--content-bottom))" }}>
      <SEOHead
        title="How We Use Your Data – OPollMarket"
        description="A transparent, plain-English breakdown of every type of data OPollMarket collects, why we collect it, and which permissions are optional."
        path="/data-use"
      />

      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="max-w-lg md:max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted transition" aria-label="Go back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">How We Use Your Data</h1>
        </div>
      </div>

      <div className="max-w-lg md:max-w-3xl mx-auto px-4 pt-6 space-y-6">
        <section className="glass rounded-2xl p-5 border border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-base font-bold text-foreground">Our promise</h2>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We collect the minimum data needed to run the things you actually use. We <strong className="text-foreground">never sell</strong> your personal information,
            and any feature that asks for your microphone, camera, location, or contacts will say so up front — and only when you tap to use it.
          </p>
        </section>

        <div className="space-y-3">
          {purposes.map((p) => {
            const Icon = p.icon;
            return (
              <article key={p.title} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <header className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-foreground">{p.title}</h3>
                      {p.optional && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                          Optional
                        </span>
                      )}
                    </div>
                  </div>
                </header>

                <div className="space-y-2 pl-12">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">What we collect</p>
                    <p className="text-sm text-foreground/90 leading-relaxed">{p.whatWeCollect}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Why we use it</p>
                    <p className="text-sm text-foreground/90 leading-relaxed">{p.whyWeUseIt}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-base font-bold text-foreground">Your controls</h2>
          <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
            <li>Revoke microphone, camera, location, or notification permissions any time from your device settings.</li>
            <li>Unlink social accounts (X, Telegram, WhatsApp) from your profile.</li>
            <li>Toggle who can call you, message you, or invite you to Spaces from <button onClick={() => navigate("/profile")} className="text-primary underline">your settings</button>.</li>
            <li>Request account deletion by contacting support — see our full Privacy Policy for the process.</li>
          </ul>
          <div className="flex flex-wrap gap-2 pt-2">
            <button onClick={() => navigate("/privacy")} className="text-xs font-semibold px-3 py-2 rounded-lg bg-primary text-primary-foreground">
              Full Privacy Policy
            </button>
            <button onClick={() => navigate("/terms")} className="text-xs font-semibold px-3 py-2 rounded-lg bg-muted text-foreground border border-border">
              Terms & Conditions
            </button>
          </div>
        </section>

        <p className="text-[11px] text-muted-foreground text-center pt-2">
          Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>

      <BackToTop />
    </div>
  );
};

export default DataUse;
