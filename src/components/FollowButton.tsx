import { useFollow } from "@/hooks/useFollow";
import { useAuth } from "@/hooks/useAuth";
import { UserPlus, UserMinus, Loader2 } from "lucide-react";

interface FollowButtonProps {
  userId: string;
  size?: "sm" | "md";
}

const FollowButton = ({ userId, size = "sm" }: FollowButtonProps) => {
  const { user } = useAuth();
  const { isFollowing, loading, toggleFollow } = useFollow(userId);

  if (!user || user.id === userId) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        toggleFollow();
      }}
      disabled={loading}
      className={`rounded-lg font-semibold flex items-center justify-center gap-1 transition-all shrink-0 ${
        size === "sm" ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-xs"
      } ${
        isFollowing
          ? "glass text-muted-foreground hover:text-destructive hover:border-destructive/30"
          : "bg-primary text-primary-foreground hover:bg-primary/90"
      }`}
    >
      {loading ? (
        <Loader2 className={`animate-spin ${size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"}`} />
      ) : isFollowing ? (
        <UserMinus className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} />
      ) : (
        <UserPlus className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} />
      )}
      {isFollowing ? "Following" : "Follow"}
    </button>
  );
};

export default FollowButton;
