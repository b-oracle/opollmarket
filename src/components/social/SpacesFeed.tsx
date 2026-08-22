import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { useActiveSpace } from "@/hooks/useActiveSpace";
import SpaceCard from "./SpaceCard";
import CreateSpaceModal from "./CreateSpaceModal";
import { Radio, Loader2, Users } from "lucide-react";
import { motion } from "framer-motion";

const SpacesFeed = () => {
  const { user } = useAuth();
  const { isFeatureEnabled } = useFeatureToggles();
  const { activeSpace, joinSpace } = useActiveSpace();

  const [createOpen, setCreateOpen] = useState(false);

  const { data: spaces = [], isLoading } = useQuery({
    queryKey: ["spaces", user?.id],
    queryFn: async () => {
      if (!user) {
        // Unauthenticated users see nothing
        return [];
      }
      const { data } = await supabase.rpc("get_visible_spaces" as any, {
        _user_id: user.id,
      });
      return (data as any[]) || [];
    },
    enabled: !!user,
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
        .select("id, display_name, avatar_url, verification_level")
        .in("id", hostIds.slice(0, 50));
      return new Map((data || []).map((p: any) => [p.id, p]));
    },
    enabled: hostIds.length > 0,
  });

  const handleJoinRoom = (spaceId: string) => {
    const space = spaces.find((s: any) => s.id === spaceId);
    if (space) {
      joinSpace({
        id: space.id,
        title: (space as any).title,
        hostId: (space as any).host_id,
      });
    }
  };

  if (!isFeatureEnabled("social_spaces")) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  // Separate live, scheduled, and recorded spaces
  const liveSpaces = spaces.filter((s: any) => s.status === "live");
  const scheduledSpaces = spaces.filter((s: any) => s.status === "scheduled");
  const recordedSpaces = spaces.filter((s: any) => s.status === "ended" && s.is_recorded && s.recording_url);

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
            <p className="text-[10px] text-muted-foreground">Go live or schedule for later</p>
            <p className="text-[9px] text-muted-foreground/60 mt-0.5">
              {isFeatureEnabled("public_spaces_open")
                ? "Public Spaces are visible to everyone on the platform."
                : "Visible only to people you follow and people who follow you."}
            </p>
          </div>
        </motion.button>
      )}

      {liveSpaces.length === 0 && scheduledSpaces.length === 0 && recordedSpaces.length === 0 ? (
        <div className="flex flex-col items-center py-12">
          <Users className="w-8 h-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            {isFeatureEnabled("public_spaces_open") ? "No live Spaces right now" : "No Spaces from your network yet"}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {isFeatureEnabled("public_spaces_open")
              ? "Be the first to start one and reach the whole community."
              : "Follow more people or invite your community to start a Space."}
          </p>
        </div>
      ) : (
        <>
          {liveSpaces.map((s: any, i: number) => (
            <SpaceCard
              key={s.id}
              space={s}
              hostProfile={(hostMap as Map<string, any>).get(s.host_id)}
              index={i}
              onJoinRoom={handleJoinRoom}
            />
          ))}

          {scheduledSpaces.length > 0 && (
            <>
              {liveSpaces.length > 0 && (
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pt-2">
                  Upcoming
                </p>
              )}
              {scheduledSpaces.map((s: any, i: number) => (
                <SpaceCard
                  key={s.id}
                  space={s}
                  hostProfile={(hostMap as Map<string, any>).get(s.host_id)}
                  index={i + liveSpaces.length}
                  onJoinRoom={handleJoinRoom}
                />
              ))}
            </>
          )}

          {recordedSpaces.length > 0 && (
            <>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pt-2">
                Recordings
              </p>
              {recordedSpaces.map((s: any, i: number) => (
                <SpaceCard
                  key={s.id}
                  space={s}
                  hostProfile={(hostMap as Map<string, any>).get(s.host_id)}
                  index={i + liveSpaces.length + scheduledSpaces.length}
                  onJoinRoom={handleJoinRoom}
                />
              ))}
            </>
          )}
        </>
      )}

      <CreateSpaceModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
};

export default SpacesFeed;
