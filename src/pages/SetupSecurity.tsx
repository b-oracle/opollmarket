import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Lock, Smartphone, CheckCircle2, Loader2, Copy, Check, KeyRound, ArrowLeft, Eye, EyeOff } from "lucide-react";
import PinInput from "@/components/PinInput";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { motion } from "framer-motion";
import SEOHead from "@/components/SEOHead";
import KycSubmissionForm from "@/components/KycSubmissionForm";
import { Switch } from "@/components/ui/switch";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type SetupStep =
  | "choose"
  | "pin"
  | "pin_confirm"
  | "totp_generate"
  | "totp_verify"
  | "done"
  | "change_password"
  | "change_pin_verify"
  | "change_pin_new"
  | "change_pin_confirm";

const SecurityTogglesSection = ({ userId }: { userId?: string }) => {
  const queryClient = useQueryClient();
  const { data: secSettings, isLoading } = useQuery({
    queryKey: ["security_settings", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from("user_security_settings" as any)
        .select("pin_enabled, totp_enabled, require_pin_withdrawal, require_totp_withdrawal, require_pin_login, require_totp_login")
        .eq("user_id", userId)
        .maybeSingle();
      return data as unknown as { pin_enabled: boolean; totp_enabled: boolean; require_pin_withdrawal: boolean; require_totp_withdrawal: boolean; require_pin_login: boolean; require_totp_login: boolean } | null;
    },
    enabled: !!userId,
  });

  const updateToggle = async (field: string, value: boolean) => {
    if (!userId) return;
    const { error } = await supabase
      .from("user_security_settings" as any)
      .update({ [field]: value, updated_at: new Date().toISOString() } as any)
      .eq("user_id", userId);
    if (error) { toast.error("Failed to update"); return; }
    queryClient.invalidateQueries({ queryKey: ["security_settings", userId] });
    toast.success("Updated");
  };

  if (isLoading || (!secSettings?.pin_enabled && !secSettings?.totp_enabled)) return null;

  return (
    <div className="space-y-2 pt-2">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Security Preferences</h3>
      {secSettings?.pin_enabled && (
        <>
          <div className="glass rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">PIN for Login</p>
              <p className="text-xs text-muted-foreground">Require PIN after signing in</p>
            </div>
            <Switch checked={secSettings?.require_pin_login ?? false} onCheckedChange={(v) => updateToggle("require_pin_login", v)} />
          </div>
          <div className="glass rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">PIN for Withdrawals</p>
              <p className="text-xs text-muted-foreground">Require PIN before withdrawing</p>
            </div>
            <Switch checked={secSettings?.require_pin_withdrawal ?? false} onCheckedChange={(v) => updateToggle("require_pin_withdrawal", v)} />
          </div>
        </>
      )}
      {secSettings?.totp_enabled && (
        <>
          <div className="glass rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">2FA for Login</p>
              <p className="text-xs text-muted-foreground">Require authenticator code after signing in</p>
            </div>
            <Switch checked={secSettings?.require_totp_login ?? false} onCheckedChange={(v) => updateToggle("require_totp_login", v)} />
          </div>
          <div className="glass rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">2FA for Withdrawals</p>
              <p className="text-xs text-muted-foreground">Require Google Authenticator code</p>
            </div>
            <Switch checked={secSettings?.require_totp_withdrawal ?? false} onCheckedChange={(v) => updateToggle("require_totp_withdrawal", v)} />
          </div>
        </>
      )}
    </div>
  );
};

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

  // Change password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  // Change PIN state
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [changePinError, setChangePinError] = useState("");

  // Existing security status
  const [hasPin, setHasPin] = useState(false);
  const [hasTotp, setHasTotp] = useState(false);
  const [securityLoaded, setSecurityLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchSecSettings = async () => {
      const { data } = await supabase
        .from("user_security_settings" as any)
        .select("pin_enabled, totp_enabled")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setHasPin(!!(data as any).pin_enabled);
        setHasTotp(!!(data as any).totp_enabled);
        setPinDone(!!(data as any).pin_enabled);
        setTotpDone(!!(data as any).totp_enabled);
      }
      setSecurityLoaded(true);
    };
    fetchSecSettings();
  }, [user]);

  if (!authLoading && !user) {
    return <Navigate to="/auth" replace />;
  }

  const isFirstTimeSetup = securityLoaded && !hasPin && !hasTotp;

  // --- First-time PIN setup ---
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
      setHasPin(true);
      toast.success("PIN set successfully!");
      setStep("choose");
    } catch (err: any) {
      toast.error(err.message || "Failed to set PIN");
    } finally {
      setLoading(false);
    }
  };

  // --- TOTP ---
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
      setHasTotp(true);
      toast.success("2FA enabled successfully!");
      setStep("choose");
    } catch (err: any) {
      setTotpError(err.message || "Invalid code");
      setTotpCode("");
    } finally {
      setLoading(false);
    }
  };

  // --- Change Password ---
  const handleChangePassword = async () => {
    setPasswordError("");
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match");
      setConfirmPassword("");
      return;
    }

    setLoading(true);
    try {
      // Step 1: Re-authenticate with current password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user!.email!,
        password: currentPassword,
      });
      if (signInError) {
        setPasswordError("Current password is incorrect");
        setLoading(false);
        return;
      }

      // Step 2: Update to new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      // Notify user across all channels (Telegram, Aimtell, WhatsApp, web push)
      await supabase.from("notifications").insert({
        user_id: user!.id,
        title: "Password Changed 🔒",
        message: "Your account password was successfully changed. If this wasn't you, please contact support immediately.",
        type: "info",
      });

      toast.success("Password changed successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setStep("choose");
    } catch (err: any) {
      setPasswordError(err.message || "Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  // --- Change PIN ---
  const handleVerifyOldPin = async () => {
    setLoading(true);
    setChangePinError("");
    try {
      const { data, error } = await supabase.functions.invoke("verify-security", {
        body: { type: "pin", code: oldPin },
      });
      if (error) throw error;
      if (!data?.valid) {
        setChangePinError("Current PIN is incorrect");
        setOldPin("");
        setLoading(false);
        return;
      }
      setStep("change_pin_new");
    } catch (err: any) {
      setChangePinError(err.message || "Verification failed");
      setOldPin("");
    } finally {
      setLoading(false);
    }
  };

  const handleChangePin = async () => {
    if (newPin !== newPinConfirm) {
      setChangePinError("New PINs don't match");
      setNewPinConfirm("");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("setup-security-pin", {
        body: { pin: newPin, action: "change", old_pin: oldPin },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      // Notify user across all channels (Telegram, Aimtell, WhatsApp, web push)
      await supabase.from("notifications").insert({
        user_id: user!.id,
        title: "Security PIN Changed 🔐",
        message: "Your security PIN was successfully updated. If this wasn't you, please contact support immediately.",
        type: "info",
      });

      toast.success("PIN changed successfully!");
      setOldPin("");
      setNewPin("");
      setNewPinConfirm("");
      setStep("choose");
    } catch (err: any) {
      setChangePinError(err.message || "Failed to change PIN");
    } finally {
      setLoading(false);
    }
  };

  const canProceed = pinDone || totpDone;

  const handleContinue = () => {
    window.dispatchEvent(new Event("security-setup-complete"));
    navigate("/", { replace: true });
  };

  const copySecret = () => {
    navigator.clipboard.writeText(totpSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetToChoose = () => {
    setStep("choose");
    setPasswordError("");
    setChangePinError("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setOldPin("");
    setNewPin("");
    setNewPinConfirm("");
  };

  return (
    <>
      <SEOHead title="Security & KYC — oPoll" description="Manage your account security and identity verification" />
      <TopBar />
      <div className="min-h-screen pt-[calc(3.5rem+env(safe-area-inset-top))] pb-24 px-4 flex flex-col items-center">
        <div className="w-full max-w-md space-y-6 mt-8">
          <div className="text-center space-y-2">
            <Shield className="w-12 h-12 text-primary mx-auto" />
            <h1 className="text-2xl font-bold">
              {isFirstTimeSetup ? "Secure Your Account" : "Security & KYC"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {isFirstTimeSetup
                ? "Set up at least one security method to protect your account and enable withdrawals."
                : "Manage your password, PIN, two-factor authentication, and identity verification."}
            </p>
          </div>

          {step === "choose" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              {/* Change Password */}
              <button
                onClick={() => {
                  setStep("change_password");
                  setPasswordError("");
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                }}
                className="w-full p-4 rounded-xl border border-border bg-card hover:bg-muted/50 transition-all text-left flex items-center gap-4"
              >
                <div className="p-3 rounded-full bg-muted">
                  <KeyRound className="w-6 h-6 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold">Change Password</p>
                  <p className="text-sm text-muted-foreground">Update your account password</p>
                </div>
              </button>

              {/* PIN Card */}
              <button
                onClick={() => {
                  if (hasPin) {
                    setStep("change_pin_verify");
                    setOldPin("");
                    setNewPin("");
                    setNewPinConfirm("");
                    setChangePinError("");
                  } else {
                    setStep("pin");
                    setPin("");
                    setPinConfirm("");
                    setPinError("");
                  }
                }}
                className="w-full p-4 rounded-xl border border-border bg-card hover:bg-muted/50 transition-all text-left flex items-center gap-4"
              >
                <div className={`p-3 rounded-full ${pinDone ? "bg-primary/20" : "bg-muted"}`}>
                  {pinDone ? <CheckCircle2 className="w-6 h-6 text-primary" /> : <Lock className="w-6 h-6 text-muted-foreground" />}
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{hasPin ? "Change PIN" : "Set a 6-Digit PIN"}</p>
                  <p className="text-sm text-muted-foreground">
                    {hasPin ? "Update your security PIN" : "Quick numeric passcode for withdrawals"}
                  </p>
                </div>
              </button>

              {/* TOTP Card */}
              <button
                onClick={() => setStep("totp_generate")}
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

              {isFirstTimeSetup && (
                <>
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
                </>
              )}

              {!isFirstTimeSetup && (
                <>
                  {/* Security Toggles */}
                  <SecurityTogglesSection userId={user?.id} />

                  {/* KYC Section */}
                  <div className="pt-2">
                    <KycSubmissionForm />
                  </div>

                  <button
                    onClick={() => navigate(-1)}
                    className="w-full py-3 rounded-xl border border-border text-foreground font-semibold mt-4"
                  >
                    Back
                  </button>
                </>
              )}
            </motion.div>
          )}

          {/* ─── Change Password ─── */}
          {step === "change_password" && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <h2 className="text-lg font-semibold text-center">Change Password</h2>
              <p className="text-sm text-muted-foreground text-center">
                Enter your current password, then set a new one.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1">Current Password</label>
                  <div className="relative">
                    <input
                      type={showCurrentPw ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-foreground placeholder:text-muted-foreground pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPw(!showCurrentPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground block mb-1">New Password</label>
                  <div className="relative">
                    <input
                      type={showNewPw ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-foreground placeholder:text-muted-foreground pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw(!showNewPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground block mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>

              {passwordError && <p className="text-destructive text-sm text-center">{passwordError}</p>}

              <button
                onClick={handleChangePassword}
                disabled={!currentPassword || !newPassword || !confirmPassword || loading}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Update Password
              </button>
              <button onClick={resetToChoose} className="w-full py-2 text-muted-foreground text-sm">Back</button>
            </motion.div>
          )}

          {/* ─── Change PIN: Verify Current ─── */}
          {step === "change_pin_verify" && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <h2 className="text-lg font-semibold text-center">Enter Current PIN</h2>
              <p className="text-sm text-muted-foreground text-center">Verify your identity before changing your PIN.</p>
              <PinInput value={oldPin} onChange={setOldPin} error={!!changePinError} />
              {changePinError && <p className="text-destructive text-sm text-center">{changePinError}</p>}
              <button
                onClick={handleVerifyOldPin}
                disabled={oldPin.length !== 6 || loading}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Verify
              </button>
              <button onClick={resetToChoose} className="w-full py-2 text-muted-foreground text-sm">Back</button>
            </motion.div>
          )}

          {/* ─── Change PIN: Enter New ─── */}
          {step === "change_pin_new" && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <h2 className="text-lg font-semibold text-center">Enter New PIN</h2>
              <PinInput value={newPin} onChange={setNewPin} />
              <button
                onClick={() => { if (newPin.length === 6) setStep("change_pin_confirm"); }}
                disabled={newPin.length !== 6}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-40"
              >
                Next
              </button>
              <button onClick={resetToChoose} className="w-full py-2 text-muted-foreground text-sm">Back</button>
            </motion.div>
          )}

          {/* ─── Change PIN: Confirm New ─── */}
          {step === "change_pin_confirm" && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <h2 className="text-lg font-semibold text-center">Confirm New PIN</h2>
              <PinInput value={newPinConfirm} onChange={setNewPinConfirm} error={!!changePinError} />
              {changePinError && <p className="text-destructive text-sm text-center">{changePinError}</p>}
              <button
                onClick={handleChangePin}
                disabled={newPinConfirm.length !== 6 || loading}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Change PIN
              </button>
              <button onClick={() => { setStep("change_pin_new"); setNewPinConfirm(""); setChangePinError(""); }} className="w-full py-2 text-muted-foreground text-sm">Back</button>
            </motion.div>
          )}

          {/* ─── First-time PIN setup ─── */}
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
              <button onClick={resetToChoose} className="w-full py-2 text-muted-foreground text-sm">Back</button>
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

          {/* ─── TOTP setup ─── */}
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
              <button onClick={resetToChoose} className="w-full py-2 text-muted-foreground text-sm">Back</button>
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
              <button onClick={resetToChoose} className="w-full py-2 text-muted-foreground text-sm">Back</button>
            </motion.div>
          )}
        </div>
      </div>
    </>
  );
};

export default SetupSecurity;
