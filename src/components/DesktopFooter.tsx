import { useNavigate } from "react-router-dom";
import logo from "@/assets/logo.png";
import { Video, HelpCircle, FileText, Shield, Scale } from "lucide-react";
import { toast } from "sonner";

const footerLinks = [
  { icon: Video, label: "How-to Videos", href: "#", comingSoon: true },
  { icon: HelpCircle, label: "FAQ", href: "/faq" },
  { icon: Scale, label: "Disclaimer", href: "/disclaimer" },
  { icon: FileText, label: "Terms & Conditions", href: "/terms" },
  { icon: Shield, label: "Privacy Policy", href: "/privacy" },
];

const socialLinks = [
  {
    label: "X (Twitter)",
    href: "https://x.com/opollmarket",
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    label: "Telegram",
    href: "https://t.me/opoll_predict_bot",
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
];

const DesktopFooter = () => {
  const navigate = useNavigate();

  return (
    <footer className="hidden md:block border-t border-border bg-background/95">
      <div className="max-w-4xl xl:max-w-6xl mx-auto px-4 lg:px-6 py-8 lg:py-10">
        <div className="grid grid-cols-3 gap-4 lg:gap-8 mb-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img src={logo} alt="OPOLL" className="h-7 w-7" />
              <span className="text-xl font-bold tracking-tight text-primary">Poll</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-[240px]">
              Predict the future, earn from it. The social prediction market platform.
            </p>
            {/* Socials */}
            <div className="flex items-center gap-2 mt-4">
              {socialLinks.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-lg glass flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                  title={s.label}
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
              Resources
            </h4>
            <ul className="space-y-2">
              {footerLinks.map((link) => (
                <li key={link.label}>
                  <button
                    onClick={() => {
                      if (link.comingSoon) {
                        toast.info(`${link.label} — Coming Soon!`);
                      } else {
                        navigate(link.href);
                      }
                    }}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
                  >
                    <link.icon className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                    {link.label}
                    {link.comingSoon && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground">
                        Soon
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal / Quick links */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
              Platform
            </h4>
            <ul className="space-y-2">
              {[
                { label: "via Telegram", href: "https://t.me/opoll_predict_bot", external: true },
                { label: "via WhatsApp", href: "#", comingSoon: true },
                { label: "Create Market", href: "/create" },
                { label: "Leaderboard", href: "/rankings" },
                { label: "Referral Program", href: "/referrals" },
              ].map((link) => (
                <li key={link.label}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <button
                      onClick={() => {
                        if (link.comingSoon) {
                          toast.info(`${link.label} — Coming Soon!`);
                        } else {
                          navigate(link.href);
                        }
                      }}
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      {link.label}
                      {link.comingSoon && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground">
                          Soon
                        </span>
                      )}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-6 border-t border-border flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} OPOLL. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            {["Terms", "Privacy", "Disclaimer"].map((label) => (
              <button
                key={label}
                onClick={() =>
                  navigate(
                    label === "Terms"
                      ? "/terms"
                      : label === "Privacy"
                      ? "/privacy"
                      : "/disclaimer"
                  )
                }
                className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default DesktopFooter;
