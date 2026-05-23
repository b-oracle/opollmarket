import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, ShieldAlert, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import SEOHead from "@/components/SEOHead";

const DeleteAccount = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    if (!confirm) {
      toast.error("Please confirm you understand this request");
      return;
    }
    setSubmitting(true);
    try {
      const subject = "Account Deletion Request";
      const { data: ticket, error } = await supabase
        .from("support_tickets" as any)
        .insert({ user_id: user.id, subject, category: "account" } as any)
        .select("id")
        .single() as any;
      if (error) throw error;

      const body = `ACCOUNT DELETION REQUEST\n\nUser: ${user.email}\nUser ID: ${user.id}\n\nReason: ${reason.trim() || "(not provided)"}\n\nI request that my account and all associated personal data be permanently deleted in accordance with the privacy policy.`;

      await supabase.from("support_messages" as any).insert({
        ticket_id: ticket.id,
        user_id: user.id,
        content: body,
        is_staff: false,
      } as any);

      toast.success("Deletion request submitted. Our team will contact you within 30 days.");
      navigate("/");
    } catch (e: any) {
      toast.error(e?.message || "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <SEOHead title="Delete Account — OPollmarket" description="Request permanent deletion of your OPollmarket account and associated data." />
      <div className="min-h-screen pt-[calc(var(--safe-top)+4rem)] pb-24 px-4 max-w-xl mx-auto">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground mb-4 hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <Trash2 className="w-6 h-6 text-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Delete Account</h1>
            <p className="text-xs text-muted-foreground">Request permanent removal of your data</p>
          </div>
        </div>

        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 mt-6 mb-4">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div className="text-xs text-destructive/90 leading-relaxed">
              This will permanently delete your profile, predictions history, balances, messages, and all personal data. <strong>Outstanding balances must be withdrawn first.</strong> This action cannot be undone once processed.
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div>
            <label className="text-sm font-semibold mb-2 block">Reason (optional)</label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Tell us why you're leaving so we can improve..."
              rows={4}
              maxLength={500}
            />
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox checked={confirm} onCheckedChange={(c) => setConfirm(!!c)} className="mt-0.5" />
            <span className="text-xs text-muted-foreground leading-relaxed">
              I understand my account and all associated data will be permanently deleted and that this action cannot be undone.
            </span>
          </label>

          <Button
            variant="destructive"
            className="w-full h-11"
            disabled={!confirm || submitting || !user}
            onClick={submit}
          >
            {submitting ? "Submitting..." : user ? "Submit Deletion Request" : "Sign in to Continue"}
          </Button>

          {!user && (
            <p className="text-xs text-center text-muted-foreground">
              You must be signed in to request account deletion.
            </p>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground text-center mt-6 leading-relaxed">
          Requests are typically processed within 30 days. We may retain limited data where required by law (e.g. financial records). See our <a href="/privacy" className="underline">Privacy Policy</a> for details.
        </p>
      </div>
    </>
  );
};

export default DeleteAccount;
