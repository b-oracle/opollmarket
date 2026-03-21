import { useState, useEffect } from "react";

interface YouTubeEmbedProps {
  url: string;
  className?: string;
  fallbackImage?: string | null;
  fallbackAlt?: string;
}

/**
 * Extract YouTube video ID from various URL formats.
 */
export const getYouTubeId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const match = url.match(p);
    if (match) return match[1];
  }
  return null;
};

export const isYouTubeUrl = (url: string): boolean => !!getYouTubeId(url);

const YouTubeEmbed = ({ url, className = "", fallbackImage, fallbackAlt }: YouTubeEmbedProps) => {
  const videoId = getYouTubeId(url);
  const [showFallback, setShowFallback] = useState(false);

  // Check if video exists via thumbnail probe
  useEffect(() => {
    if (!videoId) return;
    const img = new Image();
    img.onload = () => {
      // YouTube returns a 120x90 default placeholder for unavailable videos
      if (img.naturalWidth === 120 && img.naturalHeight === 90) {
        setShowFallback(true);
      }
    };
    img.onerror = () => setShowFallback(true);
    img.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  }, [videoId]);

  if (!videoId) return null;

  if (showFallback && fallbackImage) {
    return (
      <img
        src={fallbackImage}
        alt={fallbackAlt || ""}
        className={`${className} object-cover`}
      />
    );
  }

  return (
    <iframe
      className={className}
      src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&rel=0&modestbranding=1`}
      title="YouTube video"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      loading="lazy"
    />
  );
};

export default YouTubeEmbed;
