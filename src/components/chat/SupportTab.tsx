import { useState } from "react";
import { Search } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadCounts } from "@/hooks/useUnreadCounts";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { Plus, HelpCircle, ChevronRight, Clock, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import SupportChat from "./SupportChat";

const categories = [
  { value: "withdrawal", label: "Withdrawal Issue" },
  { value: "deposit", label: "Deposit Issue" },
  { value: "quick_trade", label: "Quick Trade Issue" },
  { value: "prediction", label: "Prediction Market Issue" },
  { value: "account", label: "Account / Profile Issue" },
  { value: "kyc", label: "KYC / Verification" },
  { value: "copy_trade", label: "Copy Trading Issue" },
  { value: "technical", label: "Technical / Bug Report" },
  { value: "general", label: "Other / General" },
];

const categoryMap = Object.fromEntries(categories.map((c) => [c.value, c.label]));

const statusConfig: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  open: { icon: AlertCircle, label: "Open", color: "text-amber-500 bg-amber-500/10" },
  in_progress: { icon: Clock, label: "In Progress", color: "text-blue-500 bg-blue-500/10" },
  resolved: { icon: CheckCircle2, label: "Resolved", color: "text-emerald-500 bg-emerald-500/10" },
  closed: { icon: CheckCircle2, label: "Closed", color: "text-muted-foreground bg-muted" },
};

