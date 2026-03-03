import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Shield, ShieldOff } from "lucide-react";
import { toast } from "sonner";

interface ProfileRow {
  id: string;
  email: string | null;
  display_name: string | null;
  wallet_address: string | null;
  created_at: string;
  roles: string[];
}

const AdminUsers = () => {
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);

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

    setUsers(
      (profiles || []).map((p) => ({
        ...p,
        roles: roleMap.get(p.id) || [],
      }))
    );
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const toggleAdmin = async (userId: string, isCurrentlyAdmin: boolean) => {
    if (isCurrentlyAdmin) {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "admin");
      if (error) toast.error("Failed to remove admin role");
      else { toast.success("Admin role removed"); fetchUsers(); }
    } else {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: "admin" });
      if (error) toast.error("Failed to add admin role");
      else { toast.success("Admin role added"); fetchUsers(); }
    }
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
                <th className="p-3">Wallet</th>
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
                    <td className="p-3 text-muted-foreground text-xs font-mono">
                      {u.wallet_address ? `${u.wallet_address.slice(0, 6)}...${u.wallet_address.slice(-4)}` : "—"}
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
                      <button
                        onClick={() => toggleAdmin(u.id, isAdmin)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isAdmin ? "hover:bg-destructive/10 text-destructive" : "hover:bg-primary/10 text-primary"
                        }`}
                        title={isAdmin ? "Remove Admin" : "Make Admin"}
                      >
                        {isAdmin ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                      </button>
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
    </div>
  );
};

export default AdminUsers;
