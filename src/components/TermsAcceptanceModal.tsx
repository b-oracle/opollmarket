import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, ExternalLink, CalendarClock } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface TermsAcceptanceModalProps {
  open: boolean;
  onAccept: () => void;
  onClose: () => void;
}

/**
 * Update this date string whenever Terms / Disclaimer / Privacy policies change.
 * Users will be re-prompted to accept on their next prediction.
 */
export const LATEST_POLICY_DATE = "2026-04-06";

const TERMS_ACCEPTED_KEY = "opoll_terms_accepted_date";

export const hasAcceptedTerms = (): boolean => {
  return localStorage.getItem(TERMS_ACCEPTED_KEY) === LATEST_POLICY_DATE;
};

export const setTermsAccepted = () => {
  localStorage.setItem(TERMS_ACCEPTED_KEY, LATEST_POLICY_DATE);
};

const TermsAcceptanceModal = ({ open, onAccept, onClose }: TermsAcceptanceModalProps) => {
  const [checked, setChecked] = useState(false);
  const navigate = useNavigate();

  const previouslyAccepted = localStorage.getItem(TERMS_ACCEPTED_KEY);
  const isUpdate = !!previouslyAccepted && previouslyAccepted !== LATEST_POLICY_DATE;

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 space-y-4 shadow-xl"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                {isUpdate ? "Updated Terms & Conditions" : "Terms & Conditions"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {isUpdate
                  ? "Our policies have been updated — please review and accept"
                  : "Please review before placing your first prediction"}
              </p>
            </div>
          </div>

          {isUpdate && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/50 border border-accent text-xs text-accent-foreground">
              <CalendarClock className="w-4 h-4 shrink-0" />
              <span>
                Policies updated on <strong>{LATEST_POLICY_DATE}</strong>. Your previous acceptance is no longer current.
              </span>
            </div>
          )}

          <div className="p-3 rounded-xl bg-muted/50 border border-border text-xs text-muted-foreground space-y-2 max-h-40 overflow-y-auto">
            <p>By placing predictions on OPollmarket, you acknowledge and agree that:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Prediction markets involve financial risk. Only use funds you can afford to lose.</li>
              <li>Market outcomes are resolved based on the stated resolution source.</li>
              <li>Fees are deducted from each trade as displayed at the time of purchase.</li>
              <li>OPollmarket is not liable for any losses incurred through market participation.</li>
            </ul>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => { onClose(); navigate("/terms"); }}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Full Terms <ExternalLink className="w-3 h-3" />
            </button>
            <button
              onClick={() => { onClose(); navigate("/disclaimer"); }}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Disclaimer <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 rounded border-border accent-primary"
            />
            <span className="text-xs text-foreground">
              I have read and agree to the Terms of Service and Disclaimer
            </span>
          </label>

          <button
            onClick={() => {
              setTermsAccepted();
              onAccept();
            }}
            disabled={!checked}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100"
          >
            {isUpdate ? "Accept Updated Terms" : "Accept & Continue"}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default TermsAcceptanceModal;
