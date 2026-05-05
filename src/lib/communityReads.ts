import { supabase } from "@/integrations/supabase/client";

const lsKey = (userId: string, slug: string) => `community_last_read_${userId}_${slug}`;

export async function fetchCommunityReads(userId: string): Promise<Record<string, string>> {
  const { data } = await supabase
    .from("community_reads" as any)
    .select("community_slug, last_read_at")
    .eq("user_id", userId);
  const map: Record<string, string> = {};
  for (const r of (data || []) as any[]) {
    map[r.community_slug] = r.last_read_at;
    try { localStorage.setItem(lsKey(userId, r.community_slug), r.last_read_at); } catch {}
  }
  return map;
}

export function getLastReadLocal(userId: string, slug: string): string | null {
  try { return localStorage.getItem(lsKey(userId, slug)); } catch { return null; }
}

export async function markCommunityReadRemote(userId: string, slug: string) {
  const now = new Date().toISOString();
  try { localStorage.setItem(lsKey(userId, slug), now); } catch {}
  await supabase
    .from("community_reads" as any)
    .upsert({ user_id: userId, community_slug: slug, last_read_at: now } as any, {
      onConflict: "user_id,community_slug",
    } as any);
}
