import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Gift, SmilePlus, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import EmojiPicker, { Theme } from "emoji-picker-react";
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
  const [showFullPicker, setShowFullPicker] = useState(false);
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
    setShowFullPicker(false);
  }, [user, reactions, m.id, conversationId, queryClient]);

  const openPicker = useCallback(() => {
    if (!bubbleRef.current) return;
    const rect = bubbleRef.current.getBoundingClientRect();
    const desiredTop = rect.top - 44;
    const minTop = 60; // below header
    setPickerPos({
      top: desiredTop < minTop ? rect.bottom + 4 : desiredTop,
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
      className={`absolute ${isMine ? "left-0 -translate-x-full" : "right-0 translate-x-full"} top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-all`}
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
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
            className={`w-fit rounded-2xl select-none touch-none ${
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
              <p className="text-[10px] text-muted-foreground mt-1.5">
                {isMine ? "Gift sent" : "Gift received"} · {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
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
