import { useState, useEffect } from "react";

interface YouTubeEmbedProps {
  url: string;
  className?: string;
  fallbackImage?: string | null;
  fallbackAlt?: string;
  /** When true, video starts muted and cannot be unmuted via embed controls. Default true (required for autoplay). */
  autoplayMuted?: boolean;
  /** When true, scales the iframe to fill the container (like object-fit: cover), cropping edges. */
  fillContainer?: boolean;
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

/**
 * Extract StreamYard broadcast ID from URL.
 * Supports: streamyard.com/watch/ID and streamyard.com/ID
 */
export const getStreamYardId = (url: string): string | null => {
  const match = url.match(/streamyard\.com\/(?:watch\/)?([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
};

export const isStreamYardUrl = (url: string): boolean => !!getStreamYardId(url);

/** Returns true if the URL is a supported stream platform (YouTube or StreamYard). */
export const isStreamUrl = (url: string): boolean => isYouTubeUrl(url) || isStreamYardUrl(url);

const YouTubeEmbed = ({ url, className = "", fallbackImage, fallbackAlt, autoplayMuted = true, fillContainer = false }: YouTubeEmbedProps) => {
  const videoId = getYouTubeId(url);
  const streamYardId = !videoId ? getStreamYardId(url) : null;
  const [showFallback, setShowFallback] = useState(false);

  // Check if YouTube video exists via thumbnail probe
  useEffect(() => {
    if (!videoId) return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth === 120 && img.naturalHeight === 90) {
        setShowFallback(true);
      }
    };
    img.onerror = () => setShowFallback(true);
    img.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  }, [videoId]);

  // StreamYard embed
  if (streamYardId) {
    return (
      <iframe
        className={className}
        src={`https://streamyard.com/watch/${streamYardId}?embed=true`}
        title="StreamYard broadcast"
        allow="autoplay; encrypted-media"
        allowFullScreen
        loading="lazy"
      />
    );
  }

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

  const params = autoplayMuted
    ? `autoplay=1&mute=1&loop=1&playlist=${videoId}&rel=0&modestbranding=1`
    : `rel=0&modestbranding=1`;

  return (
    <iframe
      className={className}
      src={`https://www.youtube.com/embed/${videoId}?${params}`}
      title="YouTube video"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      loading="lazy"
    />
  );
};

export default YouTubeEmbed;
