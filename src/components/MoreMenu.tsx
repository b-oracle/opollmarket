import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FileText, Shield, AlertTriangle, HelpCircle, ChevronRight, LogIn, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import InstallAppModal from "@/components/InstallAppModal";

interface MoreMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const legalLinks = [
  { icon: AlertTriangle, label: "Disclaimer", path: "/disclaimer" },
  { icon: FileText, label: "Terms & Conditions", path: "/terms" },
  { icon: Shield, label: "Privacy Policy", path: "/privacy" },
];

const resourceLinks = [
  { icon: HelpCircle, label: "FAQ", path: "/faq" },
  { icon: Download, label: "Download App", path: "__install__" },
];

const socialLinks = [
  { icon: "𝕏", label: "Follow on X", href: "https://x.com" },
  { icon: "✈", label: "Join Telegram", href: "https://t.me" },
];

const staggerContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
};

const MoreMenu = ({ open, onOpenChange }: MoreMenuProps) => {
  const navigate = useNavigate();
  const [installOpen, setInstallOpen] = useState(false);

  const handleNavigate = (path: string) => {
    onOpenChange(false);
    if (path === "__install__") {
      setTimeout(() => setInstallOpen(true), 300);
      return;
    }
    navigate(path);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pt-2 border-t border-border bg-background" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 5.5rem)', zIndex: 60, maxHeight: '80dvh' }}
          onInteractOutside={() => { onOpenChange(false); }}
          onEscapeKeyDown={() => onOpenChange(false)}
        >
          <div className="mx-auto mt-2 mb-4 h-1.5 w-12 rounded-full bg-muted" />
          <SheetHeader className="pb-2">
            <SheetTitle className="text-left text-lg">More</SheetTitle>
          </SheetHeader>

          <motion.div
            className="space-y-5 overflow-y-auto"
            style={{ maxHeight: 'calc(80dvh - 6rem)' }}
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            key={open ? "open" : "closed"}
          >
            <motion.div variants={fadeUp}>
              <Button
                className="w-full h-12 text-base font-semibold"
                onClick={() => handleNavigate("/auth")}
              >
                <LogIn className="w-5 h-5 mr-2" />
                Sign In / Sign Up
              </Button>
            </motion.div>

            <motion.div variants={fadeUp}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Legal</p>
              <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
                {legalLinks.map(({ icon: Icon, label, path }) => (
                  <button
                    key={path}
                    onClick={() => handleNavigate(path)}
                    className="flex items-center gap-3 w-full px-4 py-3.5 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </motion.div>

            <motion.div variants={fadeUp}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Resources</p>
              <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
                {resourceLinks.map(({ icon: Icon, label, path }) => (
                  <button
                    key={path}
                    onClick={() => handleNavigate(path)}
                    className="flex items-center gap-3 w-full px-4 py-3.5 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </motion.div>

            <motion.div variants={fadeUp}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Social</p>
              <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
                {socialLinks.map(({ icon, label, href }) => (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 w-full px-4 py-3.5 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary text-sm">
                      {icon}
                    </div>
                    <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </a>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </SheetContent>
      </Sheet>

      <InstallAppModal open={installOpen} onClose={() => setInstallOpen(false)} />
    </>
  );
};

export default MoreMenu;
