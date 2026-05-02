import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOutstandingDebt } from "@/hooks/useOutstandingDebt";
import { format } from "date-fns";

interface OutstandingDebtBannerProps {
  /** Optional callback when user taps "Deposit to settle" */
  onDeposit?: () => void;
  className?: string;
}

/**
 * Shows an in-app banner whenever the current user has outstanding deposit
 * debts (e.g. duplicate-credit reversals that exceeded available balance).
 * The backend automatically settles these on the next successful deposit
 * via the `settle_user_debts` RPC, so we only need to surface the state.
 */
export default function OutstandingDebtBanner({ onDeposit, className = "" }: OutstandingDebtBannerProps) {
  const { debts, totalOutstanding, hasDebt, isLoading } = useOutstandingDebt();
  const [expanded, setExpanded] = useState(false);

  if (isLoading || !hasDebt) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-foreground ${className}`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/20">
          <AlertTriangle className="h-5 w-5 text-warning" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">Outstanding balance: ${totalOutstanding.toFixed(2)}</p>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded-full p-1 text-muted-foreground hover:bg-warning/10"
              aria-label={expanded ? "Collapse details" : "Expand details"}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            This will be deducted automatically from your next successful deposit.
          </p>

          <AnimatePresence initial={false}>
            {expanded && (
              <motion.ul
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 space-y-2 overflow-hidden border-t border-warning/20 pt-3"
              >
                {debts.map((d) => (
                  <li key={d.id} className="text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">${d.remaining.toFixed(2)}</span>
                      <span className="text-muted-foreground">
                        {format(new Date(d.created_at), "MMM d, yyyy")}
                      </span>
                    </div>
                    {d.reason && (
                      <p className="mt-0.5 line-clamp-2 text-muted-foreground">{d.reason}</p>
                    )}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>

          {onDeposit && (
            <button
              type="button"
              onClick={onDeposit}
              className="mt-3 w-full rounded-xl bg-warning px-4 py-2 text-sm font-semibold text-warning-foreground transition-opacity hover:opacity-90"
            >
              Deposit to settle
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
