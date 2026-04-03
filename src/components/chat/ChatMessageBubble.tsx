import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Gift } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
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

  const handleLongPress = useCallback(() => {
    setShowReactions(true);
  }, []);

  const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0);

  const cleanContent = links.length > 0
    ? m.content.replace(/https?:\/\/[^\s]+/g, "").replace(/\/(?:market|spaces)\/[a-f0-9-]+/g, "").trim()
    : m.content;

  const handleLinkClick = (link: string) => {
    const path = link.replace(/https?:\/\/[^/]+/, "");
    navigate(path.startsWith("/") ? path : `/${path}`);
  };

  if (isGift) {
    return (
      <div className={`flex ${isMine ? "justify-end" : "justify-start"} group relative`}>
        <div
          className={`max-w-[75%] rounded-2xl px-4 py-3 border ${
            isMine ? "bg-primary/10 border-primary/20" : "bg-accent/30 border-accent/50"
          }`}
          onContextMenu={(e) => { e.preventDefault(); handleLongPress(); }}
          onDoubleClick={handleLongPress}
        >
          <div className="flex items-center gap-2 mb-1">
            <Gift className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-primary">${m.gift_amount}</span>
          </div>
          <p className="text-lg">{m.content}</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
          </p>
          {reactionEntries.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
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
          )}
        </div>
        {showReactions && <ReactionPicker onSelect={toggleReaction} onClose={() => setShowReactions(false)} isMine={isMine} />}
      </div>
    );
  }

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"} group relative`}>
      <div className="max-w-[75%] space-y-1">
        <div
          className={`rounded-2xl px-3.5 py-2 ${
            isMine
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-muted text-foreground rounded-bl-md"
          }`}
          onContextMenu={(e) => { e.preventDefault(); handleLongPress(); }}
          onDoubleClick={handleLongPress}
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

        {reactionEntries.length > 0 && (
          <div className="flex flex-wrap gap-1">
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
        )}
      </div>
      {showReactions && <ReactionPicker onSelect={toggleReaction} onClose={() => setShowReactions(false)} isMine={isMine} />}
    </div>
  );
};

const ReactionPicker = ({ onSelect, onClose, isMine }: { onSelect: (e: string) => void; onClose: () => void; isMine: boolean }) => (
  <>
    <div className="fixed inset-0 z-40" onClick={onClose} />
    <div className={`absolute ${isMine ? "right-0" : "left-0"} -top-10 z-50 flex gap-1 bg-background border border-border rounded-full px-2 py-1 shadow-lg`}>
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onSelect(emoji)}
          className="text-lg hover:scale-125 transition-transform active:scale-95 p-0.5"
        >
          {emoji}
        </button>
      ))}
    </div>
  </>
);

export default ChatMessageBubble;
