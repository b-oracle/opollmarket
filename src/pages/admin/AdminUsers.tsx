import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Shield, ShieldOff, DollarSign, X, ShieldCheck, ShieldMinus, Search, Crown, Eye, Ban, CheckCircle, Infinity, Headset, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { logAuditEvent } from "@/lib/auditLog";
import { motion, AnimatePresence } from "framer-motion";
import AdminPagination from "@/components/admin/AdminPagination";
import { useAdminContext } from "./AdminLayout";
import { useAuth } from "@/hooks/useAuth";
import UserActivityDrawer from "@/components/admin/UserActivityDrawer";

interface ProfileRow {
  id: string;
  email: string | null;
  display_name: string | null;
  wallet_address: string | null;
  created_at: string;
  roles: string[];
  balance: number;
  is_blocked: boolean;
  unlimited_markets: boolean;
}

const PAGE_SIZE = 20;

const AdminUsers = () => {
  const { canEdit } = useAdminContext();
  const { user: currentUser, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [balanceModal, setBalanceModal] = useState<{ userId: string; name: string; current: number } | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [crediting, setCrediting] = useState(false);
  const [roleConfirm, setRoleConfirm] = useState<{ userId: string; name: string; role: "admin" | "moderator" | "super_admin" | "support" | "business"; hasRole: boolean } | null>(null);
  const [blockConfirm, setBlockConfirm] = useState<{ userId: string; name: string; currentlyBlocked: boolean } | null>(null);
  const [unlimitedConfirm, setUnlimitedConfirm] = useState<{ userId: string; name: string; current: boolean } | null>(null);
  const [activityDrawer, setActivityDrawer] = useState<{ userId: string; name: string } | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<"created_desc" | "balance_desc" | "balance_asc">("created_desc");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;

    // Sensitive columns on profiles are not readable directly; use admin RPC.
    const { data: rpcData, error } = await supabase.rpc("admin_search_profiles", {
      _term: debouncedSearch.trim() || null,
      _limit: PAGE_SIZE,
      _offset: from,
    });

    if (error || !rpcData || rpcData.length === 0) {
      setLoading(false);
      if (!error) {
        setUsers([]);
        setTotalCount(0);
      }
      return;
    }

    const row = rpcData[0] as any;
    const profiles: any[] = Array.isArray(row.rows) ? row.rows : [];
    const count = Number(row.total_count) || 0;

    setTotalCount(count);

    const userIds = profiles.map((p: any) => p.id);

    if (userIds.length === 0) {
      setUsers([]);
      setLoading(false);
      return;
    }

    const [{ data: roles }, { data: balances }] = await Promise.all([
      supabase.from("user_roles").select("*").in("user_id", userIds),
      supabase.from("balances").select("user_id, amount").in("user_id", userIds),
    ]);

    const roleMap = new Map<string, string[]>();
    roles?.forEach((r) => {
      const existing = roleMap.get(r.user_id) || [];
      existing.push(r.role);
      roleMap.set(r.user_id, existing);
    });

    const balanceMap = new Map<string, number>();
    balances?.forEach((b) => balanceMap.set(b.user_id, Number(b.amount)));

    setUsers(
      profiles.map((p: any) => ({
        ...p,
        roles: roleMap.get(p.id) || [],
        balance: balanceMap.get(p.id) ?? 0,
        is_blocked: !!p.is_blocked,
        unlimited_markets: !!p.unlimited_markets,
      }))
    );
    setLoading(false);
  }, [page, debouncedSearch]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const toggleRole = async (userId: string, role: "admin" | "moderator" | "super_admin" | "support" | "business", hasRole: boolean) => {
    if (hasRole) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
      if (error) { toast.error(`Failed to remove ${role} role`); return; }
      toast.success(`${role} role removed`);
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
      if (error) { toast.error(`Failed to add ${role} role`); return; }
      toast.success(`${role} role added`);
    }
    logAuditEvent({
      action: hasRole ? "role_removed" : "role_assigned",
      targetId: userId,
      targetType: "user",
      details: { role },
    });
    fetchUsers();
  };

  const toggleBlock = async (userId: string, name: string, currentlyBlocked: boolean) => {
    const { error } = await supabase.rpc("admin_update_profile", {
      _target_user_id: userId,
      _is_blocked: !currentlyBlocked,
      _blocked_at: !currentlyBlocked ? new Date().toISOString() : null,
      _block_reason: !currentlyBlocked ? "Blocked by admin" : null,
    } as any);

    if (error) {
      toast.error(`Failed to ${currentlyBlocked ? "unblock" : "block"} user`);
      return;
    }

    logAuditEvent({
      action: currentlyBlocked ? "user_unblocked" : "user_blocked",
      targetId: userId,
      targetType: "user",
      details: { user_name: name },
    });

    toast.success(`${name} has been ${currentlyBlocked ? "unblocked" : "blocked"}`);
    fetchUsers();
  };

  const handleCreditBalance = async () => {
    if (!balanceModal || !creditAmount) return;
    const amount = parseFloat(creditAmount);
    if (isNaN(amount) || amount === 0) { toast.error("Enter a valid amount"); return; }

    setCrediting(true);
    const newBalance = balanceModal.current + amount;

    const { error } = await supabase.rpc("adjust_balance", {
      _user_id: balanceModal.userId,
      _delta: amount,
      _bonus_delta: 0,
      _insurance_delta: 0,
    });

    if (error) {
      toast.error("Failed to update balance");
    } else {
      await supabase.rpc("admin_record_transaction", {
        _user_id: balanceModal.userId,
        _type: amount > 0 ? "deposit" : "withdrawal",
        _amount: Math.abs(amount),
        _status: "confirmed",
      });
      logAuditEvent({
        action: "balance_adjusted",
        targetId: balanceModal.userId,
        targetType: "user",
        details: { amount, new_balance: newBalance, user_name: balanceModal.name },
      });
      toast.success(`Balance ${amount > 0 ? "credited" : "debited"}: $${Math.abs(amount)}`);
      setBalanceModal(null);
      setCreditAmount("");
      fetchUsers();
    }
    setCrediting(false);
  };

  const getRoleBadge = (r: string) => {
    switch (r) {
      case "super_admin": return { label: "Super Admin", cls: "bg-primary/15 text-primary" };
      case "admin": return { label: "Admin", cls: "bg-blue-500/10 text-blue-500" };
      case "moderator": return { label: "Moderator", cls: "bg-amber-500/10 text-amber-500" };
      case "support": return { label: "Support", cls: "bg-emerald-500/10 text-emerald-500" };
      case "business": return { label: "Business", cls: "bg-violet-500/10 text-violet-500" };
      default: return { label: r, cls: "bg-muted text-muted-foreground" };
    }
  };

  const [stats, setStats] = useState({ totalUsers: 0, totalBalance: 0, totalDeposits: 0, totalWithdrawals: 0, totalEarnings: 0, totalLosses: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      const { data } = await supabase.rpc("get_admin_user_stats");
      if (data) {
        const d = data as Record<string, number>;
        setStats({
          totalUsers: Number(d.total_users) || 0,
          totalBalance: Number(d.total_balance) || 0,
          totalDeposits: Number(d.total_deposits) || 0,
          totalWithdrawals: Number(d.total_withdrawals) || 0,
          totalEarnings: Number(d.total_earnings) || 0,
          totalLosses: Number(d.total_losses) || 0,
        });
      }
    };
    fetchStats();
  }, []);

  const statCards = [
    { label: "Total Users", value: stats.totalUsers.toLocaleString(), icon: "👥" },
    { label: "Total Balances", value: `$${stats.totalBalance.toFixed(2)}`, icon: "💰" },
    { label: "Total Deposits", value: `$${stats.totalDeposits.toFixed(2)}`, icon: "📥" },
    { label: "Total Earnings", value: `$${stats.totalEarnings.toFixed(2)}`, icon: "📈" },
    { label: "Total Losses", value: `$${stats.totalLosses.toFixed(2)}`, icon: "📉" },
    { label: "Total Withdrawals", value: `$${stats.totalWithdrawals.toFixed(2)}`, icon: "📤" },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {statCards.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{s.icon}</span>
              <p className="text-[11px] text-muted-foreground font-medium">{s.label}</p>
            </div>
            <p className={`text-lg font-bold ${s.label === "Total Earnings" ? "text-green-500" : s.label === "Total Losses" ? "text-red-500" : ""}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h2 className="text-xl sm:text-2xl font-bold">Users ({totalCount})</h2>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by username or email..."
            className="w-full bg-muted/50 border border-border rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

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
              {loading ? (
                <tr><td colSpan={6} className="p-10 text-center"><Loader2 className="w-5 h-5 text-primary animate-spin mx-auto" /></td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">{debouncedSearch ? "No matching users" : "No users found"}</td></tr>
              ) : users.map((u) => {
                const isSA = u.roles.includes("super_admin");
                const isAdmin = u.roles.includes("admin");
                const isMod = u.roles.includes("moderator");
                const isSupport = u.roles.includes("support");
                const isBiz = u.roles.includes("business");
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id} className={`border-b border-border/50 hover:bg-muted/30 ${u.is_blocked ? "opacity-60 bg-destructive/5" : ""}`}>
                    <td className="p-3 font-medium">
                      <div className="flex items-center gap-1.5 [text-decoration:none]">
                        <span className="no-underline [text-decoration:none]">{u.display_name || "—"}</span>
                        {u.unlimited_markets && (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-primary/15 text-primary" title="Unlimited Markets">∞</span>
                        )}
                        {u.is_blocked && (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-destructive/15 text-destructive">BLOCKED</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">{u.email || "—"}</td>
                    <td className="p-3">
                      <span className="text-sm font-semibold">${u.balance.toLocaleString()}</span>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {(() => {
                          // Filter out super_admin role from display for non-super-admin viewers
                          const visibleRoles = isSuperAdmin
                            ? u.roles
                            : u.roles.filter((r) => r !== "super_admin");
                          return visibleRoles.length > 0 ? visibleRoles.map((r) => {
                            const badge = getRoleBadge(r);
                            return (
                              <span key={r} className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.cls}`}>
                                {badge.label}
                              </span>
                            );
                          }) : <span className="text-[10px] text-muted-foreground">user</span>;
                        })()}
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {isSuperAdmin && (
                          <button
                            onClick={() => setActivityDrawer({ userId: u.id, name: u.display_name || u.email || "User" })}
                            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                            title="View Activities"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        {isSuperAdmin && !isSelf ? (
                          <>
                            <button
                              onClick={() => setBalanceModal({ userId: u.id, name: u.display_name || u.email || "User", current: u.balance })}
                              className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors"
                              title="Manage Balance"
                            >
                              <DollarSign className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setRoleConfirm({ userId: u.id, name: u.display_name || u.email || "User", role: "moderator", hasRole: isMod })}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isMod ? "hover:bg-destructive/10 text-amber-500" : "hover:bg-amber-500/10 text-muted-foreground"
                              }`}
                              title={isMod ? "Remove Moderator" : "Make Moderator"}
                            >
                              {isMod ? <ShieldMinus className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => setRoleConfirm({ userId: u.id, name: u.display_name || u.email || "User", role: "admin", hasRole: isAdmin })}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isAdmin ? "hover:bg-destructive/10 text-blue-500" : "hover:bg-blue-500/10 text-muted-foreground"
                              }`}
                              title={isAdmin ? "Remove Admin" : "Make Admin"}
                            >
                              {isAdmin ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => setRoleConfirm({ userId: u.id, name: u.display_name || u.email || "User", role: "support", hasRole: isSupport })}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isSupport ? "hover:bg-destructive/10 text-emerald-500" : "hover:bg-emerald-500/10 text-muted-foreground"
                              }`}
                              title={isSupport ? "Remove Support" : "Make Support"}
                            >
                              <Headset className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setRoleConfirm({ userId: u.id, name: u.display_name || u.email || "User", role: "business", hasRole: isBiz })}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isBiz ? "hover:bg-destructive/10 text-violet-500" : "hover:bg-violet-500/10 text-muted-foreground"
                              }`}
                              title={isBiz ? "Remove Business" : "Make Business"}
                            >
                              <Briefcase className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setRoleConfirm({ userId: u.id, name: u.display_name || u.email || "User", role: "super_admin", hasRole: isSA })}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isSA ? "hover:bg-destructive/10 text-primary" : "hover:bg-primary/10 text-muted-foreground"
                              }`}
                              title={isSA ? "Remove Super Admin" : "Make Super Admin"}
                            >
                              <Crown className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setUnlimitedConfirm({ userId: u.id, name: u.display_name || u.email || "User", current: u.unlimited_markets })}
                              className={`p-1.5 rounded-lg transition-colors ${
                                u.unlimited_markets ? "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25" : "hover:bg-muted text-muted-foreground"
                              }`}
                              title={u.unlimited_markets ? "Remove Unlimited Markets" : "Grant Unlimited Markets"}
                            >
                              <Infinity className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setBlockConfirm({ userId: u.id, name: u.display_name || u.email || "User", currentlyBlocked: u.is_blocked })}
                              className={`p-1.5 rounded-lg transition-all duration-200 ${
                                u.is_blocked
                                  ? "bg-destructive/20 text-destructive ring-1 ring-destructive/40 hover:bg-destructive/30"
                                  : "hover:bg-destructive/10 text-muted-foreground"
                              }`}
                              title={u.is_blocked ? "Unban User" : "Ban User"}
                            >
                              {u.is_blocked ? (
                                <ShieldCheck className="w-4 h-4" />
                              ) : (
                                <Ban className="w-4 h-4" />
                              )}
                            </button>
                          </>
                        ) : isSelf ? (
                          <span className="text-[10px] text-muted-foreground">You</span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">View only</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <AdminPagination page={page} totalItems={totalCount} pageSize={PAGE_SIZE} onPageChange={setPage} />

      {/* User Activity Drawer */}
      <UserActivityDrawer
        open={!!activityDrawer}
        onClose={() => setActivityDrawer(null)}
        userId={activityDrawer?.userId || ""}
        userName={activityDrawer?.name || ""}
      />

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

      {/* Role Confirmation Dialog */}
      <AnimatePresence>
        {roleConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60"
              onClick={() => setRoleConfirm(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-card border border-border rounded-2xl p-6 w-full max-w-sm mx-4 z-10"
            >
              <div className="flex items-center gap-2 mb-1">
                {roleConfirm.hasRole
                  ? <ShieldOff className="w-5 h-5 text-destructive" />
                  : roleConfirm.role === "super_admin" ? <Crown className="w-5 h-5 text-primary" /> : <ShieldCheck className="w-5 h-5 text-primary" />}
                <h3 className="text-lg font-bold">
                  {roleConfirm.hasRole ? "Remove" : "Assign"} {getRoleBadge(roleConfirm.role).label} Role
                </h3>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Are you sure you want to {roleConfirm.hasRole ? "remove" : "assign"} the <strong className="text-foreground">{getRoleBadge(roleConfirm.role).label}</strong> role {roleConfirm.hasRole ? "from" : "to"} <strong className="text-foreground">{roleConfirm.name}</strong>?
                {roleConfirm.role === "super_admin" && !roleConfirm.hasRole && (
                  <span className="block mt-2 text-xs text-destructive font-medium">⚠️ This grants full read/write access to all admin functions.</span>
                )}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setRoleConfirm(null)}
                  className="flex-1 py-2.5 rounded-xl bg-muted text-sm font-semibold hover:bg-muted/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await toggleRole(roleConfirm.userId, roleConfirm.role, roleConfirm.hasRole);
                    setRoleConfirm(null);
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    roleConfirm.hasRole
                      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                >
                  {roleConfirm.hasRole ? "Remove Role" : "Assign Role"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Block/Unblock Confirmation Dialog */}
      <AnimatePresence>
        {blockConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60"
              onClick={() => setBlockConfirm(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-card border border-border rounded-2xl p-6 w-full max-w-sm mx-4 z-10"
            >
              <div className="flex items-center gap-2 mb-1">
                {blockConfirm.currentlyBlocked
                  ? <ShieldCheck className="w-5 h-5 text-emerald-500" />
                  : <Ban className="w-5 h-5 text-destructive" />}
                <h3 className="text-lg font-bold">
                  {blockConfirm.currentlyBlocked ? "Unban" : "Ban"} User
                </h3>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Are you sure you want to {blockConfirm.currentlyBlocked ? "unban" : "ban"} <strong className="text-foreground">{blockConfirm.name}</strong>?
                {!blockConfirm.currentlyBlocked && (
                  <span className="block mt-2 text-xs text-destructive font-medium">⚠️ This will prevent the user from accessing the platform.</span>
                )}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setBlockConfirm(null)}
                  className="flex-1 py-2.5 rounded-xl bg-muted text-sm font-semibold hover:bg-muted/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await toggleBlock(blockConfirm.userId, blockConfirm.name, blockConfirm.currentlyBlocked);
                    setBlockConfirm(null);
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    blockConfirm.currentlyBlocked
                      ? "bg-emerald-500 text-white hover:bg-emerald-500/90"
                      : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  }`}
                >
                  {blockConfirm.currentlyBlocked ? "Unban" : "Ban"} User
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Unlimited Markets Confirmation Dialog */}
      <AnimatePresence>
        {unlimitedConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60"
              onClick={() => setUnlimitedConfirm(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-card border border-border rounded-2xl p-6 w-full max-w-sm mx-4 z-10"
            >
              <div className="flex items-center gap-2 mb-1">
                <Infinity className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-bold">
                  {unlimitedConfirm.current ? "Remove" : "Grant"} Unlimited Markets
                </h3>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Are you sure you want to {unlimitedConfirm.current ? "remove unlimited markets from" : "grant unlimited markets to"} <strong className="text-foreground">{unlimitedConfirm.name}</strong>?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setUnlimitedConfirm(null)}
                  className="flex-1 py-2.5 rounded-xl bg-muted text-sm font-semibold hover:bg-muted/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const newVal = !unlimitedConfirm.current;
                    const { error } = await supabase.rpc("admin_update_profile", {
                      _target_user_id: unlimitedConfirm.userId,
                      _unlimited_markets: newVal,
                    } as any);
                    if (error) { toast.error("Failed to update"); return; }
                    logAuditEvent({
                      action: "settings_updated",
                      targetId: unlimitedConfirm.userId,
                      targetType: "user",
                      details: { unlimited_markets: newVal, user_name: unlimitedConfirm.name },
                    });
                    toast.success(`${unlimitedConfirm.name} ${newVal ? "whitelisted for unlimited markets" : "removed from unlimited markets whitelist"}`);
                    setUnlimitedConfirm(null);
                    fetchUsers();
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    unlimitedConfirm.current
                      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                >
                  {unlimitedConfirm.current ? "Remove" : "Grant"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminUsers;
