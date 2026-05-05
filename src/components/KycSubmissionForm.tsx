import { useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, Upload, CheckCircle2, Clock, XCircle, Loader2, Camera, FileText, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { compressImage } from "@/lib/imageCompression";
import kycSelfieSample from "@/assets/kyc-selfie-sample.png";
import { AlertTriangle } from "lucide-react";

const collectDeviceInfo = () => ({
  screen_width: window.screen?.width,
  screen_height: window.screen?.height,
  device_pixel_ratio: window.devicePixelRatio,
  platform: navigator.platform || navigator.userAgent,
  language: navigator.language,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});

const logKycDevice = async (kycSubmissionId: string) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    if (!projectId) return;
    await fetch(`https://${projectId}.supabase.co/functions/v1/log-kyc-device`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ kyc_submission_id: kycSubmissionId, ...collectDeviceInfo() }),
    });
  } catch (e) {
    console.warn("Device log failed:", e);
  }
};

const KYC_STATUS_CONFIG = {
  none: { label: "Unverified", icon: Shield, color: "bg-muted text-muted-foreground" },
  pending: { label: "Under Review", icon: Clock, color: "bg-amber-500/10 text-amber-500" },
  tier1: { label: "Basic Verified", icon: CheckCircle2, color: "bg-green-500/10 text-green-500" },
  tier2: { label: "Fully Verified", icon: CheckCircle2, color: "bg-primary/10 text-primary" },
  rejected: { label: "Rejected", icon: XCircle, color: "bg-destructive/10 text-destructive" },
} as const;

