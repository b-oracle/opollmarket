import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MessageCircle, Search, Unlink, Phone, Calendar, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import AdminPagination from "@/components/admin/AdminPagination";

const PAGE_SIZE = 20;

interface WhatsAppUser {
  id: string;
  user_id: string;
  whatsapp_phone: string;
  display_name: string | null;
  linked_at: string;
  profile_display_name: string | null;
  profile_email: string | null;
  profile_avatar_url: string | null;
  balance: number;
  predictions: number;
  quick_trades: number;
}

const AdminWhatsApp = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<WhatsAppUser[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalLinked, setTotalLinked] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // Get total count
    const { count: total } = await supabase
      .from("whatsapp_users")
      .select("id", { count: "exact", head: true });
    setTotalLinked(total ?? 0);

    // Query whatsapp_users
    let query = supabase
      .from("whatsapp_users")
      .select("*", { count: "exact" })
      .order("linked_at", { ascending: false });

    if (debouncedSearch.trim()) {
      const q = `%${debouncedSearch.trim()}%`;
      query = query.or(`whatsapp_phone.ilike.${q},display_name.ilike.${q}`);
    }

    const { data: waUsers, count } = await query.range(from, to);
    setTotalCount(count ?? 0);

    if (!waUsers || waUsers.length === 0) {
      setUsers([]);
      setLoading(false);
      return;
    }

    const userIds = waUsers.map(u => u.user_id);

    // Fetch profiles and balances in parallel
    const [{ data: profiles }, { data: balances }] = await Promise.all([
      supabase.rpc("admin_get_profiles_with_email", { _ids: userIds }),
      supabase.from("balances").select("user_id, amount").in("user_id", userIds),
    ]);

    const profileMap = new Map((profiles || []).map(p => [p.id, p]));
    const balanceMap = new Map((balances || []).map(b => [b.user_id, b.amount]));

    // Fetch trade counts per user
    const tradeCounts = new Map<string, { predictions: number; quick_trades: number }>();
    for (const uid of userIds) {
      const { data: tc } = await supabase.rpc("get_user_trade_count", { _user_id: uid });
      if (tc && tc.length > 0) {
        tradeCounts.set(uid, { predictions: tc[0].predictions, quick_trades: tc[0].quick_trades });
      }
    }

    setUsers(waUsers.map(wu => {
      const prof = profileMap.get(wu.user_id);
      const tc = tradeCounts.get(wu.user_id);
      return {
        ...wu,
        profile_display_name: prof?.display_name ?? null,
        profile_email: prof?.email ?? null,
        profile_avatar_url: prof?.avatar_url ?? null,
        balance: balanceMap.get(wu.user_id) ?? 0,
        predictions: tc?.predictions ?? 0,
        quick_trades: tc?.quick_trades ?? 0,
      };
    }));

    setLoading(false);
  }, [page, debouncedSearch]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const maskPhone = (phone: string) => {
    if (phone.length <= 6) return phone;
    return phone.slice(0, 4) + "****" + phone.slice(-4);
  };

  if (loading && users.length === 0) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <MessageCircle className="w-6 h-6 text-emerald-500" /> WhatsApp Users
      </h1>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Linked Users</span>
            <Phone className="w-4 h-4 text-emerald-500" />
          </div>
          <span className="text-xl font-bold">{totalLinked}</span>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total Predictions</span>
            <User className="w-4 h-4 text-primary" />
          </div>
          <span className="text-xl font-bold">{users.reduce((s, u) => s + u.predictions, 0)}</span>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total Quick Trades</span>
            <MessageCircle className="w-4 h-4 text-blue-500" />
          </div>
          <span className="text-xl font-bold">{users.reduce((s, u) => s + u.quick_trades, 0)}</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search by phone or name..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">WhatsApp Phone</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Balance</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Predictions</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Quick Trades</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Linked</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {u.profile_avatar_url ? (
                        <img src={u.profile_avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                          {(u.profile_display_name || u.display_name || "?")[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-xs truncate max-w-[140px]">{u.profile_display_name || u.display_name || "Anonymous"}</div>
                        <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">{u.profile_email || "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-mono">
                      <Phone className="w-3 h-3 text-emerald-500" />
                      {maskPhone(u.whatsapp_phone)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-semibold ${u.balance > 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                      ${u.balance.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-semibold text-xs">{u.predictions}</td>
                  <td className="px-4 py-3 text-center font-semibold text-xs">{u.quick_trades}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(u.linked_at).toLocaleDateString()}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No WhatsApp users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {totalCount > PAGE_SIZE && (
          <div className="p-4 border-t border-border">
            <AdminPagination page={page} totalItems={totalCount} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminWhatsApp;
