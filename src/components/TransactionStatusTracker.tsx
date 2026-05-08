import { motion } from "framer-motion";
import { Check, Loader2, Clock, AlertCircle, ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";

export type TrackerKind = "withdrawal" | "payout" | "resolve" | "deposit";

export interface TrackerStage {
  key: string;
  label: string;
  hint?: string;
  status: "done" | "active" | "pending" | "failed";
  at?: string | null;
}

interface Props {
  kind: TrackerKind;
  stages: TrackerStage[];
  txHash?: string | null;
  externalId?: string | null;
  network?: string | null;
  failed?: boolean;
  failedReason?: string | null;
  className?: string;
}

const explorerForNetwork = (net?: string | null, hash?: string | null) => {
  if (!hash) return null;
  const n = (net || "").toLowerCase();
  if (n.includes("btc")) return `https://blockstream.info/tx/${hash}`;
  if (n.includes("eth")) return `https://etherscan.io/tx/${hash}`;
  if (n.includes("bsc") || n.includes("bnb")) return `https://bscscan.com/tx/${hash}`;
  if (n.includes("trx") || n.includes("tron")) return `https://tronscan.org/#/transaction/${hash}`;
  if (n.includes("sol")) return `https://solscan.io/tx/${hash}`;
  if (n.includes("matic") || n.includes("poly")) return `https://polygonscan.com/tx/${hash}`;
  return `https://bscscan.com/tx/${hash}`;
};

const fmtTime = (iso?: string | null) => {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export default function TransactionStatusTracker({
  kind,
  stages,
  txHash,
  externalId,
  network,
  failed,
  failedReason,
  className = "",
}: Props) {
  const explorerUrl = explorerForNetwork(network, txHash);
  const headlineMap: Record<TrackerKind, string> = {
    withdrawal: "Withdrawal Progress",
    payout: "Payout Progress",
    resolve: "Resolution Progress",
    deposit: "Deposit Progress",
  };

  return (
    <div className={`rounded-xl border border-border/40 bg-muted/20 p-3 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {headlineMap[kind]}
        </p>
        {failed ? (
          <span className="text-[10px] font-bold text-destructive flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Failed
          </span>
        ) : stages.every((s) => s.status === "done") ? (
          <span className="text-[10px] font-bold text-green-500 flex items-center gap-1">
            <Check className="w-3 h-3" /> Confirmed
          </span>
        ) : (
          <span className="text-[10px] font-bold text-yellow-500 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> In progress
          </span>
        )}
      </div>

      <ol className="relative">
        {stages.map((s, i) => {
          const isLast = i === stages.length - 1;
          const isFailed = s.status === "failed";
          const isDone = s.status === "done";
          const isActive = s.status === "active";
          return (
            <li key={s.key} className="flex gap-3 pb-3 last:pb-0 relative">
              {!isLast && (
                <div
                  className={`absolute left-[11px] top-6 bottom-0 w-px ${
                    isDone ? "bg-green-500/50" : "bg-border/50"
                  }`}
                />
              )}
              <div className="relative shrink-0 z-10">
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className={`w-[22px] h-[22px] rounded-full flex items-center justify-center ring-2 ring-background ${
                    isFailed
                      ? "bg-destructive text-destructive-foreground"
                      : isDone
                      ? "bg-green-500 text-white"
                      : isActive
                      ? "bg-yellow-500/20 text-yellow-500"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isFailed ? (
                    <AlertCircle className="w-3 h-3" />
                  ) : isDone ? (
                    <Check className="w-3 h-3" />
                  ) : isActive ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Clock className="w-3 h-3" />
                  )}
                </motion.div>
              </div>
              <div className="flex-1 min-w-0 -mt-0.5">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={`text-xs font-semibold ${
                      isFailed
                        ? "text-destructive"
                        : isDone
                        ? "text-foreground"
                        : isActive
                        ? "text-yellow-500"
                        : "text-muted-foreground"
                    }`}
                  >
                    {s.label}
                  </p>
                  {s.at && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {fmtTime(s.at)}
                    </span>
                  )}
                </div>
                {s.hint && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{s.hint}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {failed && failedReason && (
        <div className="mt-2 rounded-lg bg-destructive/10 border border-destructive/30 px-2.5 py-1.5">
          <p className="text-[10px] text-destructive">{failedReason}</p>
        </div>
      )}

      {(txHash || externalId) && (
        <div className="mt-3 pt-3 border-t border-border/30 space-y-1.5">
          {txHash && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground shrink-0">On-chain Tx</span>
              <div className="flex items-center gap-1 min-w-0">
                <span className="font-mono text-[10px] text-muted-foreground truncate">{txHash}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(txHash);
                    toast.success("Tx hash copied");
                  }}
                  className="shrink-0 p-0.5 rounded hover:bg-muted/50"
                >
                  <Copy className="w-3 h-3 text-muted-foreground" />
                </button>
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 p-0.5 rounded hover:bg-muted/50"
                  >
                    <ExternalLink className="w-3 h-3 text-primary" />
                  </a>
                )}
              </div>
            </div>
          )}
          {externalId && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground shrink-0">Reference</span>
              <div className="flex items-center gap-1 min-w-0">
                <span className="font-mono text-[10px] text-muted-foreground truncate">{externalId}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(externalId);
                    toast.success("Reference copied");
                  }}
                  className="shrink-0 p-0.5 rounded hover:bg-muted/50"
                >
                  <Copy className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Helper builders ---------------------------------------------------------

