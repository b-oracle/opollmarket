import { forwardRef } from "react";
import { ArrowUpRight, ArrowDownRight, DollarSign, Target, Percent, TrendingUp, BarChart3 } from "lucide-react";
import logoLight from "@/assets/blue-opoll-logo.png";
import logoDark from "@/assets/watermark-logo.png";

interface PortfolioSummaryCardProps {
  totalInvested: number;
  totalValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  totalMaxPayout: number;
  positionCount: number;
}

export const PortfolioSummaryShareCard = forwardRef<HTMLDivElement, PortfolioSummaryCardProps>(
  ({ totalInvested, totalValue, totalPnl, totalPnlPercent, totalMaxPayout, positionCount }, ref) => {
    const isProfit = totalPnl >= 0;
    const isDark = document.documentElement.classList.contains("dark");

    return (
      <div
        ref={ref}
        style={{ position: "absolute", left: "-9999px", top: 0, width: 400 }}
      >
        <div
          style={{
            background: isDark
              ? "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)"
              : "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)",
            borderRadius: 20,
            padding: 28,
            fontFamily: "system-ui, -apple-system, sans-serif",
            color: isDark ? "#f1f5f9" : "#0f172a",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <BarChart3 style={{ width: 20, height: 20, color: isDark ? "#38bdf8" : "#0284c7" }} />
              <span style={{ fontSize: 16, fontWeight: 700 }}>My Portfolio</span>
            </div>
            <img src={isDark ? logoDark : logoLight} alt="logo" style={{ height: 24, opacity: 0.7 }} crossOrigin="anonymous" />
          </div>

          {/* Main PnL */}
          <div
            style={{
              background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
              borderRadius: 14,
              padding: 20,
              marginBottom: 16,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 4 }}>
              Unrealized P&L
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 800,
                color: isProfit ? "#22c55e" : "#ef4444",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
              }}
            >
              {isProfit ? "+" : "-"}${Math.abs(totalPnl).toFixed(2)}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: isProfit ? "#22c55e" : "#ef4444",
                marginTop: 2,
              }}
            >
              {isProfit ? "+" : ""}{totalPnlPercent.toFixed(1)}% ROI
            </div>
          </div>

          {/* Stats grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", opacity: 0.5, marginBottom: 2 }}>Invested</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>${totalInvested.toFixed(2)}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", opacity: 0.5, marginBottom: 2 }}>Value</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>${totalValue.toFixed(2)}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", opacity: 0.5, marginBottom: 2 }}>Max Payout</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>${totalMaxPayout.toFixed(2)}</div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              marginTop: 16,
              paddingTop: 12,
              borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`,
              fontSize: 11,
              opacity: 0.5,
              textAlign: "center",
            }}
          >
            {positionCount} active position{positionCount !== 1 ? "s" : ""} • opoll.org
          </div>
        </div>
      </div>
    );
  }
);
PortfolioSummaryShareCard.displayName = "PortfolioSummaryShareCard";

interface PositionShareCardProps {
  marketTitle: string;
  side: "yes" | "no";
  shares: number;
  avgPrice: number;
  currentPrice: number;
  invested: number;
  currentValue: number;
  unrealizedPnl: number;
  pnlPercent: number;
  maxPayout: number;
}

export const PositionShareCard = forwardRef<HTMLDivElement, PositionShareCardProps>(
  ({ marketTitle, side, shares, avgPrice, currentPrice, invested, currentValue, unrealizedPnl, pnlPercent, maxPayout }, ref) => {
    const isProfit = unrealizedPnl >= 0;
    const isDark = document.documentElement.classList.contains("dark");

    return (
      <div
        ref={ref}
        style={{ position: "absolute", left: "-9999px", top: 0, width: 400 }}
      >
        <div
          style={{
            background: isDark
              ? "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)"
              : "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)",
            borderRadius: 20,
            padding: 24,
            fontFamily: "system-ui, -apple-system, sans-serif",
            color: isDark ? "#f1f5f9" : "#0f172a",
          }}
        >
          {/* Header with logo */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 1,
                padding: "3px 8px",
                borderRadius: 6,
                background: side === "yes" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                color: side === "yes" ? "#22c55e" : "#ef4444",
                border: `1px solid ${side === "yes" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
              }}
            >
              {side}
            </span>
            <img src={isDark ? logoDark : logoLight} alt="logo" style={{ height: 20, opacity: 0.7 }} crossOrigin="anonymous" />
          </div>

          {/* Market title */}
          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, marginBottom: 16 }}>
            {marketTitle}
          </div>

          {/* PnL highlight */}
          <div
            style={{
              background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
              borderRadius: 12,
              padding: 16,
              marginBottom: 14,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, marginBottom: 4 }}>
              Unrealized P&L
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: isProfit ? "#22c55e" : "#ef4444",
              }}
            >
              {isProfit ? "+" : "-"}${Math.abs(unrealizedPnl).toFixed(2)}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: isProfit ? "#22c55e" : "#ef4444", marginTop: 2 }}>
              {isProfit ? "+" : ""}{pnlPercent.toFixed(1)}%
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, fontSize: 11 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ opacity: 0.5, marginBottom: 2, fontSize: 9, textTransform: "uppercase" }}>Shares</div>
              <div style={{ fontWeight: 700 }}>{shares}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ opacity: 0.5, marginBottom: 2, fontSize: 9, textTransform: "uppercase" }}>Avg</div>
              <div style={{ fontWeight: 700 }}>{avgPrice}¢</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ opacity: 0.5, marginBottom: 2, fontSize: 9, textTransform: "uppercase" }}>Now</div>
              <div style={{ fontWeight: 700, color: currentPrice > avgPrice ? "#22c55e" : currentPrice < avgPrice ? "#ef4444" : undefined }}>{currentPrice}¢</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ opacity: 0.5, marginBottom: 2, fontSize: 9, textTransform: "uppercase" }}>Max Pay</div>
              <div style={{ fontWeight: 700 }}>${maxPayout.toFixed(2)}</div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              marginTop: 14,
              paddingTop: 10,
              borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`,
              fontSize: 10,
              opacity: 0.5,
              textAlign: "center",
            }}
          >
            opollmarket.lovable.app
          </div>
        </div>
      </div>
    );
  }
);
PositionShareCard.displayName = "PositionShareCard";
