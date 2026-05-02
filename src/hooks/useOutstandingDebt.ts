import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface BalanceDebtRow {
  id: string;
  amount: number;
  settled_amount: number;
  remaining: number;
  reason: string | null;
  created_at: string;
}

/**
 * Fetches outstanding (pending) deposit debts for the current user.
 * Debts are auto-settled by the backend on the next successful deposit
 * via the `settle_user_debts` RPC.
 */
export const useOutstandingDebt = () => {
  const { user } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["outstanding_debts", user?.id],
    queryFn: async (): Promise<BalanceDebtRow[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("balance_debts")
        .select("id, amount, settled_amount, reason, created_at, status")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error || !data) return [];
      return data.map((d: any) => ({
        id: d.id,
        amount: Number(d.amount),
        settled_amount: Number(d.settled_amount ?? 0),
        remaining: Math.max(0, Number(d.amount) - Number(d.settled_amount ?? 0)),
        reason: d.reason,
        created_at: d.created_at,
      }));
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const debts = data ?? [];
  const totalOutstanding = debts.reduce((sum, d) => sum + d.remaining, 0);

  return {
    debts,
    totalOutstanding,
    hasDebt: totalOutstanding > 0.005,
    isLoading,
    refetch,
  };
};
