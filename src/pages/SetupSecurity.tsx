import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Lock, Smartphone, CheckCircle2, Loader2, Copy, Check } from "lucide-react";
import PinInput from "@/components/PinInput";
import TopBar from "@/components/TopBar";
import { motion } from "framer-motion";
import SEOHead from "@/components/SEOHead";

type SetupStep = "choose" | "pin" | "pin_confirm" | "totp_generate" | "totp_verify" | "done";

const SetupSecurity = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<SetupStep>("choose");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [totpUri, setTotpUri] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpError, setTotpError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pinDone, setPinDone] = useState(false);
  const [totpDone, setTotpDone] = useState(false);

  if (!authLoading && !user) {
    return <Navigate to="/auth" replace />;
  }

  const handleSetPin = async () => {
    if (pin !== pinConfirm) {
      setPinError("PINs don't match");
      setPinConfirm("");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("setup-security-pin", {
        body: { pin },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPinDone(true);
      toast.success("PIN set successfully!");
      setStep("choose");
    } catch (err: any) {
      toast.error(err.message || "Failed to set PIN");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateTotp = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("setup-totp", {
        body: { action: "generate" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setTotpSecret(data.secret);
      setTotpUri(data.otpauth_uri);
      setStep("totp_verify");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate 2FA");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyTotp = async () => {
    setLoading(true);
    setTotpError("");
    try {
      const { data, error } = await supabase.functions.invoke("setup-totp", {
        body: { action: "verify", code: totpCode },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setTotpDone(true);
      toast.success("2FA enabled successfully!");
      setStep("choose");
    } catch (err: any) {
      setTotpError(err.message || "Invalid code");
      setTotpCode("");
    } finally {
      setLoading(false);
    }
  };

  const canProceed = pinDone || totpDone;

  const handleContinue = () => {
    navigate("/", { replace: true });
  };

  const copySecret = () => {
    navigator.clipboard.writeText(totpSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <SEOHead title="Setup Security — oPoll" description="Set up your account security" />
      <TopBar />
      <div className="min-h-screen pt-[calc(3.5rem+env(safe-area-inset-top))] pb-8 px-4 flex flex-col items-center">
        <div className="w-full max-w-md space-y-6 mt-8">
          <div className="text-center space-y-2">
            <Shield className="w-12 h-12 text-primary mx-auto" />
            <h1 className="text-2xl font-bold">Secure Your Account</h1>
            <p className="text-muted-foreground text-sm">Set up at least one security method to protect your account and enable withdrawals.</p>
          </div>

          {step === "choose" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              {/* PIN Card */}
              <button
                onClick={() => { setStep("pin"); setPin(""); setPinConfirm(""); setPinError(""); }}
                disabled={pinDone}
                className="w-full p-4 rounded-xl border border-border bg-card hover:bg-muted/50 transition-all text-left flex items-center gap-4 disabled:opacity-60"
              >
                <div className={`p-3 rounded-full ${pinDone ? "bg-primary/20" : "bg-muted"}`}>
                  {pinDone ? <CheckCircle2 className="w-6 h-6 text-primary" /> : <Lock className="w-6 h-6 text-muted-foreground" />}
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{pinDone ? "PIN Set ✓" : "Set a 6-Digit PIN"}</p>
                  <p className="text-sm text-muted-foreground">Quick numeric passcode for withdrawals</p>
                </div>
              </button>

              {/* TOTP Card */}
              <button
                onClick={() => { setStep("totp_generate"); }}
                disabled={totpDone}
                className="w-full p-4 rounded-xl border border-border bg-card hover:bg-muted/50 transition-all text-left flex items-center gap-4 disabled:opacity-60"
              >
                <div className={`p-3 rounded-full ${totpDone ? "bg-primary/20" : "bg-muted"}`}>
                  {totpDone ? <CheckCircle2 className="w-6 h-6 text-primary" /> : <Smartphone className="w-6 h-6 text-muted-foreground" />}
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{totpDone ? "2FA Enabled ✓" : "Google Authenticator"}</p>
                  <p className="text-sm text-muted-foreground">Time-based one-time passwords</p>
                </div>
              </button>

              <button
                onClick={handleContinue}
                disabled={!canProceed}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-40 mt-4"
              >
                Continue to App
              </button>

              {!canProceed && (
                <p className="text-center text-sm text-muted-foreground">Complete at least one method to continue</p>
              )}
            </motion.div>
          )}

          {step === "pin" && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <h2 className="text-lg font-semibold text-center">Enter a 6-digit PIN</h2>
              <PinInput value={pin} onChange={setPin} />
              <button
                onClick={() => { if (pin.length === 6) setStep("pin_confirm"); }}
                disabled={pin.length !== 6}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-40"
              >
                Next
              </button>
              <button onClick={() => setStep("choose")} className="w-full py-2 text-muted-foreground text-sm">Back</button>
            </motion.div>
          )}

          {step === "pin_confirm" && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <h2 className="text-lg font-semibold text-center">Confirm your PIN</h2>
              <PinInput value={pinConfirm} onChange={setPinConfirm} error={!!pinError} />
              {pinError && <p className="text-destructive text-sm text-center">{pinError}</p>}
              <button
                onClick={handleSetPin}
                disabled={pinConfirm.length !== 6 || loading}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Set PIN
              </button>
              <button onClick={() => { setStep("pin"); setPinConfirm(""); setPinError(""); }} className="w-full py-2 text-muted-foreground text-sm">Back</button>
            </motion.div>
          )}

          {step === "totp_generate" && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4 text-center">
              <h2 className="text-lg font-semibold">Setting up Google Authenticator</h2>
              <p className="text-sm text-muted-foreground">We'll generate a secret key for your authenticator app.</p>
              <button
                onClick={handleGenerateTotp}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Generate Secret
              </button>
              <button onClick={() => setStep("choose")} className="w-full py-2 text-muted-foreground text-sm">Back</button>
            </motion.div>
          )}

          {step === "totp_verify" && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <h2 className="text-lg font-semibold text-center">Scan QR Code</h2>
              <p className="text-sm text-muted-foreground text-center">
                Open Google Authenticator, tap "+" and scan this QR code:
              </p>

              {totpUri && (
                <div className="flex justify-center py-2">
                  <div className="bg-white p-3 rounded-xl">
                    <QRCodeSVG value={totpUri} size={180} level="M" />
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground text-center">Or enter this secret key manually:</p>

              <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                <code className="flex-1 text-xs font-mono break-all select-all">{totpSecret}</code>
                <button onClick={copySecret} className="shrink-0 p-2 rounded-lg hover:bg-background">
                  {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              <p className="text-sm text-muted-foreground text-center">
                Then enter the 6-digit code shown in the app:
              </p>

              <PinInput value={totpCode} onChange={setTotpCode} error={!!totpError} />
              {totpError && <p className="text-destructive text-sm text-center">{totpError}</p>}

              <button
                onClick={handleVerifyTotp}
                disabled={totpCode.length !== 6 || loading}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Verify & Enable
              </button>
              <button onClick={() => setStep("choose")} className="w-full py-2 text-muted-foreground text-sm">Back</button>
            </motion.div>
          )}
        </div>
      </div>
    </>
  );
};

export default SetupSecurity;
