import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Zap, CheckCircle, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import AdminPagination from "@/components/admin/AdminPagination";

interface BoostRow {
  id: string;
  market_id: string;
  tier: string;
  amount: number;
  status: string;
  created_at: string;
  starts_at: string;
  ends_at: string;
  payer_wallet: string;
  tx_hash: string | null;
  nowpayments_payment_id: string | null;
  market_title?: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-500",
  active: "bg-green-500/10 text-green-500",
  cancelled: "bg-destructive/10 text-destructive",
  expired: "bg-muted text-muted-foreground",
};

const tierLabels: Record<string, string> = {
  flash: "⚡ Flash",
  standard: "🔥 Standard",
  whale: "👑 Whale",
};

const AdminBoosts = () => {
  const [boosts, setBoosts] = useState<BoostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [bstPage, setBstPage] = useState(1);
  const BST_PAGE_SIZE = 20;

  const fetchBoosts = async () => {
    const { data, error } = await supabase
      .from("market_boosts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching boosts:", error);
      setLoading(false);
      return;
    }

    // Fetch market titles
    const marketIds = [...new Set((data || []).map((b) => b.market_id))];
    const { data: markets } = await supabase
      .from("markets")
      .select("id, title")
      .in("id", marketIds);

    const titleMap = new Map(markets?.map((m) => [m.id, m.title]) || []);

    setBoosts(
      (data || []).map((b) => ({
        ...b,
        market_title: titleMap.get(b.market_id) || "Unknown Market",
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchBoosts();
  }, []);

  const handleActivate = async (boost: BoostRow) => {
    setActionLoading(boost.id);
    const durationHours: Record<string, number> = { flash: 12, standard: 24, whale: 168 };
    const hours = durationHours[boost.tier] || 24;
    const now = new Date();
    const endsAt = new Date(now.getTime() + hours * 60 * 60 * 1000);

    const { error } = await supabase
      .from("market_boosts")
      .update({
        status: "active",
        starts_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
      })
      .eq("id", boost.id);

    if (error) {
      toast.error("Failed to activate boost");
    } else {
      toast.success("Boost activated");
      fetchBoosts();
    }
    setActionLoading(null);
  };

  const handleCancel = async (boostId: string) => {
    setActionLoading(boostId);
    const { error } = await supabase
      .from("market_boosts")
      .update({ status: "cancelled" })
      .eq("id", boostId);

    if (error) {
      toast.error("Failed to cancel boost");
    } else {
      toast.success("Boost cancelled");
      fetchBoosts();
    }
    setActionLoading(null);
  };

  const paginatedBoosts = useMemo(() => boosts.slice((bstPage - 1) * BST_PAGE_SIZE, bstPage * BST_PAGE_SIZE), [boosts, bstPage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Boost Management</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Zap className="w-4 h-4" />
          {boosts.filter((b) => b.status === "active").length} active
        </div>
      </div>

      {boosts.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          No boosts found
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedBoosts.map((boost) => (
            <div
              key={boost.id}
              className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold truncate max-w-[250px]">
                    {boost.market_title}
                  </span>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${statusColors[boost.status] || statusColors.expired}`}>
                    {boost.status}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {tierLabels[boost.tier] || boost.tier}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span>${boost.amount}</span>
                  <span>Created {format(new Date(boost.created_at), "MMM d, HH:mm")}</span>
                  {boost.status === "active" && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Ends {format(new Date(boost.ends_at), "MMM d, HH:mm")}
                    </span>
                  )}
                  {boost.nowpayments_payment_id && (
                    <span className="text-[10px] font-mono opacity-60">
                      NP: {boost.nowpayments_payment_id}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {boost.status === "pending" && (
                  <button
                    onClick={() => handleActivate(boost)}
                    disabled={actionLoading === boost.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === boost.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <CheckCircle className="w-3 h-3" />
                    )}
                    Approve
                  </button>
                )}
                {(boost.status === "pending" || boost.status === "active") && (
                  <button
                    onClick={() => handleCancel(boost.id)}
                    disabled={actionLoading === boost.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === boost.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <XCircle className="w-3 h-3" />
                    )}
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <AdminPagination page={bstPage} totalItems={boosts.length} pageSize={BST_PAGE_SIZE} onPageChange={setBstPage} />
    </div>
  );
};

export default AdminBoosts;
