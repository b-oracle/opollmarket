import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Gift, SmilePlus, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import ChatLinkPreview from "./ChatLinkPreview";

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
}

interface ChatMessageBubbleProps {
  message: Message;
  conversationId: string;
}

const INTERNAL_LINK_REGEX = /(?:https?:\/\/[^\s]+)?\/(?:market|spaces)\/([a-f0-9-]+)/gi;

function extractInternalLinks(content: string): string[] {
  const matches = content.match(INTERNAL_LINK_REGEX);
  return matches || [];
}

const ChatMessageBubble = ({ message: m, conversationId }: ChatMessageBubbleProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showReactions, setShowReactions] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const isMine = m.sender_id === user?.id;
  const isGift = m.gift_amount != null && m.gift_amount > 0;
  const reactions: Record<string, string[]> = (m.reactions as any) || {};
  const links = extractInternalLinks(m.content);

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
  }, [user, reactions, m.id, conversationId, queryClient]);

  const openPicker = useCallback(() => {
    if (!bubbleRef.current) return;
    const rect = bubbleRef.current.getBoundingClientRect();
    setPickerPos({
      top: rect.top - 44,
      left: Math.max(8, Math.min(rect.left + rect.width / 2 - 100, window.innerWidth - 208)),
    });
    setShowReactions(true);
    if (navigator.vibrate) navigator.vibrate(10);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only primary button
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

  const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0);

  const cleanContent = links.length > 0
    ? m.content.replace(/https?:\/\/[^\s]+/g, "").replace(/\/(?:market|spaces)\/[a-f0-9-]+/g, "").trim()
    : m.content;

  const handleLinkClick = (link: string) => {
    const path = link.replace(/https?:\/\/[^/]+/, "");
    navigate(path.startsWith("/") ? path : `/${path}`);
  };

  const smileyButton = (
    <button
      onClick={(e) => { e.stopPropagation(); openPicker(); }}
      className={`absolute ${isMine ? "-left-7" : "-right-7"} top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-all`}
    >
      <SmilePlus className="w-3.5 h-3.5" />
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

  const pickerOverlay = showReactions && pickerPos && (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setShowReactions(false)} />
      <div
        className="fixed z-50 flex gap-1 bg-background border border-border rounded-full px-2 py-1 shadow-lg"
        style={{ top: pickerPos.top, left: pickerPos.left }}
      >
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => toggleReaction(emoji)}
            className="text-lg hover:scale-125 transition-transform active:scale-95 p-0.5"
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );

  const pointerProps = {
    onPointerDown: handlePointerDown,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onPointerLeave: handlePointerCancel,
  };

  if (isGift) {
    return (
      <div className={`flex ${isMine ? "justify-end" : "justify-start"} group relative`}>
        <div className="relative" ref={bubbleRef}>
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
            className={`max-w-[75%] rounded-2xl overflow-hidden select-none touch-none border ${
              isMine
                ? "border-primary/30 bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5"
                : "border-accent/40 bg-gradient-to-br from-accent/30 via-accent/15 to-accent/5"
            }`}
            {...pointerProps}
          >
            {/* Shimmer overlay */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
              initial={{ x: "-100%" }}
              animate={{ x: "200%" }}
              transition={{ duration: 1.5, delay: 0.3, ease: "easeInOut" }}
            />

            <div className="relative px-4 py-3">
              {/* Header with sparkle */}
              <div className="flex items-center gap-1.5 mb-2">
                <motion.div
                  animate={{ rotate: [0, 15, -15, 0] }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                >
                  <Gift className="w-4 h-4 text-primary" />
                </motion.div>
                <span className="text-[11px] font-medium text-muted-foreground">
                  {isMine ? "You sent a gift" : "Gift received!"}
                </span>
                <motion.div
                  animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 1.5, repeat: 2, ease: "easeInOut" }}
                >
                  <Sparkles className="w-3 h-3 text-yellow-400" />
                </motion.div>
              </div>

              {/* Amount - big and bold */}
              <motion.p
                className="text-2xl font-bold text-primary"
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 12, delay: 0.15 }}
              >
                ${m.gift_amount}
              </motion.p>

              {/* Gift emoji content */}
              <p className="text-xl mt-1">{m.content}</p>

              <p className="text-[10px] text-muted-foreground/70 mt-2">
                {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
              </p>
              {reactionBadges}
            </div>
          </motion.div>
          {smileyButton}
        </div>
        {pickerOverlay}
      </div>
    );
  }

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"} group relative`}>
      <div className="relative max-w-[75%]" ref={bubbleRef}>
        <div className="space-y-1">
          <div
            className={`rounded-2xl px-3.5 py-2 select-none touch-none ${
              isMine
                ? "bg-primary text-primary-foreground rounded-br-md"
                : "bg-muted text-foreground rounded-bl-md"
            }`}
            {...pointerProps}
          >
            {cleanContent && (
              <p className="text-sm whitespace-pre-wrap break-words">{cleanContent}</p>
            )}
            <p className={`text-[10px] mt-1 ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
              {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
            </p>
          </div>

          {links.map((link, i) => (
            <ChatLinkPreview key={i} url={link} onClick={() => handleLinkClick(link)} />
          ))}

          {reactionBadges}
        </div>
        {smileyButton}
      </div>
      {pickerOverlay}
    </div>
  );
};

export default ChatMessageBubble;
