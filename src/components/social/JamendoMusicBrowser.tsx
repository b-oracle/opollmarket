import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, Play, Pause, Music, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface JamendoTrack {
  id: string;
  name: string;
  artist: string;
  duration: number;
  audioUrl: string;
  previewUrl: string;
  imageUrl: string;
}

interface JamendoMusicBrowserProps {
  onPlayInSpace: (url: string, name: string) => void;
  onClose: () => void;
}

const GENRES = [
  { label: "Popular", tag: "" },
  { label: "Pop", tag: "pop" },
  { label: "Electronic", tag: "electronic" },
  { label: "Chill", tag: "chillout" },
  { label: "Rock", tag: "rock" },
  { label: "Hip-Hop", tag: "hiphop" },
  { label: "Jazz", tag: "jazz" },
  { label: "R&B", tag: "rnb" },
  { label: "Classical", tag: "classical" },
  { label: "Ambient", tag: "ambient" },
];

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const JamendoMusicBrowser = ({ onPlayInSpace, onClose }: JamendoMusicBrowserProps) => {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [tracks, setTracks] = useState<JamendoTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchTracks = useCallback(async (q: string, g: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("query", q);
      if (g) params.set("genre", g);
      params.set("limit", "20");

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/jamendo-search?${params.toString()}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("Search failed");
      const json = await resp.json();
      setTracks(json.tracks || []);
    } catch (err: any) {
      toast.error("Failed to search music");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load popular tracks on mount
  useEffect(() => {
    fetchTracks("", "");
  }, [fetchTracks]);

  const handleSearch = (val: string) => {
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchTracks(val, genre), 500);
  };

  const handleGenre = (tag: string) => {
    setGenre(tag);
    fetchTracks(query, tag);
  };

  const togglePreview = (track: JamendoTrack) => {
    if (previewId === track.id) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPreviewId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(track.audioUrl);
    audio.volume = 0.4;
    audio.play().catch(() => {});
    audio.onended = () => setPreviewId(null);
    audioRef.current = audio;
    setPreviewId(track.id);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  return (
    <div className="flex flex-col h-full max-h-[70dvh]">
      {/* Search bar */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Search tracks..."
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="bg-transparent text-sm outline-none w-full text-foreground placeholder:text-muted-foreground"
            autoFocus
          />
        </div>
      </div>

      {/* Genre chips */}
      <div className="px-3 pb-2 flex gap-1.5 overflow-x-auto scrollbar-none">
        {GENRES.map((g) => (
          <button
            key={g.tag || "popular"}
            onClick={() => handleGenre(g.tag)}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              genre === g.tag
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Track list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : tracks.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No tracks found. Try a different search.
          </div>
        ) : (
          tracks.map((track) => (
            <div
              key={track.id}
              className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/60 transition-colors group"
            >
              {/* Album art */}
              <div className="relative w-10 h-10 rounded-md overflow-hidden shrink-0 bg-muted">
                {track.imageUrl ? (
                  <img src={track.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <button
                  onClick={() => togglePreview(track)}
                  className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {previewId === track.id ? (
                    <Pause className="w-4 h-4 text-white" />
                  ) : (
                    <Play className="w-4 h-4 text-white" />
                  )}
                </button>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{track.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {track.artist} · {formatDuration(track.duration)}
                </p>
              </div>

              {/* Play in space button */}
              <button
                onClick={() => {
                  audioRef.current?.pause();
                  audioRef.current = null;
                  setPreviewId(null);
                  onPlayInSpace(track.audioUrl, `${track.name} - ${track.artist}`);
                }}
                className="shrink-0 px-2.5 py-1 rounded-md text-[10px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Play in Space
              </button>
            </div>
          ))
        )}
      </div>

      {/* Attribution */}
      <div className="px-3 py-2 border-t border-border">
        <p className="text-[9px] text-muted-foreground text-center">
          Music powered by Jamendo · Free for streaming
        </p>
      </div>
    </div>
  );
};

export default JamendoMusicBrowser;
