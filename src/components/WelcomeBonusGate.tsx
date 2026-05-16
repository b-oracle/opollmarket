import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import WelcomeBonusModal from "./WelcomeBonusModal";

const FLAG_PREFIX = "welcome_bonus_shown:";
const PENDING_KEY = "pending_welcome_bonus";
const RECENT_DAYS = 7;

const WelcomeBonusGate = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(20);

  useEffect(() => {
    if (!user) return;
    const key = `${FLAG_PREFIX}${user.id}`;
    if (localStorage.getItem(key)) return;

    let cancelled = false;
    const check = async () => {
      try {
        const pending = localStorage.getItem(PENDING_KEY) === "1";
        const createdAt = user.created_at ? new Date(user.created_at).getTime() : 0;
        const isRecent =
          createdAt > 0 && Date.now() - createdAt < RECENT_DAYS * 24 * 60 * 60 * 1000;

        if (!pending && !isRecent) {
          // Not a new user; don't show.
          localStorage.setItem(key, "1");
          return;
        }

        const { data } = await supabase
          .from("balances")
          .select("bonus_balance")
          .eq("user_id", user.id)
          .maybeSingle();

        const bonus = Number(data?.bonus_balance ?? 0);
        if (cancelled) return;
        if (bonus >= 1) {
          setAmount(Math.floor(bonus));
          // Delay slightly so the app finishes hydrating first.
          setTimeout(() => {
            if (!cancelled) setOpen(true);
          }, 800);
        }
      } catch {
        // ignore
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleClose = () => {
    setOpen(false);
    if (user) {
      localStorage.setItem(`${FLAG_PREFIX}${user.id}`, "1");
    }
    localStorage.removeItem(PENDING_KEY);
  };

  if (!user) return null;
  return <WelcomeBonusModal open={open} amount={amount} onClose={handleClose} />;
};

export default WelcomeBonusGate;
