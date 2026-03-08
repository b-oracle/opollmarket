import { forwardRef } from "react";
import NftBadge, { isNftAvatar } from "@/components/NftBadge";
import { Trophy, Users, Heart, Gift, TrendingUp, Zap, Flame, Crown, Medal, Award, Hexagon } from "lucide-react";
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

const RankDisplay = ({ rank }: { rank: number | null }) => {
  if (!rank) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-1">
      {rank === 1 && <Crown className="w-3.5 h-3.5" style={{ color: "hsl(45, 93%, 58%)" }} />}
      {rank === 2 && <Medal className="w-3.5 h-3.5" style={{ color: "hsl(0, 0%, 78%)" }} />}
      {rank === 3 && <Award className="w-3.5 h-3.5" style={{ color: "hsl(30, 75%, 40%)" }} />}
      <span className={`text-sm font-bold ${rank <= 3 ? "text-primary" : "text-foreground"}`}>#{rank}</span>
    </div>
  );
};

const ProfileShareCard = forwardRef<HTMLDivElement, ProfileShareCardProps>(
  ({ displayName, bio, avatarUrl, followersCount, followingCount, likesCount, referralCount, marketsCount, positionsCount, leaderboardRanks }, ref) => {
    const hasNft = isNftAvatar(avatarUrl);
    const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

    return (
      <div
        ref={ref}
        style={{
          position: "fixed",
          left: "-9999px",
          top: 0,
          width: "440px",
          zIndex: -1,
          pointerEvents: "none",
        }}
      >
        <div
          className="bg-background text-foreground"
          style={{
            width: "440px",
            padding: "28px",
            fontFamily: "system-ui, -apple-system, sans-serif",
            borderRadius: "20px",
            border: "2px solid hsl(var(--border))",
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
                border: "3px solid hsl(var(--primary) / 0.3)",
                background: "hsl(var(--primary) / 0.1)",
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
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  crossOrigin="anonymous"
                />
              ) : (
                <span style={{ fontSize: "28px", fontWeight: 800, color: "hsl(var(--primary))" }}>
                  {displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                <span style={{ fontSize: "20px", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {displayName}
                </span>
                {hasNft && <Hexagon className="w-4 h-4 text-primary fill-primary/20" style={{ flexShrink: 0 }} />}
              </div>
              {bio && (
                <p style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {bio}
                </p>
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
              background: "hsl(var(--muted) / 0.3)",
              border: "1px solid hsl(var(--border) / 0.3)",
            }}
          >
            {[
              { label: "Followers", value: followersCount },
              { label: "Following", value: followingCount },
              { label: "Likes", value: likesCount },
              { label: "Referrals", value: referralCount },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <p style={{ fontSize: "16px", fontWeight: 800, color: "hsl(var(--foreground))" }}>{s.value}</p>
                <p style={{ fontSize: "9px", color: "hsl(var(--muted-foreground))", marginTop: "2px" }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Activity Stats */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                padding: "12px",
                borderRadius: "12px",
                background: "hsl(var(--muted) / 0.3)",
                border: "1px solid hsl(var(--border) / 0.3)",
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: "18px", fontWeight: 800, color: "hsl(var(--primary))" }}>{marketsCount}</p>
              <p style={{ fontSize: "10px", color: "hsl(var(--muted-foreground))" }}>Markets Created</p>
            </div>
            <div
              style={{
                padding: "12px",
                borderRadius: "12px",
                background: "hsl(var(--muted) / 0.3)",
                border: "1px solid hsl(var(--border) / 0.3)",
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: "18px", fontWeight: 800, color: "hsl(var(--primary))" }}>{positionsCount}</p>
              <p style={{ fontSize: "10px", color: "hsl(var(--muted-foreground))" }}>Predictions</p>
            </div>
          </div>

          {/* Leaderboard Rankings */}
          {leaderboardRanks && (
            <div
              style={{
                padding: "14px",
                borderRadius: "14px",
                background: "hsl(var(--muted) / 0.3)",
                border: "1px solid hsl(var(--border) / 0.3)",
                marginBottom: "16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                <Trophy className="w-4 h-4 text-primary" />
                <span style={{ fontSize: "12px", fontWeight: 700 }}>Leaderboard Rankings</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {[
                  { icon: <TrendingUp className="w-3.5 h-3.5" style={{ color: "#10b981" }} />, label: "Prediction PnL", rank: leaderboardRanks.predictionRank },
                  { icon: <Gift className="w-3.5 h-3.5" style={{ color: "#f59e0b" }} />, label: "Referrals", rank: leaderboardRanks.referralRank },
                  { icon: <Zap className="w-3.5 h-3.5" style={{ color: "#3b82f6" }} />, label: "Quick Trade", rank: leaderboardRanks.qtProfitRank },
                  { icon: <Flame className="w-3.5 h-3.5" style={{ color: "#f97316" }} />, label: "Win Streak", rank: leaderboardRanks.streakRank },
                ].map((item) => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {item.icon}
                      <span style={{ fontSize: "12px", fontWeight: 500 }}>{item.label}</span>
                    </div>
                    <RankDisplay rank={item.rank} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA + Watermark Footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "hsl(var(--primary))" }}>
                Join me on OPoll 🔥
              </p>
              <p style={{ fontSize: "9px", color: "hsl(var(--muted-foreground))" }}>
                Predict and earn on the social prediction platform
              </p>
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
