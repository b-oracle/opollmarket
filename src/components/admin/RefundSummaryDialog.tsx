import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle2, AlertTriangle, Wallet, Users, Coins, Ban, Sparkles } from "lucide-react";

export interface RefundSummary {
  title: string;
  marketTitle?: string;
  /** "cancelled" (full refund) | "rejected" (creation fee forfeited) | "voided" | "request" */
  variant: "cancelled" | "rejected" | "voided" | "request";
  usersRefunded?: number;
  totalRefunded?: number;
  creationFeeRefunded?: number;
  creationFeeForfeited?: number;
  liquidityRefunded?: number;
  commissionsVoided?: number;
  /** Always non-refundable per policy */
  aiGenerationFeeNonRefundable?: number;
  usersClawedBack?: number;
  totalClawedBack?: number;
  reason?: string;
}

const fmt = (n?: number) => `$${Number(n || 0).toFixed(2)}`;

const Row = ({ icon: Icon, label, value, tone = "default" }: any) => (
  <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Icon className={`w-4 h-4 ${tone === "danger" ? "text-destructive" : tone === "success" ? "text-emerald-500" : "text-primary"}`} />
      <span>{label}</span>
    </div>
    <span className={`text-sm font-semibold ${tone === "danger" ? "text-destructive" : tone === "success" ? "text-emerald-500" : ""}`}>
      {value}
    </span>
  </div>
);

const RefundSummaryDialog = ({
  open,
  onOpenChange,
  summary,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  summary: RefundSummary | null;
}) => {
  if (!summary) return null;

  const headerColor =
    summary.variant === "rejected"
      ? "text-destructive"
      : summary.variant === "voided"
      ? "text-amber-500"
      : "text-emerald-500";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${headerColor}`}>
            {summary.variant === "rejected" ? (
              <Ban className="w-5 h-5" />
            ) : summary.variant === "voided" ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
            {summary.title}
          </DialogTitle>
          {summary.marketTitle && (
            <DialogDescription className="truncate">"{summary.marketTitle}"</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-1">
          {summary.totalRefunded !== undefined && (
            <Row
              icon={Wallet}
              label="Total refunded to users"
              value={fmt(summary.totalRefunded)}
              tone="success"
            />
          )}
          {summary.usersRefunded !== undefined && (
            <Row icon={Users} label="Users refunded" value={summary.usersRefunded} />
          )}
          {summary.liquidityRefunded !== undefined && summary.liquidityRefunded > 0 && (
            <Row
              icon={Coins}
              label="Initial liquidity refunded"
              value={fmt(summary.liquidityRefunded)}
              tone="success"
            />
          )}
          {summary.creationFeeRefunded !== undefined && summary.creationFeeRefunded > 0 && (
            <Row
              icon={Wallet}
              label="Creation fee refunded"
              value={fmt(summary.creationFeeRefunded)}
              tone="success"
            />
          )}
          {summary.creationFeeForfeited !== undefined && summary.creationFeeForfeited > 0 && (
            <Row
              icon={Ban}
              label="Creation fee forfeited"
              value={fmt(summary.creationFeeForfeited)}
              tone="danger"
            />
          )}
          {summary.commissionsVoided !== undefined && summary.commissionsVoided > 0 && (
            <Row icon={Coins} label="Commissions voided" value={fmt(summary.commissionsVoided)} />
          )}
          {summary.aiGenerationFeeNonRefundable !== undefined && summary.aiGenerationFeeNonRefundable > 0 && (
            <Row
              icon={Sparkles}
              label="AI generation fee (non-refundable)"
              value={fmt(summary.aiGenerationFeeNonRefundable)}
              tone="danger"
            />
          )}
          {summary.usersClawedBack !== undefined && summary.usersClawedBack > 0 && (
            <Row
              icon={Users}
              label="Users clawed back"
              value={`${summary.usersClawedBack} · ${fmt(summary.totalClawedBack)}`}
              tone="danger"
            />
          )}
        </div>

        {summary.reason && (
          <div className="mt-3 p-3 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Reason:</span> {summary.reason}
          </div>
        )}

        <div className="mt-2 p-3 rounded-lg bg-muted/30 border border-border/60 text-[11px] leading-relaxed text-muted-foreground">
          Per platform policy, the <b>$0.50 AI generation fee</b> is always non-refundable.
          Creation fees are refunded only when an admin cancels a pending market —
          they are forfeited when a market is rejected for content violation.
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
          >
            Done
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RefundSummaryDialog;
