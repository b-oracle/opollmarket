import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, History, ShieldCheck, ShieldMinus } from "lucide-react";
import AdminPagination from "@/components/admin/AdminPagination";

interface AuditEntry {
  id: string;
  actor_id: string;
  action: string;
  target_id: string | null;
  target_type: string;
  details: { role?: string } | null;
  created_at: string;
  actor_name?: string;
  target_name?: string;
}

const PAGE_SIZE = 25;

const actionConfig: Record<string, { label: string; icon: typeof ShieldCheck; colorClass: string }> = {
  role_assigned: { label: "Role Assigned", icon: ShieldCheck, colorClass: "text-emerald-400 bg-emerald-400/10" },
  role_removed: { label: "Role Removed", icon: ShieldMinus, colorClass: "text-destructive bg-destructive/10" },
};

const AdminAuditLog = () => {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const fetchLogs = async () => {
      const { data, error } = await supabase
        .from("audit_logs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error || !data) {
        setLoading(false);
        return;
      }

      // Resolve actor/target names
      const userIds = new Set<string>();
      (data as any[]).forEach((l: any) => {
        if (l.actor_id) userIds.add(l.actor_id);
        if (l.target_id) userIds.add(l.target_id);
      });

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", Array.from(userIds));

      const nameMap = new Map<string, string>();
      profiles?.forEach((p) => {
        nameMap.set(p.id, p.display_name || p.email || p.id.slice(0, 8));
      });

      setLogs(
        (data as any[]).map((l: any) => ({
          ...l,
          actor_name: nameMap.get(l.actor_id) || l.actor_id?.slice(0, 8),
          target_name: l.target_id ? nameMap.get(l.target_id) || l.target_id?.slice(0, 8) : null,
        }))
      );
      setLoading(false);
    };
    fetchLogs();
  }, []);

  const paginatedLogs = useMemo(
    () => logs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [logs, page]
  );

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <History className="w-5 h-5 text-primary" />
        <h2 className="text-xl sm:text-2xl font-bold">Audit Log</h2>
        <span className="text-xs text-muted-foreground ml-auto">{logs.length} entries</span>
      </div>

      <div className="space-y-2">
        {paginatedLogs.map((log) => {
          const config = actionConfig[log.action] || actionConfig.role_assigned;
          const Icon = config.icon;
          const role = (log.details as any)?.role || "unknown";

          return (
            <div
              key={log.id}
              className="bg-card border border-border rounded-xl p-4 flex items-start gap-3"
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${config.colorClass}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  <span className="font-semibold">{log.actor_name}</span>
                  {" "}
                  <span className="text-muted-foreground">
                    {log.action === "role_assigned" ? "assigned" : "removed"}
                  </span>
                  {" "}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    role === "super_admin" ? "bg-primary/15 text-primary" :
                    role === "admin" ? "bg-blue-500/10 text-blue-500" :
                    "bg-amber-500/10 text-amber-500"
                  }`}>
                    {role === "super_admin" ? "Super Admin" : role === "admin" ? "Admin" : "Moderator"}
                  </span>
                  {" "}
                  <span className="text-muted-foreground">
                    {log.action === "role_assigned" ? "to" : "from"}
                  </span>
                  {" "}
                  <span className="font-semibold">{log.target_name}</span>
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {new Date(log.created_at).toLocaleDateString()}{" "}
                  {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}

        {logs.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No audit entries yet</p>
            <p className="text-xs mt-1">Role changes will be logged here.</p>
          </div>
        )}
      </div>

      <AdminPagination page={page} totalItems={logs.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default AdminAuditLog;
