import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Plus, HelpCircle, ChevronRight, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import SupportChat from "./SupportChat";

const statusConfig: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  open: { icon: AlertCircle, label: "Open", color: "text-amber-500 bg-amber-500/10" },
  in_progress: { icon: Clock, label: "In Progress", color: "text-blue-500 bg-blue-500/10" },
  resolved: { icon: CheckCircle2, label: "Resolved", color: "text-emerald-500 bg-emerald-500/10" },
  closed: { icon: CheckCircle2, label: "Closed", color: "text-muted-foreground bg-muted" },
};

const SupportTab = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [subject, setSubject] = useState("");
  const [desc, setDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeTicket, setActiveTicket] = useState<string | null>(null);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["support-tickets", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("support_tickets" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }) as any;
      return data || [];
    },
    enabled: !!user,
  });

  const createTicket = async () => {
    if (!user || !subject.trim() || !desc.trim()) return;
    setSubmitting(true);
    try {
      const { data: ticket, error } = await supabase
        .from("support_tickets" as any)
        .insert({ user_id: user.id, subject: subject.trim() } as any)
        .select("id")
        .single() as any;

      if (error) throw error;

      await supabase.from("support_messages" as any).insert({
        ticket_id: ticket.id,
        user_id: user.id,
        content: desc.trim(),
        is_staff: false,
      } as any);

      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      setSubject("");
      setDesc("");
      setShowNew(false);
      setActiveTicket(ticket.id);
      toast.success("Ticket created");
    } catch {
      toast.error("Failed to create ticket");
    } finally {
      setSubmitting(false);
    }
  };

  if (activeTicket) {
    return <SupportChat ticketId={activeTicket} onBack={() => { setActiveTicket(null); queryClient.invalidateQueries({ queryKey: ["support-tickets"] }); }} />;
  }

  return (
    <div>
      {/* New ticket form */}
      {showNew ? (
        <div className="p-4 border-b border-border space-y-3">
          <Input
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-9"
          />
          <Textarea
            placeholder="Describe your issue..."
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="min-h-[80px] text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={submitting || !subject.trim() || !desc.trim()} onClick={createTicket}>
              {submitting ? "Creating..." : "Submit Ticket"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="p-4 border-b border-border">
          <Button size="sm" onClick={() => setShowNew(true)} className="w-full gap-2">
            <Plus className="w-4 h-4" /> New Support Ticket
          </Button>
        </div>
      )}

      {/* Ticket list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <HelpCircle className="w-12 h-12 opacity-30" />
          <p className="text-sm">No support tickets</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {tickets.map((t: any) => {
            const sc = statusConfig[t.status] || statusConfig.open;
            const StatusIcon = sc.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTicket(t.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors text-left"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${sc.color}`}>
                  <StatusIcon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold truncate block">{t.subject}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${sc.color}`}>
                      {sc.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SupportTab;
