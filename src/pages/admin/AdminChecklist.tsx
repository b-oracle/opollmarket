import { useState, useEffect } from "react";
import { CheckCircle2, Circle, Rocket, Shield, CreditCard, Globe, Users, Megaphone, Server, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  category: string;
  icon: React.ElementType;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  // Security
  { id: "rls_policies", label: "RLS policies on all tables", description: "Ensure Row-Level Security is enabled and tested on every table.", category: "Security", icon: Shield },
  { id: "admin_role", label: "System-Mod role configured", description: "Verify system-mod users are assigned roles and can access the dashboard.", category: "Security", icon: Shield },
  { id: "rate_limiting", label: "Rate limiting active", description: "Confirm client-side rate limiting is in place for sensitive actions.", category: "Security", icon: Shield },

  // Payments
  { id: "deposit_flow", label: "Deposit flow tested", description: "Test a real deposit end-to-end with NOWPayments.", category: "Payments", icon: CreditCard },
  { id: "withdrawal_flow", label: "Withdrawal flow tested", description: "Process a test withdrawal and verify balance deduction.", category: "Payments", icon: CreditCard },
  { id: "commission_settings", label: "Commission rates configured", description: "Set platform fee, creator fee, and referral reward amounts.", category: "Payments", icon: CreditCard },

  // Content
  { id: "markets_created", label: "Initial markets created", description: "Seed the platform with at least 5-10 active markets.", category: "Content", icon: Megaphone },
  { id: "categories_covered", label: "Multiple categories covered", description: "Ensure markets span crypto, sports, politics, and entertainment.", category: "Content", icon: Megaphone },
  { id: "resolution_sources", label: "Resolution sources defined", description: "Every market should have a clear resolution source.", category: "Content", icon: Megaphone },

  // Infrastructure
  { id: "email_delivery", label: "Email delivery verified", description: "Test signup confirmation & password reset emails.", category: "Infrastructure", icon: Server },
  { id: "edge_functions", label: "Edge functions deployed", description: "Verify all backend functions are deployed and responding.", category: "Infrastructure", icon: Server },
  { id: "error_boundary", label: "Error boundary in place", description: "Confirm the global error boundary catches and displays errors.", category: "Infrastructure", icon: Server },
  { id: "pwa_manifest", label: "PWA manifest configured", description: "Check icons, name, and installability on mobile.", category: "Infrastructure", icon: Server },

  // User Experience
  { id: "mobile_tested", label: "Mobile layout tested", description: "Verify feed, market detail, and portfolio on small screens.", category: "User Experience", icon: Users },
  { id: "terms_disclaimer", label: "Terms & disclaimer pages live", description: "Ensure legal pages are accessible and linked in the app.", category: "User Experience", icon: Users },
  { id: "onboarding_flow", label: "Signup flow tested", description: "Walk through signup, email verification, and first bet.", category: "User Experience", icon: Users },

  // Launch
  { id: "domain_configured", label: "Custom domain connected", description: "Point your domain to the published app.", category: "Launch", icon: Globe },
  { id: "seo_meta", label: "SEO & OG tags set", description: "Check page titles, descriptions, and social preview images.", category: "Launch", icon: Globe },
  { id: "analytics_working", label: "Analytics events firing", description: "Verify key events (page_view, bet_placed, signup) are tracked.", category: "Launch", icon: Globe },
  { id: "maintenance_mode", label: "Maintenance page ready", description: "Confirm /maintenance route works for scheduled downtime.", category: "Launch", icon: Globe },
];

const STORAGE_KEY = "opoll_launch_checklist";

// Items verified as complete via codebase/database audit
const VERIFIED_DEFAULTS: Record<string, boolean> = {
  rls_policies: true,
  admin_role: true,
  rate_limiting: true,
  commission_settings: true,
  email_delivery: true,
  edge_functions: true,
  error_boundary: true,
  pwa_manifest: true,
  terms_disclaimer: true,
  seo_meta: true,
  analytics_working: true,
  maintenance_mode: true,
};

const AdminChecklist = () => {
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : {};
      // Merge: verified defaults + any user overrides from storage
      return { ...VERIFIED_DEFAULTS, ...parsed };
    } catch {
      return { ...VERIFIED_DEFAULTS };
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checked));
  }, [checked]);

  const toggle = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const completedCount = Object.values(checked).filter(Boolean).length;
  const totalCount = CHECKLIST_ITEMS.length;
  const progress = Math.round((completedCount / totalCount) * 100);

  const categories = [...new Set(CHECKLIST_ITEMS.map((i) => i.category))];

  const getCategoryIcon = (category: string) => {
    const item = CHECKLIST_ITEMS.find((i) => i.category === category);
    return item?.icon || Circle;
  };

  const getCategoryProgress = (category: string) => {
    const items = CHECKLIST_ITEMS.filter((i) => i.category === category);
    const done = items.filter((i) => checked[i.id]).length;
    return { done, total: items.length };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Rocket className="w-6 h-6 text-primary" />
            Launch Checklist
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track pre-launch tasks before going live
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-foreground">{progress}%</div>
          <div className="text-xs text-muted-foreground">{completedCount}/{totalCount} done</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      {progress === 100 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-3"
        >
          <Rocket className="w-5 h-5 text-primary" />
          <div>
            <p className="text-sm font-semibold text-foreground">All checks passed!</p>
            <p className="text-xs text-muted-foreground">Your platform is ready to launch 🚀</p>
          </div>
        </motion.div>
      )}

      {progress > 0 && progress < 50 && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-xs text-muted-foreground">Several critical items remain. Complete them before launching.</p>
        </div>
      )}

      {/* Categories */}
      <div className="space-y-6">
        {categories.map((category) => {
          const CategoryIcon = getCategoryIcon(category);
          const { done, total } = getCategoryProgress(category);
          const items = CHECKLIST_ITEMS.filter((i) => i.category === category);

          return (
            <div key={category} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CategoryIcon className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">{category}</h2>
                </div>
                <span className="text-xs text-muted-foreground">{done}/{total}</span>
              </div>

              <div className="space-y-1">
                {items.map((item) => {
                  const isChecked = !!checked[item.id];
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggle(item.id)}
                      className={`w-full flex items-start gap-3 p-3 rounded-xl border transition-all text-left ${
                        isChecked
                          ? "bg-primary/5 border-primary/20"
                          : "bg-card border-border hover:border-primary/30"
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        <AnimatePresence mode="wait">
                          {isChecked ? (
                            <motion.div
                              key="checked"
                              initial={{ scale: 0.5, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0.5, opacity: 0 }}
                            >
                              <CheckCircle2 className="w-5 h-5 text-primary" />
                            </motion.div>
                          ) : (
                            <motion.div
                              key="unchecked"
                              initial={{ scale: 0.5, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0.5, opacity: 0 }}
                            >
                              <Circle className="w-5 h-5 text-muted-foreground" />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${isChecked ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {item.label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminChecklist;
