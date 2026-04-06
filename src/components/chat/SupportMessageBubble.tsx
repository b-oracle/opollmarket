import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Copy, Plus, Reply, BadgeCheck, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const REACTION_EMOJIS = ["❤️", "😂", "👍", "😮", "😢", "🔥"];

interface SupportMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  content: string;
  image_url?: string | null;
  is_staff: boolean;
  is_ai?: boolean;
  created_at: string;
  reactions?: Record<string, string[]>;
  reply_to_id?: string | null;
  reply_to_content?: string | null;
  reply_to_sender_name?: string | null;
  profile?: { display_name: string; avatar_url: string | null; verification_level?: string };
}

interface SupportMessageBubbleProps {
  message: SupportMessage;
  onReply?: (info: { id: string; content: string; senderName: string }) => void;
  onScrollToMessage?: (messageId: string) => void;
}

const SupportMessageBubble = ({ message: m, onReply, onScrollToMessage }: SupportMessageBubbleProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showReactions, setShowReactions] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const [flipReactions, setFlipReactions] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const bubbleRef = useRef<HTMLDivElement>(null);
  const isMe = m.user_id === user?.id;
  const reactions: Record<string, string[]> = (m.reactions as any) || {};

  const toggleReaction = useCallback(async (emoji: string) => {
    if (!user) return;
    const current = { ...reactions };
    const users = current[emoji] || [];
    if (users.includes(user.id)) {
      current[emoji] = users.filter((u) => u !== user.id);
      if (current[emoji].length === 0) delete current[emoji];
    } else {
      current[emoji] = [...users, user.id];
    }
    await supabase
      .from("support_messages" as any)
      .update({ reactions: current } as any)
      .eq("id", m.id);
    queryClient.invalidateQueries({ queryKey: ["support-messages", m.ticket_id] });
    setShowReactions(false);
    setShowFullPicker(false);
  }, [user, reactions, m.id, m.ticket_id, queryClient]);

  const openPicker = useCallback(() => {
    if (bubbleRef.current) {
      const rect = bubbleRef.current.getBoundingClientRect();
      const scrollContainer = bubbleRef.current.closest('[data-chat-scroll]');
      const containerTop = scrollContainer ? scrollContainer.getBoundingClientRect().top : 0;
      const trayHeight = 48;
      setFlipReactions(rect.top - containerTop < trayHeight + 8);
    }
    setShowReactions(true);
    if (navigator.vibrate) navigator.vibrate(10);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    longPressTimer.current = setTimeout(openPicker, 500);
  }, [openPicker]);

  const cancelPress = useCallback(() => {
    clearTimeout(longPressTimer.current);
  }, []);

  const handleCopy = useCallback(() => {
    if (m.content) {
      navigator.clipboard.writeText(m.content).then(() => toast.success("Copied")).catch(() => toast.error("Failed to copy"));
    }
    setShowReactions(false);
    setShowFullPicker(false);
  }, [m.content]);

  const handleReply = useCallback(() => {
    if (!onReply) return;
    onReply({
      id: m.id,
      content: m.content || (m.image_url ? "📷 Image" : ""),
      senderName: m.is_staff ? "Support Staff" : m.profile?.display_name || "User",
    });
    setShowReactions(false);
    setShowFullPicker(false);
  }, [onReply, m]);

  const dismiss = useCallback(() => {
    setShowReactions(false);
    setShowFullPicker(false);
  }, []);

  const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0);
  const isDark = document.documentElement.classList.contains("dark");

  const pointerProps = {
    onPointerDown: handlePointerDown,
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
    onPointerLeave: cancelPress,
  };

  const replyPreview = m.reply_to_id && m.reply_to_content && (
    <button
      onClick={() => m.reply_to_id && onScrollToMessage?.(m.reply_to_id)}
      className={cn(
        "w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg mb-1 border-l-2 truncate",
        isMe
          ? "bg-primary-foreground/10 border-primary-foreground/40 text-primary-foreground/80"
          : "bg-foreground/5 border-primary/40 text-muted-foreground"
      )}
    >
      <span className="font-semibold block text-[10px]">{m.reply_to_sender_name || "User"}</span>
      <span className="truncate block">{m.reply_to_content.slice(0, 80)}</span>
    </button>
  );

  const reactionBadges = reactionEntries.length > 0 && (
    <div className="flex flex-wrap gap-1 mt-1">
      {reactionEntries.map(([emoji, users]) => (
        <button
          key={emoji}
          onClick={() => toggleReaction(emoji)}
          className={`text-xs px-1.5 py-0.5 rounded-full border transition-colors ${
            users.includes(user?.id || "")
              ? "bg-primary/20 border-primary/40"
              : "bg-muted border-border hover:bg-accent"
          }`}
        >
          {emoji} {users.length}
        </button>
      ))}
    </div>
  );

  const reactionBar = showReactions && (
    <>
      <div className="fixed inset-0 z-40" onClick={dismiss} />
      {!showFullPicker ? (
         <div
           className={cn(
             "absolute z-50 flex items-center gap-0.5 bg-background/95 backdrop-blur-sm border border-border rounded-full px-1.5 py-1 shadow-xl",
             flipReactions ? "top-full mt-1" : "bottom-full mb-1",
             isMe ? "right-0" : "left-0"
           )}
         >
          {REACTION_EMOJIS.map((emoji) => (
            <button key={emoji} onClick={() => toggleReaction(emoji)} className="text-base hover:scale-125 transition-transform active:scale-95 p-0.5">
              {emoji}
            </button>
          ))}
          <button onClick={() => setShowFullPicker(true)} className="w-6 h-6 flex items-center justify-center rounded-full bg-muted hover:bg-accent transition-colors flex-shrink-0">
            <Plus className="w-3 h-3 text-muted-foreground" />
          </button>
          <div className="w-px h-4 bg-border mx-0.5 flex-shrink-0" />
          <button onClick={handleReply} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-accent transition-colors flex-shrink-0" title="Reply">
            <Reply className="w-3 h-3 text-muted-foreground" />
          </button>
          <button onClick={handleCopy} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-accent transition-colors flex-shrink-0" title="Copy">
            <Copy className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
      ) : (
        <AnimatePresence>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed z-50 bottom-0 left-0 right-0">
            <EmojiPicker onEmojiClick={(emojiData) => toggleReaction(emojiData.emoji)} theme={isDark ? Theme.DARK : Theme.LIGHT} width="100%" height={350} searchPlaceholder="Search emoji..." lazyLoadEmojis />
          </motion.div>
        </AnimatePresence>
      )}
    </>
  );

  return (
    <div className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`} id={`support-msg-${m.id}`}>
      <button
        onClick={() => navigate(`/user/${m.user_id}`)}
        className={`w-7 h-7 rounded-full flex items-center justify-center overflow-hidden shrink-0 mt-0.5 ${m.is_staff ? "bg-emerald-500/20" : "bg-primary/20"}`}
      >
        {m.profile?.avatar_url ? (
          <img src={m.profile.avatar_url} className="w-full h-full object-cover" alt="" />
        ) : (
          <span className={`text-[10px] font-bold ${m.is_staff ? "text-emerald-500" : "text-primary"}`}>
            {m.is_staff ? "S" : (m.profile?.display_name || "?").charAt(0).toUpperCase()}
          </span>
        )}
      </button>
      <div className="relative max-w-[75%] overflow-visible">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-semibold">
              {m.is_staff ? "Support Staff" : m.profile?.display_name || "You"}
            </span>
            {!m.is_staff && m.profile?.verification_level === "gold" && (
              <BadgeCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            )}
            {!m.is_staff && m.profile?.verification_level === "blue" && (
              <BadgeCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            )}
            <span className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
            </span>
          </div>
          <div
            ref={bubbleRef}
            className={cn(
              "rounded-2xl px-3.5 py-2 select-none touch-none",
              isMe ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted text-foreground rounded-bl-md"
            )}
            {...pointerProps}
          >
            {replyPreview}
            {m.content && <p className="text-sm break-words whitespace-pre-wrap">{m.content}</p>}
            {m.image_url && (
              <img src={m.image_url} className="mt-1 rounded-lg max-w-[200px] max-h-[200px] object-cover cursor-pointer" onClick={() => window.open(m.image_url!, "_blank")} alt="attachment" />
            )}
          </div>
          {reactionBadges}
        </div>
        {reactionBar}
      </div>
    </div>
  );
};

export default SupportMessageBubble;
