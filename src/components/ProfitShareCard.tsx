import { forwardRef, useMemo } from "react";
import logoLight from "@/assets/blue-opoll-logo.png";
import logoDark from "@/assets/watermark-logo.png";

interface ProfitShareCardProps {
  market: string;
  side: string;
  profit: number;
  payout: number;
  displayName: string;
  referralCode: string;
}

const ProfitShareCard = forwardRef<HTMLDivElement, ProfitShareCardProps>(
  ({ market, side, profit, payout, displayName, referralCode }, ref) => {
    const isDark = document.documentElement.classList.contains("dark");

    const resolveColor = (varName: string, fallback: string) => {
      try {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        if (!raw) return fallback;
        return `hsl(${raw})`;
      } catch {
        return fallback;
      }
    };

    const colors = useMemo(() => ({
      bg: isDark ? "#0c1220" : "#f8fafc",
      cardBg: isDark ? "#131c2e" : "#ffffff",
      fg: resolveColor("--foreground", isDark ? "#fafafa" : "#0a0a0a"),
      muted: resolveColor("--muted-foreground", isDark ? "#9ca3af" : "#6b7280"),
      primary: resolveColor("--primary", "#02C7FC"),
      green: "#22c55e",
      border: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
    }), [isDark]);

    const logo = isDark ? logoDark : logoLight;

    return (
      <div
        ref={ref}
        style={{
          position: "fixed",
          left: "-9999px",
          top: "0px",
          width: "400px",
          fontFamily: "'Inter', 'SF Pro Display', -apple-system, sans-serif",
          background: `linear-gradient(145deg, ${colors.bg}, ${colors.cardBg})`,
          borderRadius: "20px",
          overflow: "hidden",
          padding: "0",
        }}
      >
        {/* Top accent bar */}
        <div style={{
          height: "4px",
          background: "linear-gradient(90deg, #02C7FC, #A855F7, #22c55e)",
        }} />

        {/* Content */}
        <div style={{ padding: "28px 24px 20px" }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: "20px" }}>
            <img src={logo} alt="oPoll" style={{ height: "24px", objectFit: "contain" }} crossOrigin="anonymous" />
          </div>

          {/* Profit highlight */}
          <div style={{
            background: isDark ? "rgba(34,197,94,0.1)" : "rgba(34,197,94,0.08)",
            border: `1px solid rgba(34,197,94,0.2)`,
            borderRadius: "16px",
            padding: "20px",
            marginBottom: "16px",
            textAlign: "center",
          }}>
            <div style={{
              fontSize: "13px",
              fontWeight: 600,
              color: colors.muted,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              marginBottom: "6px",
            }}>
              Profit Earned
            </div>
            <div style={{
              fontSize: "42px",
              fontWeight: 800,
              color: colors.green,
              lineHeight: "1.1",
              marginBottom: "4px",
            }}>
              +${profit.toFixed(2)}
            </div>
            <div style={{
              fontSize: "14px",
              color: colors.muted,
            }}>
              from ${payout.toFixed(2)} payout
            </div>
          </div>

          {/* Market info */}
          <div style={{
            background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
            border: `1px solid ${colors.border}`,
            borderRadius: "12px",
            padding: "14px 16px",
            marginBottom: "16px",
          }}>
            <div style={{
              fontSize: "13px",
              color: colors.muted,
              marginBottom: "6px",
            }}>
              Prediction Market
            </div>
            <div style={{
              fontSize: "15px",
              fontWeight: 600,
              color: colors.fg,
              lineHeight: "1.4",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}>
              {market}
            </div>
            <div style={{ marginTop: "8px" }}>
              <span style={{
                display: "inline-block",
                fontSize: "12px",
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: "6px",
                background: side === "YES" ? "rgba(2,199,252,0.15)" : "rgba(239,68,68,0.15)",
                color: side === "YES" ? "#02C7FC" : "#ef4444",
              }}>
                {side} ✓
              </span>
            </div>
          </div>

          {/* CTA */}
          <div style={{
            background: "linear-gradient(135deg, rgba(2,199,252,0.1), rgba(168,85,247,0.1))",
            border: "1px solid rgba(2,199,252,0.2)",
            borderRadius: "12px",
            padding: "14px 16px",
            textAlign: "center",
          }}>
            <div style={{
              fontSize: "14px",
              fontWeight: 700,
              color: colors.fg,
              marginBottom: "4px",
            }}>
              🔥 Join {displayName || "me"} on oPoll
            </div>
            <div style={{
              fontSize: "12px",
              color: colors.muted,
              marginBottom: "8px",
            }}>
              Predict outcomes & win real rewards
            </div>
            <div style={{
              fontSize: "13px",
              fontWeight: 600,
              color: colors.primary,
              wordBreak: "break-all",
            }}>
              opoll.org{referralCode ? `?ref=${referralCode}` : ""}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

ProfitShareCard.displayName = "ProfitShareCard";
export default ProfitShareCard;
