import { forwardRef, useMemo, useState, useEffect } from "react";
import { getAvatarInitials } from "@/lib/utils";
import type { VerificationLevel } from "@/components/NftBadge";
import watermarkLogo from "@/assets/watermark-logo.png";
import blueLogo from "@/assets/blue-opoll-logo.png";

interface ProfileShareCardProps {
  displayName: string;
  bio?: string | null;
  avatarUrl?: string | null;
  verificationLevel?: VerificationLevel;
  followersCount: number;
  followingCount: number;
  tradesCount: number;
  predictionsCount?: number;
  quickTradesCount?: number;
  referralCount: number;
  marketsCount: number;
  positionsCount: number;
  leaderboardRanks?: {
    predictionRank: number | null;
    referralRank: number | null;
    qtProfitRank: number | null;
    streakRank: number | null;
  } | null;
}

/** Inline SVG badge for html2canvas compatibility */
const InlineBadgeSvg = ({ color, size = 18 }: { color: "gold" | "blue"; size?: number }) => {
  const stops =
    color === "gold"
      ? { s1: "#F7D86C", s2: "#E8B730", s3: "#C6951B" }
      : { s1: "#60A5FA", s2: "#3B82F6", s3: "#2563EB" };
  const id = `share-${color}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81C14.67 2.63 13.43 1.75 12 1.75S9.33 2.63 8.66 3.94c-1.39-.46-2.9-.2-3.91.81s-1.27 2.52-.81 3.91C2.63 9.33 1.75 10.57 1.75 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.27 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34Z"
        fill={`url(#${id})`}
      />
      <path
        d="M9.726 15.39a.75.75 0 0 1-.53-.22l-2.72-2.72a.75.75 0 1 1 1.06-1.06l2.19 2.19 4.99-4.99a.75.75 0 1 1 1.06 1.06l-5.52 5.52a.75.75 0 0 1-.53.22Z"
        fill="#fff"
      />
      <defs>
        <linearGradient id={id} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor={stops.s1} />
          <stop offset="0.5" stopColor={stops.s2} />
          <stop offset="1" stopColor={stops.s3} />
        </linearGradient>
      </defs>
    </svg>
  );
};

/**
 * Resolves CSS variable to a computed color string.
 * html2canvas cannot resolve var(--xxx) so we must inline real values.
 */
const resolveColor = (cssVar: string, fallback: string): string => {
  if (typeof document === "undefined") return fallback;
  const val = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  return val ? `hsl(${val})` : fallback;
};

const rankLabel = (rank: number | null): string => {
  if (!rank) return "—";
  if (rank === 1) return "🥇 #1";
  if (rank === 2) return "🥈 #2";
  if (rank === 3) return "🥉 #3";
  return `#${rank}`;
};

