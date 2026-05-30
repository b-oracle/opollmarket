import { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { getPlayableRecordingUrl } from "@/lib/spaceRecordingUrl";
import { toast } from "sonner";

export interface ReplaySpace {
  id: string;
  host_id: string;
  title: string;
  started_at: string;
  ended_at?: string | null;
  recording_url?: string | null;
  is_recorded?: boolean;
  listener_count: number;
}

export interface ReplayHostProfile {
  display_name?: string | null;
  avatar_url?: string | null;
}

interface SpaceReplayState {
  space: ReplaySpace | null;
  hostProfile: ReplayHostProfile | null;
  isExpanded: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  progress: number;
}

interface SpaceReplayContextValue extends SpaceReplayState {
  openReplay: (space: ReplaySpace, hostProfile?: ReplayHostProfile | null) => Promise<void>;
  closeReplay: () => void;
  minimize: () => void;
  expand: () => void;
  togglePlay: () => void;
  seek: (pct: number) => void;
  skip: (sec: number) => void;
  setSpeed: (rate: number) => void;
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
}

const SpaceReplayContext = createContext<SpaceReplayContextValue | null>(null);

export const useSpaceReplay = () => {
  const ctx = useContext(SpaceReplayContext);
  if (!ctx) throw new Error("useSpaceReplay must be used within SpaceReplayProvider");
  return ctx;
};

export const SpaceReplayProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<SpaceReplayState>({
    space: null,
    hostProfile: null,
    isExpanded: false,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    progress: 0,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const openReplay = useCallback(async (space: ReplaySpace, hostProfile?: ReplayHostProfile | null) => {
    // If same space, just expand
    if (audioRef.current && state.space?.id === space.id) {
      setState(prev => ({ ...prev, isExpanded: true }));
      return;
    }

    // Cleanup previous audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (!space.recording_url) return;

    // Bucket is private — resolve to a fresh signed URL
    const playable = await getPlayableRecordingUrl(space.recording_url);
    if (!playable) {
      toast.error("Recording is unavailable. It may have expired or been removed.");
      return;
    }

    const audio = new Audio();
    // NOTE: do NOT set crossOrigin="anonymous" — Supabase signed URLs do not
    // always respond with matching CORS headers, which makes the audio element
    // silently hang at readyState=0 (the symptom: tap play, nothing happens).
    audio.preload = "auto";
    audioRef.current = audio;

    const onTime = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setState(prev => ({
          ...prev,
          progress: (audio.currentTime / audio.duration) * 100,
          currentTime: audio.currentTime,
        }));
      }
    };
    const onMeta = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setState(prev => ({ ...prev, duration: audio.duration }));
      }
    };
    const onEnd = () => {
      setState(prev => ({ ...prev, isPlaying: false, progress: 100 }));
    };
    const onPlay = () => setState(prev => ({ ...prev, isPlaying: true }));
    const onPause = () => setState(prev => ({ ...prev, isPlaying: false }));
    const onErr = () => {
      const code = audio.error?.code;
      console.error("[useSpaceReplay] playback error", code, audio.error?.message, playable);
      toast.error(code === 4 ? "Recording format not supported on this browser" : "Failed to load recording");
    };

    // Attach listeners BEFORE setting src so we don't miss loadedmetadata
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onErr);
    audio.src = playable;
    audio.load();

    setState({
      space,
      hostProfile: hostProfile || null,
      isExpanded: true,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      progress: 0,
    });
  }, [state.space?.id]);

  const closeReplay = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setState({
      space: null,
      hostProfile: null,
      isExpanded: false,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      progress: 0,
    });
  }, []);

  const minimize = useCallback(() => {
    setState(prev => ({ ...prev, isExpanded: false }));
  }, []);

  const expand = useCallback(() => {
    setState(prev => ({ ...prev, isExpanded: true }));
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (state.isPlaying) {
      audio.pause();
      setState(prev => ({ ...prev, isPlaying: false }));
    } else {
      audio.play().catch(() => {});
      setState(prev => ({ ...prev, isPlaying: true }));
    }
  }, [state.isPlaying]);

  const seek = useCallback((pct: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    audio.currentTime = pct * audio.duration;
    setState(prev => ({ ...prev, progress: pct * 100 }));
  }, []);

  const skip = useCallback((sec: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + sec));
  }, []);

  const setSpeed = useCallback((rate: number) => {
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, []);

  return (
    <SpaceReplayContext.Provider
      value={{
        ...state,
        openReplay,
        closeReplay,
        minimize,
        expand,
        togglePlay,
        seek,
        skip,
        setSpeed,
        audioRef,
      }}
    >
      {children}
    </SpaceReplayContext.Provider>
  );
};
