import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AimtellSegment {
  id: number;
  name: string;
  subscriberCount?: number;
}

export function useAimtellSegments() {
  const [segments, setSegments] = useState<AimtellSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("aimtell-segments");
        if (fnError) throw fnError;

        const raw = data?.segments;
        if (Array.isArray(raw)) {
          const mapped: AimtellSegment[] = raw.map((s: any) => ({
            id: Number(s.id ?? s.idSegment ?? s.segmentId),
            name: String(s.name ?? s.segmentName ?? `Segment ${s.id}`),
            subscriberCount: s.subscriberCount ?? s.subscriber_count ?? undefined,
          }));
          setSegments(mapped);
        } else {
          setSegments([]);
        }
      } catch (err: any) {
        console.error("Failed to fetch Aimtell segments:", err);
        setError(err.message || "Failed to load segments");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  return { segments, loading, error };
}
