import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Users, Zap, Trophy } from "lucide-react";
import logoLight from "@/assets/blue-opoll-logo.png";

/**
 * Public landing hero shown to logged-out visitors on the homepage.
 *
 * IMPORTANT: This section is required for Google OAuth verification.
 * It must remain visible without login and must clearly:
 *   - Identify the OPoll brand
 *   - Describe what the app does
 *   - Explain what user data is requested when signing in with Google
 *   - Link to the Privacy Policy at https://opoll.org/privacy
 */
const LandingHero = () => {
  return (
    <section className="border-b border-border bg-background" aria-labelledby="opoll-landing-heading">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        {/* Brand */}
        <div className="flex items-center gap-3 mb-6">
          <img src={logoLight} alt="OPoll Market logo" className="h-9 w-auto object-contain" />
          <span className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            OPoll Market
          </span>
        </div>

        {/* Headline */}
        <h1
          id="opoll-landing-heading"
          className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight text-foreground mb-4"
        >
          Predict the future, <span className="text-primary">earn from it</span>.
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mb-8">
          OPoll Market is a social prediction platform where you trade on real-world events across
          crypto, sports, politics, and culture — on Web, Telegram and WhatsApp.
        </p>

        {/* What the app does */}
        <div className="grid sm:grid-cols-2 gap-4 mb-10">
          {[
            { icon: Zap, title: "Predict real events", desc: "Markets across crypto, sports, politics, and culture." },
            { icon: Trophy, title: "Trade in seconds", desc: "Fast parimutuel rounds with transparent odds." },
            { icon: Users, title: "Follow & copy traders", desc: "Chat in Spaces and DMs, copy top performers." },
            { icon: ShieldCheck, title: "Earn from accuracy", desc: "Win rewards when your predictions resolve correctly." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card">
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Data transparency */}
        <div className="rounded-xl border border-border bg-muted/30 p-5 sm:p-6 mb-10">
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground mb-3">
            What we ask for when you sign in with Google
          </h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Your name and profile picture</span> — to
              display your public OPoll profile and identify you to other users.
            </li>
            <li>
              <span className="font-medium text-foreground">Your email address</span> — to create
              and secure your account, send transactional notifications, and recover access.
            </li>
            <li>
              We do <span className="font-medium text-foreground">not</span> access your contacts,
              Drive, Gmail, Calendar, or any other Google data.
            </li>
          </ul>
          <p className="text-xs text-muted-foreground mt-4">
            Read our full{" "}
            <Link to="/privacy" className="text-primary underline underline-offset-2 hover:opacity-80">
              Privacy Policy
            </Link>{" "}
            for details on how we store and protect your information.
          </p>
        </div>

        {/* CTAs */}
        <div className="flex flex-wrap gap-3 mb-10">
          <Button asChild size="lg">
            <Link to="/auth">Get started</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="#markets">Browse markets</a>
          </Button>
        </div>

        {/* Public legal links */}
        <nav
          aria-label="Legal and help links"
          className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground pt-6 border-t border-border"
        >
          <Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-primary transition-colors">Terms</Link>
          <Link to="/disclaimer" className="hover:text-primary transition-colors">Disclaimer</Link>
          <Link to="/faq" className="hover:text-primary transition-colors">FAQ</Link>
          <a href="mailto:support@opoll.org" className="hover:text-primary transition-colors">Contact</a>
          <span className="ml-auto">© {new Date().getFullYear()} OPoll Market</span>
        </nav>
      </div>
    </section>
  );
};

export default LandingHero;
