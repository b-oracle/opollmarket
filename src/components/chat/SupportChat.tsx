import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Send, Image as ImageIcon, CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SupportChatProps {
  ticketId: string;
  onBack: () => void;
  isStaff?: boolean;
}

const SupportChat = ({ ticketId, onBack, isStaff = false }: SupportChatProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: ticket } = useQuery({
    queryKey: ["support-ticket", ticketId],
    queryFn: async () => {
      const { data } = await supabase
        .from("support_tickets" as any)
        .select("*")
        .eq("id", ticketId)
        .single() as any;
      return data;
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["support-messages", ticketId],
    queryFn: async () => {
      const { data: msgs } = await supabase
        .from("support_messages" as any)
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true }) as any;

      if (!msgs || msgs.length === 0) return [];

      const userIds = [...new Set(msgs.map((m: any) => m.user_id))] as string[];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", userIds);

      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
      return msgs.map((m: any) => ({
        ...m,
        profile: profileMap.get(m.user_id) || { display_name: m.is_staff ? "Support" : "User", avatar_url: null },
      }));
    },
    refetchInterval: 5000,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`support-${ticketId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticketId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["support-messages", ticketId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ticketId, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" as any });
  }, [messages.length]);

  const sendMessage = useCallback(async (content?: string, imageUrl?: string) => {
    if (!user) return;
    const text = content || message.trim();
    if (!text && !imageUrl) return;

    const { error } = await supabase.from("support_messages" as any).insert({
      ticket_id: ticketId,
      user_id: user.id,
      content: text || "",
      image_url: imageUrl || null,
      is_staff: isStaff,
    } as any);

    if (error) {
      toast.error("Failed to send");
      return;
    }
    setMessage("");
  }, [user, message, ticketId, isStaff]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const ext = file.name.split(".").pop();
    const path = `support/${ticketId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("market-images").upload(path, file);
    if (error) {
      toast.error("Upload failed");
      return;
    }
    const { data: urlData } = supabase.storage.from("market-images").getPublicUrl(path);
    await sendMessage("", urlData.publicUrl);
    e.target.value = "";
  };

  const isLocked = ticket?.status === "closed";

  const [statusConfirm, setStatusConfirm] = useState<{ action: string; label: string } | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const updateTicketStatus = useCallback(async (newStatus: string) => {
    setUpdatingStatus(true);
    const { error } = await supabase
      .from("support_tickets" as any)
      .update({ status: newStatus, updated_at: new Date().toISOString() } as any)
      .eq("id", ticketId);
    if (error) {
      toast.error("Failed to update status");
    } else {
      toast.success(`Ticket ${newStatus}`);
      queryClient.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
    }
    setUpdatingStatus(false);
    setStatusConfirm(null);
  }, [ticketId, queryClient]);

  const statusColor = ticket?.status === "resolved" ? "text-emerald-500" : ticket?.status === "closed" ? "text-muted-foreground" : "text-amber-500";

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold truncate">{ticket?.subject || "Support"}</h2>
          <span className={`text-[10px] capitalize ${statusColor}`}>{ticket?.status || "open"}</span>
        </div>
        {/* Status actions */}
        {!isLocked && (
          <div className="flex gap-1.5 shrink-0">
            {isStaff && ticket?.status === "open" && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setStatusConfirm({ action: "resolved", label: "Resolve" })}>
                <CheckCircle2 className="w-3 h-3" /> Resolve
              </Button>
            )}
            {isStaff && ticket?.status === "resolved" && (
              <>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setStatusConfirm({ action: "open", label: "Reopen" })}>
                  <RotateCcw className="w-3 h-3" /> Reopen
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive border-destructive/30" onClick={() => setStatusConfirm({ action: "closed", label: "Close" })}>
                  <XCircle className="w-3 h-3" /> Close
                </Button>
              </>
            )}
            {!isStaff && ticket?.status === "open" && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive border-destructive/30" onClick={() => setStatusConfirm({ action: "closed", label: "Close" })}>
                <XCircle className="w-3 h-3" /> Close
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((m: any) => {
          const isMe = m.user_id === user?.id;
          return (
            <div key={m.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center overflow-hidden shrink-0 mt-0.5 ${m.is_staff ? "bg-emerald-500/20" : "bg-primary/20"}`}>
                {m.profile?.avatar_url ? (
                  <img src={m.profile.avatar_url} className="w-full h-full object-cover" alt="" />
                ) : (
                  <span className={`text-[10px] font-bold ${m.is_staff ? "text-emerald-500" : "text-primary"}`}>
                    {m.is_staff ? "S" : (m.profile?.display_name || "?").charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className={`max-w-[75%] ${isMe ? "items-end" : ""}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold">
                    {m.is_staff ? "Support Staff" : m.profile?.display_name || "You"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                  </span>
                </div>
                {m.content && <p className="text-sm break-words">{m.content}</p>}
                {m.image_url && (
                  <img src={m.image_url} className="mt-1 rounded-lg max-w-[200px] max-h-[200px] object-cover cursor-pointer" onClick={() => window.open(m.image_url, "_blank")} alt="attachment" />
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {!isLocked && (
        <div className="shrink-0 px-4 py-1.5 flex gap-2" style={{ paddingBottom: "max(0.375rem, var(--safe-bottom))" }}>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          <button onClick={() => fileRef.current?.click()} className="text-muted-foreground hover:text-foreground">
            <ImageIcon className="w-5 h-5" />
          </button>
          <Input
            placeholder="Type a message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            className="h-9 text-sm"
          />
          <Button size="sm" className="h-9 w-9 p-0" disabled={!message.trim()} onClick={() => sendMessage()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      )}
      {isLocked && (
        <div className="shrink-0 px-4 py-1.5 pb-0 text-center">
          <p className="text-xs text-muted-foreground">This ticket has been closed</p>
        </div>
      )}

      <AlertDialog open={!!statusConfirm} onOpenChange={(o) => !o && setStatusConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{statusConfirm?.label} Ticket</AlertDialogTitle>
            <AlertDialogDescription>
              {statusConfirm?.action === "resolved" && "This marks the ticket as resolved. The user can still reply."}
              {statusConfirm?.action === "closed" && "This will permanently close the ticket. No further messages can be sent."}
              {statusConfirm?.action === "open" && "This will reopen the ticket for further discussion."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updatingStatus}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={updatingStatus} onClick={() => statusConfirm && updateTicketStatus(statusConfirm.action)}>
              {statusConfirm?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SupportChat;
