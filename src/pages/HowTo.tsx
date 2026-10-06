import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Play, Plus, Trash2, Video, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import SEOHead from "@/components/SEOHead";

interface HowtoVideo { id: string; youtube_id: string; title: string; description: string | null; }

export const parseYouTubeId = (url: string): string | null => {
  const s = url.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
};

const embedUrl = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&loop=1&playlist=${id}&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3`;

const HowTo = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, isAdmin, isSuperAdmin, isSupport } = useAuth();
  const canManage = !!user && (isAdmin || isSuperAdmin || isSupport);
  const [playing, setPlaying] = useState<HowtoVideo | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

  const { data: videos = [], isLoading } = useQuery({
    queryKey: ["howto-videos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("howto_videos").select("id, youtube_id, title, description").order("sort_order").order("created_at", { ascending: false });
      if (error) throw error;
      return data as HowtoVideo[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const id = parseYouTubeId(link);
      if (!id) throw new Error("That doesn't look like a YouTube link");
      if (title.trim().length < 2) throw new Error("Please add a title");
      const { error } = await supabase.from("howto_videos").insert({ youtube_id: id, title: title.trim().slice(0, 150), description: desc.trim().slice(0, 1000) || null, created_by: user!.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Video added"); setLink(""); setTitle(""); setDesc(""); setShowForm(false); qc.invalidateQueries({ queryKey: ["howto-videos"] }); },
    onError: (e: any) => toast.error(e.message || "Could not add video"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("howto_videos").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Video removed"); qc.invalidateQueries({ queryKey: ["howto-videos"] }); },
    onError: () => toast.error("Could not remove video"),
  });

  return (
    <div className="min-h-screen bg-background pb-24">
      <SEOHead title="How-to Video Tutorials | OPollmarket" description="Watch short video guides on predicting, creating markets, deposits and more on OPollmarket." />
      <div className="max-w-5xl mx-auto px-4 pt-4">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-accent" aria-label="Back"><ArrowLeft className="w-5 h-5" /></button>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2"><Video className="w-5 h-5 text-primary" /> How-to Videos</h1>
            <p className="text-xs text-muted-foreground">Short guides to get the most out of the platform</p>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setShowForm((v) => !v)}><Plus className="w-4 h-4 mr-1" /> Add video</Button>
          )}
        </div>

        {canManage && showForm && (
          <div className="bg-card border border-border rounded-2xl p-4 mb-6 space-y-3">
            <Input placeholder="Paste YouTube link" value={link} onChange={(e) => setLink(e.target.value)} />
            <Input placeholder="Title" value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} />
            <Textarea placeholder="Description (optional)" value={desc} maxLength={1000} onChange={(e) => setDesc(e.target.value)} />
            <Button onClick={() => add.mutate()} disabled={add.isPending}>Save video</Button>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : videos.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-20">No videos yet. Check back soon.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <div key={v.id} className="bg-card border border-border rounded-2xl overflow-hidden group">
                <button onClick={() => setPlaying(v)} className="relative block w-full aspect-video bg-muted">
                  <img src={`https://i.ytimg.com/vi/${v.youtube_id}/hqdefault.jpg`} alt={v.title} loading="lazy" className="w-full h-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-background/20 group-hover:bg-background/40 transition-colors">
                    <span className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center"><Play className="w-5 h-5 ml-0.5" /></span>
                  </span>
                </button>
                <div className="p-3 flex gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold line-clamp-2">{v.title}</h3>
                    {v.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{v.description}</p>}
                  </div>
                  {canManage && (
                    <button onClick={() => confirm("Remove this video?") && remove.mutate(v.id)} className="p-1.5 h-fit rounded-lg text-muted-foreground hover:text-destructive" aria-label="Remove video"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {playing && (
        <div className="fixed inset-0 z-[100] bg-background/90 backdrop-blur flex items-center justify-center p-4" onClick={() => setPlaying(null)}>
          <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold truncate pr-4">{playing.title}</h2>
              <button onClick={() => setPlaying(null)} className="p-2 rounded-full hover:bg-accent" aria-label="Close"><X className="w-5 h-5" /></button>
            </div>
            <div className="aspect-video rounded-xl overflow-hidden bg-muted">
              <iframe src={embedUrl(playing.youtube_id)} title={playing.title} className="w-full h-full" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
            </div>
            {playing.description && <p className="text-xs text-muted-foreground mt-3">{playing.description}</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default HowTo;
