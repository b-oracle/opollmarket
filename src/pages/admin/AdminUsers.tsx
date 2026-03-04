import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Shield, ShieldOff, DollarSign, X, ShieldCheck, ShieldMinus } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface ProfileRow {
  id: string;
  email: string | null;
  display_name: string | null;
  wallet_address: string | null;
  created_at: string;
  roles: string[];
  balance: number;
}

const AdminUsers = () => {
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [balanceModal, setBalanceModal] = useState<{ userId: string; name: string; current: number } | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [crediting, setCrediting] = useState(false);

  const fetchUsers = async () => {
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) { setLoading(false); return; }

    const { data: roles } = await supabase.from("user_roles").select("*");
    const roleMap = new Map<string, string[]>();
    roles?.forEach((r) => {
      const existing = roleMap.get(r.user_id) || [];
      existing.push(r.role);
      roleMap.set(r.user_id, existing);
    });

    const { data: balances } = await supabase.from("balances").select("user_id, amount");
    const balanceMap = new Map<string, number>();
    balances?.forEach((b) => balanceMap.set(b.user_id, Number(b.amount)));

    setUsers(
      (profiles || []).map((p) => ({
        ...p,
        roles: roleMap.get(p.id) || [],
        balance: balanceMap.get(p.id) ?? 0,
      }))
    );
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const toggleAdmin = async (userId: string, isCurrentlyAdmin: boolean) => {
    if (isCurrentlyAdmin) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
      if (error) toast.error("Failed to remove admin role");
      else { toast.success("Admin role removed"); fetchUsers(); }
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
      if (error) toast.error("Failed to add admin role");
      else { toast.success("Admin role added"); fetchUsers(); }
    }
  };

  const handleCreditBalance = async () => {
    if (!balanceModal || !creditAmount) return;
    const amount = parseFloat(creditAmount);
    if (isNaN(amount) || amount === 0) { toast.error("Enter a valid amount"); return; }

    setCrediting(true);
    const newBalance = balanceModal.current + amount;

    const { error } = await supabase
      .from("balances")
      .update({ amount: newBalance, updated_at: new Date().toISOString() })
      .eq("user_id", balanceModal.userId);

    if (error) {
      toast.error("Failed to update balance");
    } else {
      // Record the transaction
      await supabase.from("transactions").insert({
        user_id: balanceModal.userId,
        type: amount > 0 ? "deposit" : "withdrawal",
        amount: Math.abs(amount),
        status: "confirmed",
      });
      toast.success(`Balance ${amount > 0 ? "credited" : "debited"}: $${Math.abs(amount)}`);
      setBalanceModal(null);
      setCreditAmount("");
      fetchUsers();
    }
    setCrediting(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Users ({users.length})</h2>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="p-3">User</th>
                <th className="p-3">Email</th>
                <th className="p-3">Balance</th>
                <th className="p-3">Roles</th>
                <th className="p-3">Joined</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isAdmin = u.roles.includes("admin");
                return (
                  <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-3 font-medium">{u.display_name || "—"}</td>
                    <td className="p-3 text-muted-foreground text-xs">{u.email || "—"}</td>
                    <td className="p-3">
                      <span className="text-sm font-semibold">${u.balance.toLocaleString()}</span>
                    </td>
                    <td className="p-3">
                      {u.roles.length > 0 ? u.roles.map((r) => (
                        <span key={r} className={`px-2 py-0.5 rounded-full text-[10px] font-bold mr-1 ${
                          r === "admin" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        }`}>
                          {r}
                        </span>
                      )) : <span className="text-[10px] text-muted-foreground">user</span>}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setBalanceModal({ userId: u.id, name: u.display_name || u.email || "User", current: u.balance })}
                          className="p-1.5 rounded-lg hover:bg-green-500/10 text-green-500 transition-colors"
                          title="Manage Balance"
                        >
                          <DollarSign className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleAdmin(u.id, isAdmin)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isAdmin ? "hover:bg-destructive/10 text-destructive" : "hover:bg-primary/10 text-primary"
                          }`}
                          title={isAdmin ? "Remove Admin" : "Make Admin"}
                        >
                          {isAdmin ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Balance Modal */}
      <AnimatePresence>
        {balanceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60"
              onClick={() => { setBalanceModal(null); setCreditAmount(""); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-card border border-border rounded-2xl p-6 w-full max-w-sm mx-4 z-10"
            >
              <button onClick={() => { setBalanceModal(null); setCreditAmount(""); }} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-bold">Manage Balance</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{balanceModal.name}</p>
              <div className="bg-muted/50 rounded-xl p-4 mb-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Current Balance</p>
                <p className="text-2xl font-bold">${balanceModal.current.toLocaleString()}</p>
              </div>
              <div className="mb-4">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Amount (use negative to debit)</label>
                <input
                  type="number"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  placeholder="e.g. 100 or -50"
                  className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {creditAmount && !isNaN(parseFloat(creditAmount)) && (
                  <p className="text-xs text-muted-foreground mt-2">
                    New balance: <span className="font-semibold text-foreground">${(balanceModal.current + parseFloat(creditAmount)).toLocaleString()}</span>
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setCreditAmount("100")} className="px-3 py-1.5 rounded-lg bg-muted text-xs font-medium hover:bg-muted/80 transition-colors">+$100</button>
                <button onClick={() => setCreditAmount("500")} className="px-3 py-1.5 rounded-lg bg-muted text-xs font-medium hover:bg-muted/80 transition-colors">+$500</button>
                <button onClick={() => setCreditAmount("1000")} className="px-3 py-1.5 rounded-lg bg-muted text-xs font-medium hover:bg-muted/80 transition-colors">+$1000</button>
              </div>
              <button
                onClick={handleCreditBalance}
                disabled={crediting || !creditAmount}
                className="w-full mt-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {crediting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {crediting ? "Processing..." : "Update Balance"}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminUsers;
