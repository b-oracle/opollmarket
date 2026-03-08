import { useState, useCallback } from "react";
import { useFollow } from "@/hooks/useFollow";
import { useAuth } from "@/hooks/useAuth";
import { UserPlus, UserMinus, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface FollowButtonProps {
  userId: string;
  size?: "sm" | "md";
}

const FollowButton = ({ userId, size = "sm" }: FollowButtonProps) => {
  const { user } = useAuth();
  const { isFollowing, loading, toggleFollow } = useFollow(userId);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!user || user.id === userId) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFollowing) {
      setShowConfirm(true);
    } else {
      toggleFollow();
    }
  };

  const handleConfirmUnfollow = () => {
    setShowConfirm(false);
    toggleFollow();
  };

  return (
    <>
      <button
        onClick={handleClick}
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
        {isFollowing ? "Unfollow" : "Follow"}
      </button>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="max-w-xs rounded-2xl" onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Unfollow?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              You will stop receiving notifications about their activity and copy-trade settings will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl text-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmUnfollow}
              className="rounded-xl text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Unfollow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default FollowButton;
