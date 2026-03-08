import { forwardRef, useEffect, useState } from "react";
import { isNftAvatar } from "@/components/NftBadge";
import watermarkLogo from "@/assets/watermark-logo.png";
import blueLogo from "@/assets/blue-opoll-logo.png";

interface ProfileShareCardProps {
  displayName: string;
  bio?: string | null;
  avatarUrl?: string | null;
  followersCount: number;
  followingCount: number;
  likesCount: number;
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
  ({ displayName, bio, avatarUrl, followersCount, followingCount, likesCount, referralCount, marketsCount, positionsCount, leaderboardRanks }, ref) => {
    const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

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
            borderRadius: "20px",
            border: `2px solid ${colors.border}`,
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
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  style={{ width: "72px", height: "72px", objectFit: "cover", display: "block" }}
                  crossOrigin="anonymous"
                />
              ) : (
                <div style={{ fontSize: "28px", fontWeight: 800, color: colors.primary, lineHeight: 1 }}>
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                <div style={{
                  fontSize: "20px",
                  fontWeight: 800,
                  color: colors.fg,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "280px",
                  lineHeight: "1.3",
                }}>
                  {displayName}
                </div>
                {isNftAvatar(avatarUrl) && (
                  <span style={{ fontSize: "14px", flexShrink: 0 }}>💎</span>
                )}
              </div>
              {bio && (
                <div style={{
                  fontSize: "12px",
                  color: colors.mutedFg,
                  lineHeight: "1.4",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "300px",
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
              { label: "Likes", value: likesCount },
              { label: "Referrals", value: referralCount },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "16px", fontWeight: 800, color: colors.fg, lineHeight: "1.3" }}>{s.value}</div>
                <div style={{ fontSize: "9px", color: colors.mutedFg, marginTop: "2px" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Activity Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
            {[
              { label: "Markets Created", value: marketsCount },
              { label: "Predictions", value: positionsCount },
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
