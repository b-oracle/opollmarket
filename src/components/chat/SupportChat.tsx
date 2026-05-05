import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Send, Image as ImageIcon, CheckCircle2, XCircle, RotateCcw, X, Sparkles, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import SupportMessageBubble from "./SupportMessageBubble";
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; content: string; senderName: string } | null>(null);
  const [aiTyping, setAiTyping] = useState(false);
  const [sending, setSending] = useState(false);

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
        .select("id, display_name, avatar_url, verification_level")
        .in("id", userIds);

      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
      return msgs.map((m: any) => ({
        ...m,
        profile: profileMap.get(m.user_id) || { display_name: m.is_staff ? "Support" : "User", avatar_url: null },
      }));
    },
    refetchInterval: 5000,
  });

  // Mark ticket as read on mount and whenever new messages arrive
  useEffect(() => {
    if (user) {
      localStorage.setItem(`support_ticket_read_${user.id}_${ticketId}`, new Date().toISOString());
      queryClient.invalidateQueries({ queryKey: ["unread-support"] });
    }
  }, [ticketId, user, messages.length, queryClient]);

  useEffect(() => {
    const channel = supabase
      .channel(`support-${ticketId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticketId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["support-messages", ticketId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ticketId, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" as any });
  }, [messages.length]);

  const scrollToMessage = useCallback((messageId: string) => {
    const el = document.getElementById(`support-msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("bg-primary/10");
      setTimeout(() => el.classList.remove("bg-primary/10"), 1500);
    }
  }, []);

  const sendMessage = useCallback(async (content?: string, imageUrl?: string) => {
    if (!user || sending) return;
    const text = content || message;
    if (!text.trim() && !imageUrl) return;
    setSending(true);

    const payload: any = {
      ticket_id: ticketId,
      user_id: user.id,
      content: text || "",
      image_url: imageUrl || null,
      is_staff: isStaff,
    };

    if (replyTo) {
      payload.reply_to_id = replyTo.id;
      payload.reply_to_content = replyTo.content;
      payload.reply_to_sender_name = replyTo.senderName;
    }

    const { error } = await supabase.from("support_messages" as any).insert(payload as any);

    if (error) {
      toast.error("Failed to send");
      setSending(false);
      return;
    }
    setMessage("");
    setReplyTo(null);

    // Trigger AI auto-reply for non-staff messages
    if (!isStaff) {
      setAiTyping(true);
      try {
        await supabase.functions.invoke("support-ai-reply", {
          body: { ticket_id: ticketId },
        });
      } catch (e) {
        console.error("AI reply failed:", e);
      } finally {
        setAiTyping(false);
        setSending(false);
      }
    } else {
      setSending(false);
    }
  }, [user, message, ticketId, isStaff, replyTo, sending]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); e.target.value = ""; return; }
    const ext = file.name.split(".").pop();
    const path = `${user.id}/support-${ticketId}-${Date.now()}.${ext}`;
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
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border" style={{ paddingTop: "max(0.75rem, var(--safe-top))" }}>
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold truncate">{ticket?.subject || "Support"}</h2>
          <div className="flex items-center gap-1.5">
            {ticket?.ticket_number ? (
              <span className="text-[10px] font-mono text-primary font-semibold">#{ticket.ticket_number}</span>
            ) : null}
            {ticket?.ticket_number ? <span className="text-[10px] text-muted-foreground">·</span> : null}
            <span className={`text-[10px] capitalize ${statusColor}`}>{ticket?.status || "open"}</span>
          </div>
        </div>
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

      <div ref={scrollContainerRef} data-chat-scroll className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((m: any) => (
          <SupportMessageBubble
            key={m.id}
            message={m}
            onReply={!isLocked ? setReplyTo : undefined}
            onScrollToMessage={scrollToMessage}
          />
        ))}
        {aiTyping && (
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-violet-500" />
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>OPoll AI is typing</span>
              <span className="inline-flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {!isLocked && (
        <div className="shrink-0" style={{ paddingBottom: "max(0.375rem, var(--safe-bottom))" }}>
          {replyTo && (
            <div className="px-4 py-1.5 flex items-center gap-2 bg-muted/50 border-t border-border">
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-semibold text-primary block">Replying to {replyTo.senderName}</span>
                <span className="text-xs text-muted-foreground truncate block">{replyTo.content.slice(0, 60)}</span>
              </div>
              <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="px-4 py-1.5 flex gap-2 items-end">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            <button onClick={() => fileRef.current?.click()} className="text-muted-foreground hover:text-foreground pb-2">
              <ImageIcon className="w-5 h-5" />
            </button>
            <Textarea
              placeholder="Type a message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              className="min-h-[36px] max-h-[120px] text-sm resize-none py-2"
              rows={1}
            />
            <Button size="sm" className="h-9 w-9 p-0 shrink-0" disabled={!message.trim() || sending} onClick={() => sendMessage()}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      )}
      {isLocked && (
        <div className="shrink-0 px-4 py-1.5 text-center" style={{ paddingBottom: "max(0.375rem, var(--safe-bottom))" }}>
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
