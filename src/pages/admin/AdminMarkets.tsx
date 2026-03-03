import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Trash2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

interface MarketRow {
  id: string;
  title: string;
  category: string;
  status: string;
  market_type: string;
  volume: number;
  participants: number;
  yes_price: number;
  end_date: string;
  created_at: string;
}

const AdminMarkets = () => {
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMarkets = async () => {
    const { data, error } = await supabase
      .from("markets")
      .select("id, title, category, status, market_type, volume, participants, yes_price, end_date, created_at")
      .order("created_at", { ascending: false });
    if (!error && data) setMarkets(data);
    setLoading(false);
  };

  useEffect(() => { fetchMarkets(); }, []);

  const handleResolve = async (id: string, status: string) => {
    const { error } = await supabase.from("markets").update({ status }).eq("id", id);
    if (error) toast.error("Failed to update market");
    else { toast.success(`Market ${status}`); fetchMarkets(); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this market?")) return;
    const { error } = await supabase.from("markets").delete().eq("id", id);
    if (error) toast.error("Failed to delete market");
    else { toast.success("Market deleted"); fetchMarkets(); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Markets ({markets.length})</h2>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="p-3">Title</th>
                <th className="p-3">Type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Volume</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m) => (
                <tr key={m.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="p-3 font-medium max-w-[200px] truncate">{m.title}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary">
                      {m.market_type}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      m.status === "active" ? "bg-green-500/10 text-green-500" :
                      m.status === "resolved" ? "bg-blue-500/10 text-blue-500" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {m.status}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">${(Number(m.volume) / 1000).toFixed(0)}K</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      {m.status === "active" && (
                        <>
                          <button
                            onClick={() => handleResolve(m.id, "resolved")}
                            className="p-1.5 rounded-lg hover:bg-green-500/10 text-green-500 transition-colors"
                            title="Resolve"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleResolve(m.id, "cancelled")}
                            className="p-1.5 rounded-lg hover:bg-yellow-500/10 text-yellow-500 transition-colors"
                            title="Cancel"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDelete(m.id)}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {markets.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No markets found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminMarkets;
