import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Search, ShieldOff, Ban, RefreshCw, Clock, Infinity as InfinityIcon } from "lucide-react";

type BanRow = {
  id: string;
  space_id: string;
  user_id: string;
  banned_by: string;
  reason: string | null;
  expires_at: string | null;
  created_at: string;
};

type ProfileLite = { id: string; username: string | null; display_name: string | null; avatar_url: string | null };
type SpaceLite = { id: string; title: string | null; status: string | null; host_id: string };

const AdminSpaceBans = () => {
  const [loading, setLoading] = useState(true);
  const [bans, setBans] = useState<BanRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [spaces, setSpaces] = useState<Record<string, SpaceLite>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "expired" | "permanent">("active");
  const [revoking, setRevoking] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick once a second so remaining-time labels stay live
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("space_bans")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const rows = (data as BanRow[]) || [];
      setBans(rows);

      const userIds = Array.from(new Set(rows.flatMap((r) => [r.user_id, r.banned_by])));
      const spaceIds = Array.from(new Set(rows.map((r) => r.space_id)));

      const [{ data: profs }, { data: sps }] = await Promise.all([
        userIds.length
          ? supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", userIds)
          : Promise.resolve({ data: [] as ProfileLite[] }),
        spaceIds.length
          ? supabase.from("spaces").select("id, title, status, host_id").in("id", spaceIds)
          : Promise.resolve({ data: [] as SpaceLite[] }),
      ]);

      const pmap: Record<string, ProfileLite> = {};
      (profs as ProfileLite[] | null)?.forEach((p) => (pmap[p.id] = p));
      setProfiles(pmap);

      const smap: Record<string, SpaceLite> = {};
      (sps as SpaceLite[] | null)?.forEach((s) => (smap[s.id] = s));
      setSpaces(smap);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load space bans");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    return bans.filter((b) => {
      // Status filter
      const isExpired = b.expires_at ? new Date(b.expires_at).getTime() <= now : false;
      const isPermanent = !b.expires_at;
      if (filter === "active" && isExpired) return false;
      if (filter === "expired" && !isExpired) return false;
      if (filter === "permanent" && !isPermanent) return false;

      if (!q) return true;
      const u = profiles[b.user_id];
      const banner = profiles[b.banned_by];
      const sp = spaces[b.space_id];
      return (
        b.user_id.toLowerCase().includes(q) ||
        b.space_id.toLowerCase().includes(q) ||
        (u?.username || "").toLowerCase().includes(q) ||
        (u?.display_name || "").toLowerCase().includes(q) ||
        (banner?.username || "").toLowerCase().includes(q) ||
        (sp?.title || "").toLowerCase().includes(q) ||
        (b.reason || "").toLowerCase().includes(q)
      );
    });
  }, [bans, profiles, spaces, search, filter]);

  const revoke = async (b: BanRow) => {
    if (!window.confirm("Revoke this ban? The user will be able to rejoin the Space.")) return;
    setRevoking(b.id);
    try {
      const { error } = await supabase
        .from("space_bans")
        .delete()
        .eq("id", b.id);
      if (error) throw error;
      // Notify the user that the ban was lifted
      try {
        const sp = spaces[b.space_id];
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("notifications").insert({
          user_id: b.user_id,
          actor_id: user?.id ?? null,
          title: "Your Space ban was lifted ✅",
          message: `You can now rejoin "${sp?.title || "the Space"}".`,
          type: "space_unbanned",
        });
      } catch { /* non-blocking */ }
      setBans((prev) => prev.filter((x) => x.id !== b.id));
      toast.success("Ban revoked");
    } catch (e: any) {
      toast.error(e?.message || "Failed to revoke ban");
    } finally {
      setRevoking(null);
    }
  };

  const fmtUser = (id: string) => {
    const p = profiles[id];
    if (!p) return id.slice(0, 8) + "…";
    return p.display_name || p.username || id.slice(0, 8) + "…";
  };

  const fmtRemaining = (expires: string | null) => {
    if (!expires) return { label: "Permanent", icon: <InfinityIcon className="w-3.5 h-3.5" /> };
    const ms = new Date(expires).getTime() - now;
    if (ms <= 0) return { label: "Expired", icon: <Clock className="w-3.5 h-3.5" /> };
    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const hrs = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    let label: string;
    if (days > 0) label = `${days}d ${hrs}h left`;
    else if (hrs > 0) label = `${hrs}h ${mins}m left`;
    else if (mins > 0) label = `${mins}m ${secs}s left`;
    else label = `${secs}s left`;
    return { label, icon: <Clock className="w-3.5 h-3.5" /> };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Ban className="w-6 h-6 text-destructive" />
            Space Bans
          </h1>
          <p className="text-sm text-muted-foreground">View, search and revoke bans across any Space.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by user, space, reason or ID…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          {(["active", "permanent", "expired", "all"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 text-xs rounded-md capitalize transition-colors ${
                filter === k ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading bans…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No bans match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">User</th>
                  <th className="text-left px-4 py-3">Space</th>
                  <th className="text-left px-4 py-3">Banned by</th>
                  <th className="text-left px-4 py-3">Reason</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Created</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const u = profiles[b.user_id];
                  const sp = spaces[b.space_id];
                  const rem = fmtRemaining(b.expires_at);
                  const expired = b.expires_at ? new Date(b.expires_at).getTime() <= Date.now() : false;
                  return (
                    <tr key={b.id} className="border-t border-border hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {u?.avatar_url && (
                            <img src={u.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium truncate">{fmtUser(b.user_id)}</p>
                            <p className="text-[10px] text-muted-foreground truncate font-mono">{b.user_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium truncate max-w-[200px]">{sp?.title || "Untitled space"}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{sp?.status || "?"} · {b.space_id.slice(0, 8)}…</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtUser(b.banned_by)}</td>
                      <td className="px-4 py-3 max-w-[220px] truncate text-muted-foreground">{b.reason || "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            expired
                              ? "bg-muted text-muted-foreground"
                              : b.expires_at
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                              : "bg-destructive/15 text-destructive"
                          }`}
                        >
                          {rem.icon}
                          {rem.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(b.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => revoke(b)}
                          disabled={revoking === b.id}
                          className="text-destructive hover:text-destructive"
                        >
                          {revoking === b.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ShieldOff className="w-3.5 h-3.5 mr-1" />
                          )}
                          Revoke
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {bans.length} bans (most recent 500).
      </p>
    </div>
  );
};

export default AdminSpaceBans;
