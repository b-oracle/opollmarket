import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import SpaceCard from "./SpaceCard";
import SpaceRoom from "./SpaceRoom";
import CreateSpaceModal from "./CreateSpaceModal";
import { Radio, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

const SpacesFeed = () => {
  const { user } = useAuth();
  const { isFeatureEnabled } = useFeatureToggles();

  
  const [createOpen, setCreateOpen] = useState(false);
  const [activeRoom, setActiveRoom] = useState<{
    id: string;
    title: string;
    hostId: string;
  } | null>(null);

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

  const handleJoinRoom = (spaceId: string) => {
    const space = spaces.find((s: any) => s.id === spaceId);
    if (space) {
      setActiveRoom({
        id: space.id,
        title: (space as any).title,
        hostId: (space as any).host_id,
      });
    }
  };

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
            <p className="text-[10px] text-muted-foreground">Go live with voice chat</p>
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
            onJoinRoom={handleJoinRoom}
          />
        ))
      )}

      <CreateSpaceModal open={createOpen} onClose={() => setCreateOpen(false)} />

      {/* Active voice room */}
      {activeRoom && (
        <SpaceRoom
          spaceId={activeRoom.id}
          spaceTitle={activeRoom.title}
          hostId={activeRoom.hostId}
          onClose={() => setActiveRoom(null)}
        />
      )}
    </div>
  );
};

export default SpacesFeed;
