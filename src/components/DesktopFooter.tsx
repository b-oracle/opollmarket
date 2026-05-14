import { useNavigate } from "react-router-dom";
import logoLight from "@/assets/blue-opoll-logo.png";
import { Video, HelpCircle, FileText, Shield, Scale, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSocialLinks } from "@/hooks/useSocialLinks";
import SocialIcon from "@/components/SocialIcon";

const footerLinks = [
  { icon: Video, label: "How-to", href: "#", comingSoon: true },
  { icon: HelpCircle, label: "FAQ", href: "/faq" },
  { icon: Eye, label: "How We Use Your Data", href: "/data-use" },
  { icon: Scale, label: "Disclaimer", href: "/disclaimer" },
  { icon: FileText, label: "Terms & Conditions", href: "/terms" },
  { icon: Shield, label: "Privacy Policy", href: "/privacy" },
  { icon: Shield, label: "Child Safety Standards", href: "/child-safety" },
  { icon: Trash2, label: "Delete Account", href: "/delete-account" },
];

const DesktopFooter = () => {
  const navigate = useNavigate();
  const { data: socialLinks = [] } = useSocialLinks();

  return (
    <footer className="hidden lg:block border-t border-border bg-background/95">
      <div className="max-w-4xl xl:max-w-6xl mx-auto px-4 lg:px-6 py-8 lg:py-10">
        <div className="grid grid-cols-3 gap-4 lg:gap-8 mb-8">
          {/* Brand */}
          <div>
            <div className="flex items-center mb-3">
              <img src={logoLight} alt="OPOLL" className="h-7 object-contain" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-[240px]">
              Predict the future, earn from it. The social prediction market platform.
            </p>
            {/* Socials */}
            <div className="flex items-center gap-2 mt-4">
              {socialLinks.map((s) => (
                <a
                  key={s.id}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-lg glass flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                  title={s.label}
                >
                  <SocialIcon iconKey={s.icon_key} />
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
                { label: "via Telegram", href: "https://t.me/OPoll_market_bot", external: true },
                { label: "via WhatsApp", href: "#", comingSoon: true },
                { label: "Create Market", href: "/create" },
                { label: "Developers", href: "/developers" },
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
            <a href="/terms" className="text-[11px] text-muted-foreground hover:text-primary transition-colors">
              Terms
            </a>
            <a href="/privacy" className="text-[11px] text-muted-foreground hover:text-primary transition-colors">
              Privacy
            </a>
            <a href="/disclaimer" className="text-[11px] text-muted-foreground hover:text-primary transition-colors">
              Disclaimer
            </a>
            <a href="/child-safety" className="text-[11px] text-muted-foreground hover:text-primary transition-colors">
              Child Safety
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default DesktopFooter;
