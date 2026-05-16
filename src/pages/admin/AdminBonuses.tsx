import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Gift, DollarSign, Users, Download, Search, UserPlus, Percent, ShieldCheck, ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import AdminPagination from "@/components/admin/AdminPagination";

const TIME_RANGES = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "All", days: 0 },
];

type BonusKind = "registration" | "referral_signup" | "referral_commission";

interface BonusRow {
  id: string;
  kind: BonusKind;
  user_id: string;          // beneficiary
  counterparty_id?: string; // for referral signup (referred user)
  amount: number;
  created_at: string;
  market_id?: string | null;
  user_name?: string;
  counterparty_name?: string;
}

const KIND_META: Record<BonusKind, { label: string; cls: string; icon: any }> = {
  registration:         { label: "Registration",        cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", icon: UserPlus },
  referral_signup:      { label: "Referral signup",     cls: "bg-blue-500/15 text-blue-600 border-blue-500/30",          icon: Gift },
  referral_commission:  { label: "Referral commission", cls: "bg-violet-500/15 text-violet-600 border-violet-500/30",    icon: Percent },
};

const PAGE_SIZE = 25;

const fmtUsd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface DuplicateRow {
  user_id: string;
  count: number;
  total_amount: number;
  user_name?: string;
}

const AdminBonuses = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BonusRow[]>([]);
  const [range, setRange] = useState(2); // 30d default
  const [activeKinds, setActiveKinds] = useState<Set<BonusKind>>(
    new Set(["registration", "referral_signup", "referral_commission"])
  );
  const [search, setSearch] = useState("");
  const [dupes, setDupes] = useState<DuplicateRow[] | null>(null);
  const [dupesLoading, setDupesLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setPage(1);

      const sinceISO = TIME_RANGES[range].days > 0
        ? new Date(Date.now() - TIME_RANGES[range].days * 86400000).toISOString()
        : null;

      const paged = async <T,>(builder: (from: number, to: number) => any): Promise<T[]> => {
        let all: T[] = [];
        let p = 0;
        while (true) {
          const { data, error } = await builder(p * 1000, (p + 1) * 1000 - 1);
          if (error || !data || data.length === 0) break;
          all = all.concat(data);
          if (data.length < 1000) break;
          p++;
        }
        return all;
      };

      const fetchReg = () => paged<any>((from, to) => {
        let q = supabase
          .from("transactions")
          .select("id, user_id, amount, bonus_amount, created_at")
          .eq("type", "registration_bonus")
          .order("created_at", { ascending: false })
          .range(from, to);
        if (sinceISO) q = q.gte("created_at", sinceISO);
        return q;
      });

      const fetchReferralSignup = () => paged<any>((from, to) => {
        let q = supabase
          .from("referral_rewards")
          .select("id, referrer_id, referred_id, amount, created_at")
          .order("created_at", { ascending: false })
          .range(from, to);
        if (sinceISO) q = q.gte("created_at", sinceISO);
        return q;
      });

      const fetchReferralComm = () => paged<any>((from, to) => {
        let q = supabase
          .from("transactions")
          .select("id, user_id, amount, created_at, market_id")
          .eq("type", "commission")
          .eq("side", "referral")
          .eq("status", "confirmed")
          .order("created_at", { ascending: false })
          .range(from, to);
        if (sinceISO) q = q.gte("created_at", sinceISO);
        return q;
      });

      const [reg, refSign, refComm] = await Promise.all([
        fetchReg(), fetchReferralSignup(), fetchReferralComm(),
      ]);

      // Build profile map
      const ids = new Set<string>();
      reg.forEach(r => ids.add(r.user_id));
      refSign.forEach(r => { ids.add(r.referrer_id); ids.add(r.referred_id); });
      refComm.forEach(r => ids.add(r.user_id));

      const profileMap = new Map<string, string>();
      const idList = Array.from(ids);
      for (let i = 0; i < idList.length; i += 100) {
        const { data } = await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", idList.slice(i, i + 100));
        data?.forEach((p: any) =>
          profileMap.set(p.id, p.display_name || p.email || p.id.slice(0, 8))
        );
      }

      const merged: BonusRow[] = [
        ...reg.map(r => ({
          id: `reg-${r.id}`,
          kind: "registration" as BonusKind,
          user_id: r.user_id,
          amount: Number(r.bonus_amount ?? r.amount ?? 0),
          created_at: r.created_at,
          user_name: profileMap.get(r.user_id),
        })),
        ...refSign.map(r => ({
          id: `rs-${r.id}`,
          kind: "referral_signup" as BonusKind,
          user_id: r.referrer_id,
          counterparty_id: r.referred_id,
          amount: Number(r.amount ?? 0),
          created_at: r.created_at,
          user_name: profileMap.get(r.referrer_id),
          counterparty_name: profileMap.get(r.referred_id),
        })),
        ...refComm.map(r => ({
          id: `rc-${r.id}`,
          kind: "referral_commission" as BonusKind,
          user_id: r.user_id,
          amount: Number(r.amount ?? 0),
          created_at: r.created_at,
          market_id: r.market_id,
          user_name: profileMap.get(r.user_id),
        })),
      ].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

      setRows(merged);
      setLoading(false);
    };
    run();
  }, [range]);

  // Integrity check: scan ALL registration_bonus rows (independent of range)
  // and flag users with more than one — the unique partial index should keep this at 0.
  const scanDuplicates = async () => {
    setDupesLoading(true);
    let all: any[] = [];
    let p = 0;
    while (true) {
      const { data, error } = await supabase
        .from("transactions")
        .select("user_id, amount, bonus_amount")
        .eq("type", "registration_bonus")
        .range(p * 1000, (p + 1) * 1000 - 1);
      if (error || !data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < 1000) break;
      p++;
    }
    const agg = new Map<string, { count: number; total: number }>();
    all.forEach(r => {
      const v = agg.get(r.user_id) ?? { count: 0, total: 0 };
      v.count += 1;
      v.total += Number(r.bonus_amount ?? r.amount ?? 0);
      agg.set(r.user_id, v);
    });
    const dupeIds = Array.from(agg.entries()).filter(([, v]) => v.count > 1);
    const nameMap = new Map<string, string>();
    if (dupeIds.length > 0) {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", dupeIds.map(([id]) => id));
      data?.forEach((p: any) =>
        nameMap.set(p.id, p.display_name || p.email || p.id.slice(0, 8))
      );
    }
    setDupes(
      dupeIds
        .map(([user_id, v]) => ({
          user_id,
          count: v.count,
          total_amount: v.total,
          user_name: nameMap.get(user_id),
        }))
        .sort((a, b) => b.count - a.count)
    );
    setDupesLoading(false);
  };

  useEffect(() => { scanDuplicates(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (!activeKinds.has(r.kind)) return false;
      if (!q) return true;
      return (
        r.user_name?.toLowerCase().includes(q) ||
        r.counterparty_name?.toLowerCase().includes(q) ||
        r.user_id.toLowerCase().includes(q) ||
        r.counterparty_id?.toLowerCase().includes(q)
      );
    });
  }, [rows, activeKinds, search]);

  const totals = useMemo(() => {
    const t = { registration: 0, referral_signup: 0, referral_commission: 0, count: 0, users: new Set<string>() };
    filtered.forEach(r => {
      t[r.kind] += r.amount;
      t.count += 1;
      t.users.add(r.user_id);
    });
    return { ...t, all: t.registration + t.referral_signup + t.referral_commission, uniqueUsers: t.users.size };
  }, [filtered]);

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleKind = (k: BonusKind) => {
    const next = new Set(activeKinds);
    next.has(k) ? next.delete(k) : next.add(k);
    if (next.size === 0) return; // keep at least one
    setActiveKinds(next);
    setPage(1);
  };

  const exportCsv = () => {
    const header = ["kind", "amount_usd", "beneficiary_id", "beneficiary_name", "counterparty_id", "counterparty_name", "market_id", "created_at"];
    const lines = [header.join(",")].concat(
      filtered.map(r => [
        r.kind,
        r.amount.toFixed(2),
        r.user_id,
        `"${(r.user_name ?? "").replace(/"/g, '""')}"`,
        r.counterparty_id ?? "",
        `"${(r.counterparty_name ?? "").replace(/"/g, '""')}"`,
        r.market_id ?? "",
        r.created_at,
      ].join(","))
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bonuses_${TIME_RANGES[range].label}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gift className="h-6 w-6" /> Bonuses
          </h1>
          <p className="text-sm text-muted-foreground">
            Registration bonuses, referral signup rewards, and referral commissions.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      {/* Range */}
      <div className="flex flex-wrap gap-2">
        {TIME_RANGES.map((r, i) => (
          <Button
            key={r.label}
            variant={range === i ? "default" : "outline"}
            size="sm"
            onClick={() => setRange(i)}
          >
            {r.label}
          </Button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={DollarSign} label="Total bonuses paid" value={fmtUsd(totals.all)} />
        <StatCard icon={UserPlus}   label="Registration"        value={fmtUsd(totals.registration)} />
        <StatCard icon={Gift}       label="Referral signup"     value={fmtUsd(totals.referral_signup)} />
        <StatCard icon={Percent}    label="Referral commission" value={fmtUsd(totals.referral_commission)} />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(KIND_META) as BonusKind[]).map(k => {
          const m = KIND_META[k];
          const active = activeKinds.has(k);
          const Icon = m.icon;
          return (
            <button
              key={k}
              onClick={() => toggleKind(k)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                active ? m.cls : "border-border text-muted-foreground opacity-60"
              }`}
            >
              <Icon className="h-3 w-3" />
              {m.label}
            </button>
          );
        })}
        <div className="relative ml-auto w-full md:w-72">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search user name or id…"
            className="pl-8 h-9"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No bonuses match the current filters.</p>
      ) : (
        <>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Beneficiary</th>
                  <th className="text-left p-3 hidden md:table-cell">Referred user</th>
                  <th className="text-right p-3">Amount</th>
                  <th className="text-left p-3 hidden md:table-cell">Date</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(r => {
                  const m = KIND_META[r.kind];
                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="p-3">
                        <Badge variant="outline" className={m.cls}>{m.label}</Badge>
                      </td>
                      <td className="p-3">
                        <div className="font-medium">{r.user_name ?? r.user_id.slice(0, 8)}</div>
                        <div className="text-xs text-muted-foreground font-mono">{r.user_id.slice(0, 8)}</div>
                      </td>
                      <td className="p-3 hidden md:table-cell text-muted-foreground">
                        {r.counterparty_name ?? (r.counterparty_id ? r.counterparty_id.slice(0, 8) : "—")}
                      </td>
                      <td className="p-3 text-right font-semibold">{fmtUsd(r.amount)}</td>
                      <td className="p-3 hidden md:table-cell text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {filtered.length} bonuses · {totals.uniqueUsers} unique users
            </span>
            <AdminPagination page={page} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </div>
        </>
      )}
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value }: { icon: any; label: string; value: string }) => (
  <div className="rounded-lg border p-4 bg-card">
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5" /> {label}
    </div>
    <div className="text-xl font-bold mt-1">{value}</div>
  </div>
);

export default AdminBonuses;