const KycSubmissionForm = ({ onSkip }: { onSkip?: () => void }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  // Tier 1 fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [selfieFile, setSelfieFile] = useState<File | null>(null);

  // Tier 2 fields
  const [address, setAddress] = useState("");
  const [idFrontFile, setIdFrontFile] = useState<File | null>(null);
  const [idBackFile, setIdBackFile] = useState<File | null>(null);
  const [utilityFile, setUtilityFile] = useState<File | null>(null);

  const { data: kycStatus = "none" } = useQuery({
    queryKey: ["kyc_status", user?.id],
    queryFn: async () => {
      if (!user) return "none";
      const { data } = await supabase
        .from("profiles")
        .select("kyc_status")
        .eq("id", user.id)
        .single();
      return (data as any)?.kyc_status || "none";
    },
    enabled: !!user,
  });

  const { data: latestSubmission } = useQuery({
    queryKey: ["kyc_submission", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("kyc_submissions" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
    enabled: !!user,
  });

  const uploadFile = useCallback(async (file: File, folder: string): Promise<string> => {
    if (!user) throw new Error("Not authenticated");
    const compressed = await compressImage(file, "social");
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${folder}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("kyc-documents")
      .upload(path, compressed, { upsert: true });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return path;
  }, [user]);

  const handleTier1Submit = async () => {
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!user || !fullName || !firstName.trim() || !lastName.trim() || !dob || !phone.trim() || !selfieFile) {
      toast.error("Please fill all fields and upload a selfie");
      return;
    }
    setSubmitting(true);
    try {
      const selfieUrl = await uploadFile(selfieFile, "selfie");
      const { data: inserted, error } = await supabase.from("kyc_submissions" as any).insert({
        user_id: user.id,
        tier: 1,
        status: "pending",
        full_name: fullName,
        date_of_birth: dob,
        phone_number: phone.trim(),
        selfie_url: selfieUrl,
      } as any).select("id").single();
      if (error) throw error;

      // Log device info for fraud prevention
      if ((inserted as any)?.id) logKycDevice((inserted as any).id);

      // Set profile to pending
      await supabase.from("profiles").update({ kyc_status: "pending" } as any).eq("id", user.id);

      queryClient.invalidateQueries({ queryKey: ["kyc_status"] });
      queryClient.invalidateQueries({ queryKey: ["kyc_submission"] });
      toast.success("KYC submitted! We'll review within 24 hours.");
      setFirstName(""); setLastName(""); setDob(""); setPhone(""); setSelfieFile(null);
    } catch (err: any) {
      toast.error(err.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTier2Submit = async () => {
    if (!user || !address.trim() || !idFrontFile || !idBackFile || !utilityFile) {
      toast.error("Please fill all fields and upload all documents");
      return;
    }
    setSubmitting(true);
    try {
      const [idFrontUrl, idBackUrl, utilityUrl] = await Promise.all([
        uploadFile(idFrontFile, "id_front"),
        uploadFile(idBackFile, "id_back"),
        uploadFile(utilityFile, "utility_bill"),
      ]);
      const { data: inserted, error } = await supabase.from("kyc_submissions" as any).insert({
        user_id: user.id,
        tier: 2,
        status: "pending",
        full_name: latestSubmission?.full_name || "",
        address: address.trim(),
        id_front_url: idFrontUrl,
        id_back_url: idBackUrl,
        utility_bill_url: utilityUrl,
      } as any).select("id").single();
      if (error) throw error;

      if ((inserted as any)?.id) logKycDevice((inserted as any).id);

      await supabase.from("profiles").update({ kyc_status: "pending" } as any).eq("id", user.id);

      queryClient.invalidateQueries({ queryKey: ["kyc_status"] });
      queryClient.invalidateQueries({ queryKey: ["kyc_submission"] });
      toast.success("Tier 2 KYC submitted! We'll review within 24 hours.");
      setAddress(""); setIdFrontFile(null); setIdBackFile(null); setUtilityFile(null);
    } catch (err: any) {
      toast.error(err.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const statusConfig = KYC_STATUS_CONFIG[kycStatus as keyof typeof KYC_STATUS_CONFIG] || KYC_STATUS_CONFIG.none;
  const StatusIcon = statusConfig.icon;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Identity Verification (KYC)</h3>
        <Badge className={`text-[10px] ${statusConfig.color} border-0`}>
          <StatusIcon className="w-3 h-3 mr-1" />
          {statusConfig.label}
        </Badge>
      </div>

      {/* Status: rejected — show rejection note */}
      {kycStatus === "rejected" && latestSubmission?.admin_note && (
        <div className="glass rounded-xl p-4 mb-3 border border-destructive/20 bg-destructive/5">
          <p className="text-xs text-destructive font-semibold mb-1">Submission Rejected</p>
          <p className="text-xs text-muted-foreground">{latestSubmission.admin_note}</p>
        </div>
      )}

      {/* Status: pending — waiting */}
      {kycStatus === "pending" && (
        <div className="glass rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Verification In Progress</p>
            <p className="text-xs text-muted-foreground">Your documents are being reviewed. This usually takes less than 24 hours.</p>
          </div>
        </div>
      )}

      {/* Status: tier2 — fully verified */}
      {kycStatus === "tier2" && (
        <div className="glass rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Fully Verified</p>
            <p className="text-xs text-muted-foreground">You have full withdrawal access up to $50,000/day.</p>
          </div>
        </div>
      )}

      {/* Status: tier1 — show upgrade to tier2 */}
      {kycStatus === "tier1" && (
        <div className="space-y-3">
          <div className="glass rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Basic Verified — $500/day limit</p>
              <p className="text-xs text-muted-foreground">Upgrade to Full KYC for $50,000/day limit.</p>
            </div>
          </div>

          <div className="glass rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Upgrade to Tier 2</p>
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Home Address</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full residential address" className="mt-1" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Government-Issued ID (Front)</Label>
                  <div className="mt-1">
                    <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border cursor-pointer hover:bg-muted/50 transition-colors">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground truncate">{idFrontFile?.name || "Upload front of ID"}</span>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => setIdFrontFile(e.target.files?.[0] || null)} />
                    </label>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Government-Issued ID (Back)</Label>
                  <div className="mt-1">
                    <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border cursor-pointer hover:bg-muted/50 transition-colors">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground truncate">{idBackFile?.name || "Upload back of ID"}</span>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => setIdBackFile(e.target.files?.[0] || null)} />
                    </label>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs">Utility Bill (showing address)</Label>
                <div className="mt-1">
                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border cursor-pointer hover:bg-muted/50 transition-colors">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground truncate">{utilityFile?.name || "Upload utility bill"}</span>
                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setUtilityFile(e.target.files?.[0] || null)} />
                  </label>
                </div>
              </div>
            </div>
            <Button onClick={handleTier2Submit} disabled={submitting} className="w-full" size="sm">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              Submit Tier 2 Verification
            </Button>
          </div>
        </div>
      )}

      {/* Status: none or rejected — show tier1 form */}
      {(kycStatus === "none" || kycStatus === "rejected") && (
        <div className="glass rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Basic Verification (Tier 1)</p>
          <p className="text-xs text-muted-foreground">
            Required before making any withdrawals. Upload a selfie holding a note showing today's date, your full name, and "Opollmarket".
          </p>
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">First Name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Last Name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Date of Birth</Label>
                <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Phone Number</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234..." className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Selfie (holding note with date + name + "Opollmarket")</Label>

              <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                  <span className="font-semibold">Important:</span> Your selfie must clearly show you holding a piece of paper with{" "}
                  <span className="font-bold">OPOLLMARKET</span> and{" "}
                  <span className="font-bold">today's date ({new Date().toLocaleDateString()})</span> handwritten on it. Submissions without this exact format will be <span className="font-semibold">rejected</span>.
                </div>
              </div>

              <div className="mt-2 flex justify-center">
                <figure className="flex flex-col items-center gap-1">
                  <img
                    src={kycSelfieSample}
                    alt="Sample of person holding paper with OPOLLMARKET and today's date written on it"
                    width={160}
                    height={160}
                    loading="lazy"
                    className="w-40 h-40 object-contain rounded-lg border border-border bg-background"
                  />
                  <figcaption className="text-[10px] text-muted-foreground">Sample — yours should look like this</figcaption>
                </figure>
              </div>

              <div className="mt-2">
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border cursor-pointer hover:bg-muted/50 transition-colors">
                  <Camera className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground truncate">{selfieFile?.name || "Upload selfie photo"}</span>
                  <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => setSelfieFile(e.target.files?.[0] || null)} />
                </label>
              </div>
            </div>
          </div>
          <Button onClick={handleTier1Submit} disabled={submitting} className="w-full" size="sm">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
            Submit Verification
          </Button>
          {onSkip && (
            <Button variant="ghost" onClick={onSkip} className="w-full text-xs text-muted-foreground" size="sm">
              Skip for now
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default KycSubmissionForm;