export function buildWithdrawalStages(tx: {
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  tx_hash?: string | null;
  nowpayments_id?: string | null;
}): TrackerStage[] {
  const status = (tx.status || "").toLowerCase();
  const failed = status === "failed" || status === "rejected" || status === "cancelled";
  const confirmed = status === "confirmed" || status === "completed" || status === "sent" || status === "finished";
  const broadcast = !!tx.tx_hash;
  const processing =
    status === "processing" ||
    status === "approved" ||
    status === "in_progress" ||
    !!tx.nowpayments_id;

  const submittedAt = tx.created_at || null;
  const updatedAt = tx.updated_at || submittedAt;

  const stages: TrackerStage[] = [
    {
      key: "submitted",
      label: "Request submitted",
      hint: "Your withdrawal request was received",
      status: "done",
      at: submittedAt,
    },
    {
      key: "review",
      label: failed ? "Review failed" : confirmed || processing || broadcast ? "Reviewed & approved" : "Awaiting review",
      hint: failed
        ? "Request did not pass review"
        : confirmed || processing || broadcast
        ? "Approved by automated checks"
        : "Compliance & balance checks running",
      status: failed ? "failed" : confirmed || processing || broadcast ? "done" : "active",
      at: failed || confirmed || processing || broadcast ? updatedAt : null,
    },
    {
      key: "broadcast",
      label: broadcast ? "Broadcast on-chain" : confirmed ? "Sent" : "Awaiting broadcast",
      hint: broadcast
        ? "Transaction submitted to the network"
        : confirmed
        ? "Funds transferred to your wallet"
        : "Preparing on-chain transfer",
      status: failed && !broadcast ? "pending" : broadcast || confirmed ? "done" : processing ? "active" : "pending",
      at: broadcast || confirmed ? updatedAt : null,
    },
    {
      key: "confirmed",
      label: confirmed ? "Confirmed" : "Awaiting confirmations",
      hint: confirmed ? "Funds available in your wallet" : "Network confirmations in progress",
      status: failed ? "pending" : confirmed ? "done" : broadcast ? "active" : "pending",
      at: confirmed ? updatedAt : null,
    },
  ];

  return stages;
}

export function buildPayoutStages(tx: {
  status?: string | null;
  created_at?: string | null;
  type?: string | null;
}, market?: {
  resolved_at?: string | null;
  status?: string | null;
}): TrackerStage[] {
  const status = (tx.status || "").toLowerCase();
  const failed = status === "failed" || status === "reversed";
  const credited = status === "confirmed" || status === "completed";
  const resolvedAt = market?.resolved_at || null;
  const settledAt = tx.created_at || null;

  return [
    {
      key: "resolved",
      label: resolvedAt ? "Market resolved" : "Resolving",
      hint: resolvedAt ? "Outcome verified" : "Verifying outcome",
      status: resolvedAt ? "done" : "active",
      at: resolvedAt,
    },
    {
      key: "settled",
      label: credited || settledAt ? "Payout calculated" : "Calculating payouts",
      hint: "Winning shares converted to balance",
      status: failed ? "failed" : credited ? "done" : settledAt ? "active" : "pending",
      at: settledAt,
    },
    {
      key: "credited",
      label: credited ? "Credited to balance" : "Crediting balance",
      hint: credited ? "Funds available to trade or withdraw" : "Updating wallet balance",
      status: failed ? "pending" : credited ? "done" : "active",
      at: credited ? settledAt : null,
    },
  ];
}

export function buildResolveStages(market: {
  status?: string | null;
  resolved_at?: string | null;
  end_date?: string | null;
}): TrackerStage[] {
  const status = (market.status || "").toLowerCase();
  const resolved = !!market.resolved_at || status === "resolved";
  const endedAt = market.end_date || null;
  const ended = endedAt ? new Date(endedAt).getTime() <= Date.now() : status !== "active";

  return [
    {
      key: "ended",
      label: ended ? "Market ended" : "Market open",
      status: ended ? "done" : "active",
      at: endedAt,
    },
    {
      key: "verifying",
      label: resolved ? "Outcome verified" : "Verifying outcome",
      hint: resolved ? undefined : "Awaiting source data / admin review",
      status: resolved ? "done" : ended ? "active" : "pending",
      at: market.resolved_at,
    },
    {
      key: "payouts",
      label: resolved ? "Payouts distributed" : "Payouts pending",
      hint: resolved ? "Winners credited to wallet" : "Will run automatically after resolution",
      status: resolved ? "done" : "pending",
      at: market.resolved_at,
    },
  ];
}