const STATUS_FILTERS = [
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

const SupportTab = ({ onOpenChat }: { onOpenChat?: (ticketId: string, isStaff: boolean) => void }) => {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { isFeatureEnabled } = useFeatureToggles();
  const { supportPerTicket, markTicketRead } = useUnreadCounts();
  const [showNew, setShowNew] = useState(false);
  const [category, setCategory] = useState("");
  const [desc, setDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeTicket, setActiveTicket] = useState<string | null>(null);
  const [isStaffTicket, setIsStaffTicket] = useState(false);
  const [statusFilter, setStatusFilter] = useState("open");
  const [ticketSearch, setTicketSearch] = useState("");
  const [deleteTicketId, setDeleteTicketId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Check if user has support role
  const { data: hasSupport } = useQuery({
    queryKey: ["has-support-role", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", user.id)
        .eq("role", "support")
        .maybeSingle();
      return !!data;
    },
    enabled: !!user,
  });

  const isStaff = isAdmin || isSuperAdmin || !!hasSupport;

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["support-tickets", user?.id, isStaff],
    queryFn: async () => {
      if (!user) return [];
      let q = supabase
        .from("support_tickets" as any)
        .select("*")
        .order("created_at", { ascending: false }) as any;

      // Staff see all tickets; regular users see only their own
      if (!isStaff) {
        q = q.eq("user_id", user.id);
      }

      const { data } = await q;
      if (!data || data.length === 0) return [];

      if (isStaff) {
        // Enrich with profile info for staff view
        const userIds = [...new Set(data.map((t: any) => t.user_id))] as string[];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", userIds);
        const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
        return data.map((t: any) => ({
          ...t,
          profile: profileMap.get(t.user_id) || { display_name: "User", avatar_url: null },
        }));
      }

      return data;
    },
    enabled: !!user,
  });

  const filteredTickets = tickets.filter((t: any) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (ticketSearch.trim()) {
      const q = ticketSearch.toLowerCase();
      const subject = (t.subject || "").toLowerCase();
      const cat = (categoryMap[t.category] || t.category || "").toLowerCase();
      const name = (t.profile?.display_name || "").toLowerCase();
      if (!subject.includes(q) && !cat.includes(q) && !name.includes(q)) return false;
    }
    return true;
  });

  const createTicket = async () => {
    if (!user || !category || !desc.trim()) return;
    setSubmitting(true);
    try {
      const subject = categoryMap[category] || category;
      const { data: ticket, error } = await supabase
        .from("support_tickets" as any)
        .insert({ user_id: user.id, subject, category } as any)
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
      setCategory("");
      setDesc("");
      setShowNew(false);
      toast.success("Ticket created");

      // Trigger AI auto-reply BEFORE navigating (fire-and-forget)
      const ticketIdForAi = ticket.id;
      supabase.functions.invoke("support-ai-reply", {
        body: { ticket_id: ticketIdForAi },
      }).catch((e) => console.error("AI initial reply failed:", e));

      // Navigate to chat after triggering AI
      if (onOpenChat) { onOpenChat(ticket.id, false); } else { setActiveTicket(ticket.id); }
    } catch {
      toast.error("Failed to create ticket");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTicket = async () => {
    if (!deleteTicketId) return;
    setDeleting(true);
    try {
      // Delete messages first, then the ticket
      await supabase.from("support_messages").delete().eq("ticket_id", deleteTicketId);
      const { error } = await supabase.from("support_tickets").delete().eq("id", deleteTicketId);
      if (error) throw error;
      toast.success("Ticket deleted");
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete ticket");
    } finally {
      setDeleting(false);
      setDeleteTicketId(null);
    }
  };

  if (!onOpenChat && activeTicket) {
    return (
      <div className="h-[calc(100dvh-120px)]">
        <SupportChat ticketId={activeTicket} isStaff={isStaffTicket} onBack={() => { setActiveTicket(null); setIsStaffTicket(false); queryClient.invalidateQueries({ queryKey: ["support-tickets"] }); }} />
      </div>
    );
  }

  return (
    <div>
      {showNew ? (
        <div className="p-4 border-b border-border space-y-3">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Select issue category..." />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Describe your issue..."
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="min-h-[80px] text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={submitting || !category || !desc.trim()} onClick={createTicket}>
              {submitting ? "Creating..." : "Submit Ticket"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
          </div>
        </div>
      ) : !isStaff ? (
        <div className="p-4 border-b border-border">
          <Button size="sm" onClick={() => setShowNew(true)} className="w-full gap-2">
            <Plus className="w-4 h-4" /> New Support Ticket
          </Button>
        </div>
      ) : null}

      {/* Search bar */}
      {tickets.length > 0 && isFeatureEnabled("chat_search") && (
        <div className="px-4 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search tickets..."
              value={ticketSearch}
              onChange={(e) => setTicketSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-3 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex border-b border-border px-2">
        {STATUS_FILTERS.map((f) => {
          const count = f.key === "all" ? tickets.length : tickets.filter((t: any) => t.status === f.key).length;
          return (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`flex-1 px-2 py-2 text-xs font-medium transition-colors relative whitespace-nowrap ${
                statusFilter === f.key
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
              {count > 0 && (
                <span className="ml-1 text-[10px] opacity-60">({count})</span>
              )}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <HelpCircle className="w-12 h-12 opacity-30" />
          <p className="text-sm">
            {statusFilter === "all" ? "No support tickets" : `No ${statusFilter} tickets`}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {filteredTickets.map((t: any) => {
            const sc = statusConfig[t.status] || statusConfig.open;
            const StatusIcon = sc.icon;
            return (
              <div key={t.id} className="flex items-center gap-0 hover:bg-accent/30 transition-colors">
                <button
                  onClick={() => {
                    const staffView = isStaff && t.user_id !== user?.id;
                    markTicketRead(t.id);
                    queryClient.invalidateQueries({ queryKey: ["unread-support"] });
                    if (onOpenChat) { onOpenChat(t.id, staffView); }
                    else { setActiveTicket(t.id); if (staffView) setIsStaffTicket(true); }
                  }}
                  className="flex-1 flex items-center gap-3 px-4 py-3 text-left min-w-0"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${sc.color}`}>
                    <StatusIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {t.ticket_number ? (
                        <span className="text-[10px] font-mono font-bold text-primary shrink-0">#{t.ticket_number}</span>
                      ) : null}
                      <span className="text-sm font-semibold truncate block">
                        {isStaff && t.profile ? `${t.profile.display_name}: ` : ""}{t.subject}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${sc.color}`}>
                        {sc.label}
                      </span>
                      {t.category && t.category !== "general" && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                          {categoryMap[t.category] || t.category}
                        </Badge>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  {(supportPerTicket[t.id] || 0) > 0 ? (
                    <span className="min-w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1 shrink-0">
                      {supportPerTicket[t.id]}
                    </span>
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </button>
                {isSuperAdmin && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTicketId(t.id); }}
                    className="px-3 py-3 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    title="Delete ticket"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteTicketId} onOpenChange={(open) => !open && setDeleteTicketId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Ticket</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this support ticket and all its messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTicket} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SupportTab;
