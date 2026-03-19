import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import SpaceCard from "./SpaceCard";
import CreateSpaceModal from "./CreateSpaceModal";
import { Radio, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

const SpacesFeed = () => {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: spaces = [], isLoading } = useQuery({
    queryKey: ["spaces"],
    queryFn: async () => {
      const { data } = await supabase
        .from("spaces")
        .select("*")
        .eq("status", "live")
        .order("started_at", { ascending: false })
        .limit(30);
      return data || [];
    },
    refetchInterval: 10000,
  });

  // Fetch host profiles
  const hostIds = [...new Set(spaces.map((s: any) => s.host_id))];
  const { data: hostMap = new Map() } = useQuery({
    queryKey: ["space-hosts", hostIds.join(",")],
    queryFn: async () => {
      if (hostIds.length === 0) return new Map();
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", hostIds.slice(0, 50));
      return new Map((data || []).map((p: any) => [p.id, p]));
    },
    enabled: hostIds.length > 0,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Start a Space button */}
      {user && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setCreateOpen(true)}
          className="w-full glass rounded-xl p-3 flex items-center gap-3 hover:bg-accent/30 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <Radio className="w-5 h-5 text-primary" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold">Start a Space</p>
            <p className="text-[10px] text-muted-foreground">Go live and chat with your followers</p>
          </div>
        </motion.button>
      )}

      {spaces.length === 0 ? (
        <div className="flex flex-col items-center py-12">
          <Radio className="w-8 h-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No live spaces right now</p>
          <p className="text-[10px] text-muted-foreground mt-1">Be the first to start one!</p>
        </div>
      ) : (
        spaces.map((s: any, i: number) => (
          <SpaceCard
            key={s.id}
            space={s}
            hostProfile={(hostMap as Map<string, any>).get(s.host_id)}
            index={i}
          />
        ))
      )}

      <CreateSpaceModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
};

export default SpacesFeed;
