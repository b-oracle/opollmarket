import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminContext } from "./AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Clock, Loader2, Eye, User, FileText, Camera, Monitor } from "lucide-react";

type KycSubmission = {
  id: string;
  user_id: string;
  tier: number;
  status: string;
  full_name: string | null;
  date_of_birth: string | null;
  phone_number: string | null;
  address: string | null;
  selfie_url: string | null;
  id_front_url: string | null;
  id_back_url: string | null;
  utility_bill_url: string | null;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

const AdminKyc = () => {
  const { canEdit } = useAdminContext();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [processing, setProcessing] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [deviceLogs, setDeviceLogs] = useState<Record<string, any>>({}); // keyed by submission id

  const fetchDeviceLog = async (submissionId: string) => {
    if (deviceLogs[submissionId]) return; // already loaded
    const { data } = await supabase
      .from("kyc_device_logs" as any)
      .select("*")
      .eq("kyc_submission_id", submissionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setDeviceLogs((prev) => ({ ...prev, [submissionId]: data || "none" }));
  };

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["admin_kyc_submissions", filter],
    queryFn: async () => {
      let query = supabase
        .from("kyc_submissions" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (filter !== "all") {
        query = query.eq("status", filter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as KycSubmission[];
    },
  });

  const getSignedUrl = async (path: string): Promise<string | null> => {
    if (!path) return null;
    const { data } = await supabase.storage
      .from("kyc-documents")
      .createSignedUrl(path, 300); // 5 min
    return data?.signedUrl || null;
  };

  const handleViewImage = async (path: string) => {
    const url = await getSignedUrl(path);
    if (url) setViewingImage(url);
    else toast.error("Could not load document");
  };

  const handleAction = async (submission: KycSubmission, action: "approved" | "rejected") => {
    if (!canEdit) return;
    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Update submission
      const { error: subError } = await supabase
        .from("kyc_submissions" as any)
        .update({
          status: action,
          admin_note: adminNote || null,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", submission.id);
      if (subError) throw subError;

      // Update profile kyc_status
      const newKycStatus = action === "approved"
        ? (submission.tier === 2 ? "tier2" : "tier1")
        : "rejected";

      const { error: profError } = await supabase
        .from("profiles")
        .update({ kyc_status: newKycStatus } as any)
        .eq("id", submission.user_id);
      if (profError) throw profError;

      // Send notification
      await supabase.from("notifications").insert({
        user_id: submission.user_id,
        title: action === "approved" ? "KYC Approved ✓" : "KYC Rejected",
        message: action === "approved"
          ? `Your Tier ${submission.tier} identity verification has been approved. ${submission.tier === 1 ? "You can now withdraw up to $500/day." : "You now have full withdrawal access up to $50,000/day."}`
          : `Your identity verification was rejected. ${adminNote ? `Reason: ${adminNote}` : "Please resubmit with correct documents."}`,
        type: action === "approved" ? "info" : "warning",
      } as any);

      queryClient.invalidateQueries({ queryKey: ["admin_kyc_submissions"] });
      toast.success(`KYC ${action === "approved" ? "approved" : "rejected"}`);
      setReviewingId(null);
      setAdminNote("");
    } catch (err: any) {
      toast.error(err.message || "Action failed");
    } finally {
      setProcessing(false);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge className="bg-amber-500/10 text-amber-500 border-0"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case "approved": return <Badge className="bg-green-500/10 text-green-500 border-0"><CheckCircle2 className="w-3 h-3 mr-1" />Approved</Badge>;
      case "rejected": return <Badge className="bg-destructive/10 text-destructive border-0"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">KYC Verification</h1>
        <div className="flex gap-1 p-1 rounded-lg bg-muted/50">
          {(["pending", "approved", "rejected", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : submissions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">No {filter !== "all" ? filter : ""} submissions</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {submissions.map((sub) => (
            <Card key={sub.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">{sub.full_name || "No name"}</CardTitle>
                      <p className="text-xs text-muted-foreground">Tier {sub.tier} · {new Date(sub.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(sub.status)}
                    <Badge variant="outline" className="text-[10px]">Tier {sub.tier}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {sub.date_of_birth && (
                    <div><span className="text-muted-foreground">DOB:</span> {sub.date_of_birth}</div>
                  )}
                  {sub.phone_number && (
                    <div><span className="text-muted-foreground">Phone:</span> {sub.phone_number}</div>
                  )}
                  {sub.address && (
                    <div className="col-span-2"><span className="text-muted-foreground">Address:</span> {sub.address}</div>
                  )}
                  <div className="text-muted-foreground text-[10px]">ID: {sub.user_id.slice(0, 8)}…</div>
                </div>

                {/* Document links */}
                <div className="flex flex-wrap gap-2">
                  {sub.selfie_url && (
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleViewImage(sub.selfie_url!)}>
                      <Camera className="w-3 h-3 mr-1" /> Selfie
                    </Button>
                  )}
                  {sub.id_front_url && (
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleViewImage(sub.id_front_url!)}>
                      <FileText className="w-3 h-3 mr-1" /> ID Front
                    </Button>
                  )}
                  {sub.id_back_url && (
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleViewImage(sub.id_back_url!)}>
                      <FileText className="w-3 h-3 mr-1" /> ID Back
                    </Button>
                  )}
                  {sub.utility_bill_url && (
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleViewImage(sub.utility_bill_url!)}>
                      <FileText className="w-3 h-3 mr-1" /> Utility Bill
                    </Button>
                  )}
                </div>

                {/* Device info */}
                <div className="pt-1">
                  {!deviceLogs[sub.id] ? (
                    <Button variant="ghost" size="sm" className="text-xs h-6 text-muted-foreground" onClick={() => fetchDeviceLog(sub.id)}>
                      <Monitor className="w-3 h-3 mr-1" /> Show Device Info
                    </Button>
                  ) : deviceLogs[sub.id] === "none" ? (
                    <p className="text-[10px] text-muted-foreground italic">No device data recorded</p>
                  ) : (
                    <div className="rounded-lg bg-muted/30 p-2 space-y-0.5">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Device Fingerprint</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
                        <div><span className="text-muted-foreground">IP:</span> {(deviceLogs[sub.id] as any).ip_address}</div>
                        <div><span className="text-muted-foreground">Screen:</span> {(deviceLogs[sub.id] as any).screen_width}×{(deviceLogs[sub.id] as any).screen_height} @{(deviceLogs[sub.id] as any).device_pixel_ratio}x</div>
                        <div><span className="text-muted-foreground">Platform:</span> {(deviceLogs[sub.id] as any).platform}</div>
                        <div><span className="text-muted-foreground">Language:</span> {(deviceLogs[sub.id] as any).language}</div>
                        <div className="col-span-2"><span className="text-muted-foreground">Timezone:</span> {(deviceLogs[sub.id] as any).timezone}</div>
                        <div className="col-span-2 break-all"><span className="text-muted-foreground">UA:</span> {(deviceLogs[sub.id] as any).user_agent}</div>
                      </div>
                    </div>
                  )}
                </div>

                {sub.admin_note && (
                  <p className="text-xs text-muted-foreground italic">Note: {sub.admin_note}</p>
                )}

                {/* Review actions */}
                {sub.status === "pending" && canEdit && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    {reviewingId === sub.id ? (
                      <>
                        <Input
                          placeholder="Admin note (optional, shown to user on rejection)"
                          value={adminNote}
                          onChange={(e) => setAdminNote(e.target.value)}
                          className="text-xs"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => handleAction(sub, "approved")}
                            disabled={processing}
                          >
                            {processing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="flex-1"
                            onClick={() => handleAction(sub, "rejected")}
                            disabled={processing}
                          >
                            {processing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                            Reject
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setReviewingId(null); setAdminNote(""); }}>
                            Cancel
                          </Button>
                        </div>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setReviewingId(sub.id)} className="w-full">
                        <Eye className="w-3 h-3 mr-1" /> Review
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Image viewer overlay */}
      {viewingImage && (
        <div
          className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setViewingImage(null)}
        >
          <img
            src={viewingImage}
            alt="KYC Document"
            className="max-w-full max-h-[80vh] rounded-xl shadow-xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 px-4 py-2 rounded-lg bg-muted text-sm font-semibold"
            onClick={() => setViewingImage(null)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminKyc;