const ProfileShareCard = forwardRef<HTMLDivElement, ProfileShareCardProps>(
  ({ displayName, bio, avatarUrl, verificationLevel = "none", followersCount, followingCount, tradesCount, predictionsCount, quickTradesCount, referralCount, marketsCount, positionsCount, leaderboardRanks }, ref) => {
    const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

    // Pre-convert avatar to base64 via server proxy to avoid CORS issues with html2canvas
    const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
    useEffect(() => {
      if (!avatarUrl) { setAvatarBase64(null); return; }

      // If already a data URL or same-origin, use directly
      if (avatarUrl.startsWith("data:")) { setAvatarBase64(avatarUrl); return; }

      let cancelled = false;

      const fetchViaProxy = async () => {
        try {
          const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
          const res = await fetch(
            `https://${projectId}.supabase.co/functions/v1/avatar-proxy`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: avatarUrl }),
            }
          );
          if (!res.ok) throw new Error("proxy failed");
          const { dataUrl } = await res.json();
          if (!cancelled && dataUrl) setAvatarBase64(dataUrl);
        } catch {
          // Fallback: try client-side canvas conversion
          if (cancelled) return;
          try {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
              if (cancelled) return;
              try {
                const canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext("2d");
                ctx?.drawImage(img, 0, 0);
                setAvatarBase64(canvas.toDataURL("image/png"));
              } catch { /* fallback to raw url */ }
            };
            img.src = avatarUrl;
          } catch { /* give up */ }
        }
      };

      fetchViaProxy();
      return () => { cancelled = true; };
    }, [avatarUrl]);

    // Resolve colors synchronously so they're available on first render for html2canvas
    const colors = useMemo(() => ({
      bg: resolveColor("--background", isDark ? "#0a0a0a" : "#ffffff"),
      fg: resolveColor("--foreground", isDark ? "#fafafa" : "#0a0a0a"),
      primary: resolveColor("--primary", "#02C7FC"),
      muted: resolveColor("--muted", isDark ? "#1a1a2e" : "#f4f4f5"),
      mutedFg: resolveColor("--muted-foreground", isDark ? "#a1a1aa" : "#71717a"),
      border: resolveColor("--border", isDark ? "#27272a" : "#e4e4e7"),
    }), [isDark]);

    const rankItems = leaderboardRanks
      ? [
          { emoji: "📈", label: "Prediction PnL", rank: leaderboardRanks.predictionRank },
          { emoji: "🎁", label: "Referrals", rank: leaderboardRanks.referralRank },
          { emoji: "⚡", label: "Quick Trade", rank: leaderboardRanks.qtProfitRank },
          { emoji: "🔥", label: "Win Streak", rank: leaderboardRanks.streakRank },
        ]
      : [];

    return (
      <div
        ref={ref}
        style={{
          position: "absolute",
          left: "-9999px",
          top: "0px",
          width: "440px",
          zIndex: -1,
          opacity: 1,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: "440px",
            padding: "28px",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            borderRadius: "0px",
            border: "none",
            backgroundColor: colors.bg,
            color: colors.fg,
          }}
        >
          {/* Profile Header */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
            <div
              style={{
                width: "72px",
                height: "72px",
                borderRadius: "50%",
                overflow: "hidden",
                border: `3px solid ${colors.primary}40`,
                backgroundColor: `${colors.primary}15`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <img
                src={avatarBase64 || avatarUrl || ""}
                alt={displayName}
                style={{
                  width: "72px",
                  height: "72px",
                  objectFit: "cover",
                  display: (avatarBase64 || avatarUrl) ? "block" : "none",
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                  const parent = (e.target as HTMLImageElement).parentElement;
                  const fallback = parent?.querySelector("[data-fallback]") as HTMLElement;
                  if (fallback) fallback.style.display = "flex";
                }}
              />
              <div
                data-fallback="true"
                style={{
                  fontSize: "28px",
                  fontWeight: 800,
                  color: colors.primary,
                  lineHeight: 1,
                  display: (avatarBase64 || avatarUrl) ? "none" : "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  height: "100%",
                }}
              >
                {getAvatarInitials(displayName, { maxChars: 2 })}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                <div style={{
                  fontSize: "20px",
                  fontWeight: 800,
                  color: colors.fg,
                  lineHeight: "1.3",
                  wordBreak: "break-word" as const,
                }}>
                  {displayName}
                </div>
                {verificationLevel !== "none" && (
                  <span style={{ flexShrink: 0, display: "inline-flex" }}>
                    <InlineBadgeSvg color={verificationLevel === "gold" ? "gold" : "blue"} size={18} />
                  </span>
                )}
              </div>
              {bio && (
                <div style={{
                  fontSize: "12px",
                  color: colors.mutedFg,
                  lineHeight: "1.4",
                  wordBreak: "break-word" as const,
                  whiteSpace: "normal",
                }}>
                  {bio}
                </div>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "8px",
              marginBottom: "16px",
              padding: "14px",
              borderRadius: "14px",
              backgroundColor: `${colors.muted}50`,
              border: `1px solid ${colors.border}50`,
            }}
          >
            {[
              { label: "Followers", value: followersCount },
              { label: "Following", value: followingCount },
              { label: "Predictions", value: predictionsCount ?? 0 },
              { label: "Quick Trades", value: quickTradesCount ?? 0 },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "16px", fontWeight: 800, color: colors.fg, lineHeight: "1.3" }}>{s.value}</div>
                <div style={{ fontSize: "9px", color: colors.mutedFg, marginTop: "2px" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Activity Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "16px" }}>
            {[
              { label: "Referrals", value: referralCount },
              { label: "Markets Created", value: marketsCount },
              { label: "Active Positions", value: positionsCount },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  padding: "12px",
                  borderRadius: "12px",
                  backgroundColor: `${colors.muted}50`,
                  border: `1px solid ${colors.border}50`,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "18px", fontWeight: 800, color: colors.primary, lineHeight: "1.3" }}>{s.value}</div>
                <div style={{ fontSize: "10px", color: colors.mutedFg }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Leaderboard Rankings */}
          {rankItems.length > 0 && (
            <div
              style={{
                padding: "14px",
                borderRadius: "14px",
                backgroundColor: `${colors.muted}50`,
                border: `1px solid ${colors.border}50`,
                marginBottom: "16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                <span style={{ fontSize: "14px" }}>🏆</span>
                <span style={{ fontSize: "12px", fontWeight: 700, color: colors.fg }}>Leaderboard Rankings</span>
              </div>
              {rankItems.map((item) => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "13px" }}>{item.emoji}</span>
                    <span style={{ fontSize: "12px", fontWeight: 500, color: colors.fg }}>{item.label}</span>
                  </div>
                  <span style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    color: item.rank && item.rank <= 3 ? colors.primary : colors.fg,
                  }}>
                    {rankLabel(item.rank)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* CTA + Watermark Footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: colors.primary }}>
                Join me on OPoll 🔥
              </div>
              <div style={{ fontSize: "9px", color: colors.mutedFg }}>
                Predict and earn on the social prediction platform
              </div>
            </div>
            <img
              src={isDark ? watermarkLogo : blueLogo}
              alt="OPoll"
              style={{ height: "28px", opacity: 0.5 }}
              crossOrigin="anonymous"
            />
          </div>
        </div>
      </div>
    );
  }
);

ProfileShareCard.displayName = "ProfileShareCard";

export default ProfileShareCard;
