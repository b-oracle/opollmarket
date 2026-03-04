import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface SignOutConfirmDialogProps {
  open: boolean;
  onClose: () => void;
}

const SignOutConfirmDialog = ({ open, onClose }: SignOutConfirmDialogProps) => {
  const [signingOut, setSigningOut] = useState(false);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      toast.success("Signed out successfully");
      onClose();
      navigate("/");
    } catch {
      toast.error("Failed to sign out");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-card border border-border rounded-2xl p-6 w-full max-w-sm mx-4 z-10"
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <LogOut className="w-6 h-6 text-destructive" />
              </div>
              <h3 className="text-lg font-bold mb-1">Sign Out</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Are you sure you want to sign out of your account?
              </p>
              <div className="flex gap-2 w-full">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl bg-muted text-sm font-semibold hover:bg-muted/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {signingOut ? "Signing out..." : "Sign Out"}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SignOutConfirmDialog;
