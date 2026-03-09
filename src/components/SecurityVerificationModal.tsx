import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Shield, Lock, Smartphone, Loader2 } from "lucide-react";
import PinInput from "@/components/PinInput";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SecurityVerificationModalProps {
  open: boolean;
  onClose: () => void;
  onVerified: () => void;
  requirePin: boolean;
  requireTotp: boolean;
}

const SecurityVerificationModal = ({ open, onClose, onVerified, requirePin, requireTotp }: SecurityVerificationModalProps) => {
  const [step, setStep] = useState<"pin" | "totp">(requirePin ? "pin" : "totp");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pinVerified, setPinVerified] = useState(false);

  const verify = async (type: "pin" | "totp", value: string) => {
    setLoading(true);
    setError("");
    try {
      const { data, error: fnError } = await supabase.functions.invoke("verify-security", {
        body: { type, code: value },
      });
      if (fnError) throw fnError;
      if (!data?.valid) {
        setError(type === "pin" ? "Incorrect PIN" : "Invalid code");
        setCode("");
        return;
      }

      if (type === "pin" && requireTotp && !pinVerified) {
        setPinVerified(true);
        setStep("totp");
        setCode("");
        return;
      }

      onVerified();
    } catch {
      setError("Verification failed. Try again.");
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    if (code.length !== 6) return;
    verify(step, code);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card rounded-2xl p-6 w-full max-w-sm shadow-xl border border-border"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <h3 className="font-bold text-lg">Security Verification</h3>
            </div>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-muted">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="text-center space-y-4">
            {step === "pin" ? (
              <>
                <Lock className="w-10 h-10 text-primary mx-auto" />
                <p className="text-muted-foreground text-sm">Enter your 6-digit PIN</p>
              </>
            ) : (
              <>
                <Smartphone className="w-10 h-10 text-primary mx-auto" />
                <p className="text-muted-foreground text-sm">Enter the code from Google Authenticator</p>
              </>
            )}

            <PinInput value={code} onChange={setCode} error={!!error} disabled={loading} />

            {error && <p className="text-destructive text-sm">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={code.length !== 6 || loading}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Verify
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SecurityVerificationModal;
