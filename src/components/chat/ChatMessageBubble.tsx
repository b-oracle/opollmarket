import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Plus, Phone, PhoneMissed, PhoneOff, Copy, Trash2, Check, CheckCheck, Reply } from "lucide-react";
import GiftMessageBubble from "./GiftMessageBubble";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import EmojiPicker, { Theme } from "emoji-picker-react";
import ChatLinkPreview from "./ChatLinkPreview";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const REACTION_EMOJIS = ["❤️", "😂", "👍", "😮", "😢", "🔥"];

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  gift_amount: number | null;
  created_at: string;
  read_at: string | null;
  reactions?: Record<string, string[]>;
  reply_to_id?: string | null;
  reply_to_content?: string | null;
  reply_to_sender_name?: string | null;
}

interface ChatMessageBubbleProps {
  message: Message;
  conversationId: string;
  onReply?: (info: { id: string; content: string; senderName: string }) => void;
  onScrollToMessage?: (messageId: string) => void;
}

const INTERNAL_LINK_REGEX = /(?:https?:\/\/[^\s]+)?\/(?:market|spaces)\/([a-f0-9-]+)/gi;
const CALL_MSG_REGEX = /^\[CALL:(ended|missed|declined):(\d+)\]$/;

function extractInternalLinks(content: string): string[] {
  const matches = content.match(INTERNAL_LINK_REGEX);
  return matches || [];
}

