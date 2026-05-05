import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";
import SupportChat from "@/components/chat/SupportChat";

const categoryMap: Record<string, string> = {
  withdrawal: "Withdrawal",
  deposit: "Deposit",
  quick_trade: "Quick Trade",
  prediction: "Prediction",
  account: "Account",
  kyc: "KYC",
  copy_trade: "Copy Trade",
  technical: "Technical",
  general: "General",
};

const AdminSupport = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTicket, setActiveTicket] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["admin-support-tickets", statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("support_tickets" as any)
        .select("*")
        .order("created_at", { ascending: false }) as any;

      if (statusFilter !== "all") {
        q = q.eq("status", statusFilter);
      }

      const { data } = await q;
      if (!data || data.length === 0) return [];

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
    },
    enabled: !!user,
  });

  const updateStatus = async (ticketId: string, status: string) => {
    await supabase
      .from("support_tickets" as any)
      .update({ status, updated_at: new Date().toISOString() } as any)
      .eq("id", ticketId);
    queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
  };

  const statusColors: Record<string, string> = {
    open: "bg-amber-500/10 text-amber-500",
    in_progress: "bg-blue-500/10 text-blue-500",
    resolved: "bg-emerald-500/10 text-emerald-500",
    closed: "bg-muted text-muted-foreground",
  };

  const filteredTickets = useMemo(() => {
    if (!searchQuery.trim()) return tickets;
    const q = searchQuery.toLowerCase();
    return tickets.filter((t: any) => t.subject?.toLowerCase().includes(q) || t.profile?.display_name?.toLowerCase().includes(q) || t.category?.toLowerCase().includes(q) || t.id?.toLowerCase().includes(q));
  }, [tickets, searchQuery]);

  if (activeTicket) {
    return (
      <div className="h-[80vh]">
        <SupportChat ticketId={activeTicket} isStaff={true} onBack={() => { setActiveTicket(null); queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] }); }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Support Tickets</h2>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Input
        placeholder="Search by subject, user, or category…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="h-9 text-sm"
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredTickets.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">No tickets found</p>
      ) : (
        <div className="space-y-2">
          {filteredTickets.map((t: any) => (
            <div
              key={t.id}
              className="border border-border rounded-lg p-3 hover:bg-accent/20 transition-colors cursor-pointer"
              onClick={() => setActiveTicket(t.id)}
            >
              <div className="flex items-center gap-2 mb-1">
                {t.ticket_number ? (
                  <span className="text-[11px] font-mono font-bold text-primary shrink-0">#{t.ticket_number}</span>
                ) : null}
                <span className="text-sm font-semibold flex-1 truncate">{t.subject}</span>
                {t.category && (
                  <Badge variant="secondary" className="text-[10px] h-5">
                    {categoryMap[t.category] || t.category}
                  </Badge>
                )}
                <Badge variant="outline" className={`text-[10px] ${statusColors[t.status] || ""}`}>
                  {t.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {t.profile?.display_name} · {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                </span>
                <div className="flex gap-1">
                  {t.status === "open" && (
                    <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={(e) => { e.stopPropagation(); updateStatus(t.id, "in_progress"); }}>
                      Take
                    </Button>
                  )}
                  {(t.status === "open" || t.status === "in_progress") && (
                    <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={(e) => { e.stopPropagation(); updateStatus(t.id, "resolved"); }}>
                      Resolve
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminSupport;