const ChatMessageBubble = ({ message: m, conversationId, onReply, onScrollToMessage }: ChatMessageBubbleProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showReactions, setShowReactions] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const [flipReactions, setFlipReactions] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const isMine = m.sender_id === user?.id;
  const isGift = m.gift_amount != null && m.gift_amount > 0;
  const callMatch = m.content.match(CALL_MSG_REGEX);
  const reactions: Record<string, string[]> = (m.reactions as any) || {};
  const links = callMatch ? [] : extractInternalLinks(m.content);

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
      .from("dm_messages" as any)
      .update({ reactions: current } as any)
      .eq("id", m.id);

    queryClient.invalidateQueries({ queryKey: ["dm-messages", conversationId] });
    setShowReactions(false);
    setShowFullPicker(false);
  }, [user, reactions, m.id, conversationId, queryClient]);

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
    longPressTimer.current = setTimeout(() => {
      openPicker();
    }, 500);
  }, [openPicker]);

  const handlePointerUp = useCallback(() => {
    clearTimeout(longPressTimer.current);
  }, []);

  const handlePointerCancel = useCallback(() => {
    clearTimeout(longPressTimer.current);
  }, []);

  const handleCopy = useCallback(() => {
    if (m.content) {
      navigator.clipboard.writeText(m.content).then(() => {
        toast.success("Message copied");
      }).catch(() => {
        toast.error("Failed to copy");
      });
    }
    setShowReactions(false);
    setShowFullPicker(false);
  }, [m.content]);

  const handleDelete = useCallback(async () => {
    if (!isMine) return;
    try {
      await supabase
        .from("dm_messages" as any)
        .delete()
        .eq("id", m.id);
      queryClient.invalidateQueries({ queryKey: ["dm-messages", conversationId] });
      toast.success("Message deleted");
    } catch {
      toast.error("Failed to delete");
    }
    setShowReactions(false);
    setShowFullPicker(false);
  }, [isMine, m.id, conversationId, queryClient]);

  const handleReply = useCallback(() => {
    if (!onReply) return;
    onReply({
      id: m.id,
      content: m.content,
      senderName: isMine ? "You" : "them",
    });
    setShowReactions(false);
    setShowFullPicker(false);
  }, [onReply, m.id, m.content, isMine]);

  const dismiss = useCallback(() => {
    setShowReactions(false);
    setShowFullPicker(false);
  }, []);

  const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0);

  const cleanContent = links.length > 0
    ? m.content.replace(/https?:\/\/[^\s]+/g, "").replace(/\/(?:market|spaces)\/[a-f0-9-]+/g, "").trim()
    : m.content;

  const handleLinkClick = (link: string) => {
    const path = link.replace(/https?:\/\/[^/]+/, "");
    navigate(path.startsWith("/") ? path : `/${path}`);
  };

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

  const isDark = document.documentElement.classList.contains("dark");

  const pointerProps = {
    onPointerDown: handlePointerDown,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onPointerLeave: handlePointerCancel,
  };

  // Reply preview shown above message content
  const replyPreview = m.reply_to_id && m.reply_to_content && (
    <button
      onClick={() => m.reply_to_id && onScrollToMessage?.(m.reply_to_id)}
      className={cn(
        "w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg mb-1 border-l-2 truncate",
        isMine
          ? "bg-primary-foreground/10 border-primary-foreground/40 text-primary-foreground/80"
          : "bg-foreground/5 border-primary/40 text-muted-foreground"
      )}
    >
      <span className="font-semibold block text-[10px]">{m.reply_to_sender_name || "User"}</span>
      <span className="truncate block">{m.reply_to_content.slice(0, 80)}</span>
    </button>
  );

  const reactionBar = showReactions && (
    <>
      <div className="fixed inset-0 z-40" onClick={dismiss} />

      {!showFullPicker ? (
        <div
          className={cn(
            "absolute z-50 flex items-center gap-0.5 bg-background/95 backdrop-blur-sm border border-border rounded-full px-1.5 py-1 shadow-xl",
            flipReactions ? "top-full mt-1" : "bottom-full mb-1",
            isMine ? "right-0" : "left-0"
          )}
        >
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => toggleReaction(emoji)}
              className="text-base hover:scale-125 transition-transform active:scale-95 p-0.5"
            >
              {emoji}
            </button>
          ))}
          <button
            onClick={() => setShowFullPicker(true)}
            className="w-6 h-6 flex items-center justify-center rounded-full bg-muted hover:bg-accent transition-colors flex-shrink-0"
          >
            <Plus className="w-3 h-3 text-muted-foreground" />
          </button>
          <div className="w-px h-4 bg-border mx-0.5 flex-shrink-0" />
          <button
            onClick={handleReply}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-accent transition-colors flex-shrink-0"
            title="Reply"
          >
            <Reply className="w-3 h-3 text-muted-foreground" />
          </button>
          <button
            onClick={handleCopy}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-accent transition-colors flex-shrink-0"
            title="Copy"
          >
            <Copy className="w-3 h-3 text-muted-foreground" />
          </button>
          {isMine && (
            <button
              onClick={handleDelete}
              className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-destructive/10 transition-colors flex-shrink-0"
              title="Delete"
            >
              <Trash2 className="w-3 h-3 text-destructive" />
            </button>
          )}
        </div>
      ) : (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed z-50 bottom-0 left-0 right-0"
          >
            <EmojiPicker
              onEmojiClick={(emojiData) => toggleReaction(emojiData.emoji)}
              theme={isDark ? Theme.DARK : Theme.LIGHT}
              width="100%"
              height={350}
              searchPlaceholder="Search emoji..."
              lazyLoadEmojis
            />
          </motion.div>
        </AnimatePresence>
      )}
    </>
  );

  // System call message
  if (callMatch) {
    const [, callStatus, durationStr] = callMatch;
    const dur = parseInt(durationStr, 10);
    const formatCallDuration = (s: number) => {
      const min = Math.floor(s / 60);
      const sec = s % 60;
      return `${min}:${sec.toString().padStart(2, "0")}`;
    };

    const icon = callStatus === "ended"
      ? <Phone className="w-4 h-4 text-emerald-500" />
      : callStatus === "missed"
        ? <PhoneMissed className="w-4 h-4 text-destructive" />
        : <PhoneOff className="w-4 h-4 text-destructive" />;

    const label = callStatus === "ended"
      ? `Voice call · ${formatCallDuration(dur)}`
      : callStatus === "missed"
        ? "Missed call"
        : "Call declined";

    return (
      <div className="flex justify-center my-2" id={`msg-${m.id}`}>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted/60 text-muted-foreground text-xs">
          {icon}
          <span>{label}</span>
          <span>· {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}</span>
        </div>
      </div>
    );
  }

  if (isGift) {
    return (
      <div className={`flex ${isMine ? "justify-end" : "justify-start"} group`} id={`msg-${m.id}`}>
        <div className="relative" ref={bubbleRef}>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
            className={`w-fit rounded-2xl select-none touch-manipulation ${
              isMine
                ? "bg-primary/15 rounded-br-md"
                : "bg-accent/20 rounded-bl-md"
            }`}
            {...pointerProps}
          >
            <div className="px-4 py-3 text-center">
              <p className="text-2xl mb-1">{m.content}</p>
              <motion.p
                className="text-lg font-bold text-primary"
                initial={{ scale: 0.7 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 12, delay: 0.1 }}
              >
                ${m.gift_amount}
              </motion.p>
              <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center justify-center gap-1">
                {isMine ? "Gift sent" : "Gift received"} · {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                {isMine && (
                  m.read_at
                    ? <CheckCheck className="w-3 h-3 text-blue-500" />
                    : <Check className="w-3 h-3 text-muted-foreground" />
                )}
              </p>
              {reactionBadges}
            </div>
          </motion.div>
          {reactionBar}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"} group`} id={`msg-${m.id}`}>
      <div className="relative max-w-[75%] overflow-visible" ref={bubbleRef}>
        <div className="space-y-1">
          <div
            className={`rounded-2xl px-3.5 py-2 select-none touch-manipulation ${
              isMine
                ? "bg-primary text-primary-foreground rounded-br-md"
                : "bg-muted text-foreground rounded-bl-md"
            }`}
            {...pointerProps}
          >
            {replyPreview}
            {cleanContent && (
              <p className="text-sm whitespace-pre-wrap break-words">{cleanContent}</p>
            )}
            <p className={`text-[10px] mt-1 flex items-center gap-1 ${isMine ? "text-primary-foreground/60 justify-end" : "text-muted-foreground"}`}>
              {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
              {isMine && (
                m.read_at
                  ? <CheckCheck className="w-3 h-3 text-blue-500" />
                  : <Check className="w-3 h-3 text-primary-foreground/60" />
              )}
            </p>
          </div>

          {links.map((link, i) => (
            <ChatLinkPreview key={i} url={link} onClick={() => handleLinkClick(link)} />
          ))}

          {reactionBadges}
        </div>
        {reactionBar}
      </div>
    </div>
  );
};

export default ChatMessageBubble;
