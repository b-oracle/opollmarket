// Dedicated full-screen call status screen with three explicit views:
//
//   - "ringing"   → outgoing "Calling…" or incoming "Incoming call" with
//                   pulsing avatar + Accept/Decline (incoming) or Cancel
//                   (outgoing) controls.
//   - "connected" → live state with running duration, connection quality
//                   sublabel, and an End button.
//   - "ended"     → terminal state: shows reason ("No answer", "Declined",
//                   "Call ended"…) + final duration, persists for ~2.5s
//                   before the parent dismisses it.
//
// This component is intentionally *presentational* — it renders the right
// surface for the given state and forwards button taps to the parent.
// All call/LiveKit/edge-function logic stays in IncomingCallBanner +
// VoiceCallOverlay.
import { Phone, PhoneOff } from "lucide-react";
import CallStatusBadge, { type CallStatusVariant } from "./CallStatusBadge";
import { cn, getAvatarInitials } from "@/lib/utils";

export type CallScreenView = "ringing" | "connected" | "ended";

export type CallEndReason =
  | "user_end"
  | "user_cancel"
  | "no_answer"
  | "declined"
  | "missed"
  | "remote_end"
  | "failed";

interface CallStatusScreenProps {
  view: CallScreenView;
  /** Whether this is an outgoing or incoming call. Drives the ringing copy
   *  and which controls are shown. */
  direction: "incoming" | "outgoing";
  otherName: string;
  otherAvatar?: string;
  /** Live elapsed seconds — only used when view === "connected". */
  durationSeconds?: number;
  /** Final elapsed seconds — only used when view === "ended". */
  finalDurationSeconds?: number;
  /** Reason the call ended — only used when view === "ended". */
  endReason?: CallEndReason | null;
  /** Sublabel override for the connected state (e.g. "Reconnecting…"). */
  connectedSublabel?: string;
  /** Connected variant override — e.g. "reconnecting" while we wait. */
  connectedVariant?: Extract<CallStatusVariant, "active" | "reconnecting">;

  // Action handlers — only the relevant ones are rendered per view.
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
  onEnd?: () => void;

  /** Disable accept while we exchange the LiveKit token. */
  answering?: boolean;
  className?: string;
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const endReasonLabel: Record<CallEndReason, string> = {
  user_end: "Call ended",
  user_cancel: "Call cancelled",
  no_answer: "No answer",
  declined: "Call declined",
  missed: "Missed call",
  remote_end: "Call ended",
  failed: "Call failed",
};

const CallStatusScreen = ({
  view,
  direction,
  otherName,
  otherAvatar,
  durationSeconds = 0,
  finalDurationSeconds,
  endReason,
  connectedSublabel,
  connectedVariant = "active",
  onAccept,
  onDecline,
  onCancel,
  onEnd,
  answering = false,
  className,
}: CallStatusScreenProps) => {
  // Derive the badge spec for this view.
  let badge: { variant: CallStatusVariant; label: string; sublabel?: string };
  if (view === "ended") {
    const label = endReason ? endReasonLabel[endReason] : "Call ended";
    const sublabel =
      finalDurationSeconds && finalDurationSeconds > 0
        ? formatTime(finalDurationSeconds)
        : undefined;
    badge = { variant: "ended", label, sublabel };
  } else if (view === "connected") {
    badge = {
      variant: connectedVariant,
      label: connectedVariant === "reconnecting" ? "Reconnecting…" : "Connected",
      sublabel: connectedSublabel ?? formatTime(durationSeconds),
    };
  } else {
    badge = {
      variant: "ringing",
      label:
        direction === "outgoing"
          ? "Calling…"
          : "Incoming call",
    };
  }

  const showAccept = view === "ringing" && direction === "incoming";
  const showDecline = view === "ringing" && direction === "incoming";
  const showCancel = view === "ringing" && direction === "outgoing";
  const showEnd = view === "connected";

  return (
    <div
      className={cn(
        "fixed inset-0 z-[9998] flex flex-col items-center justify-between overflow-hidden animate-fade-in",
        className,
      )}
      style={{
        background:
          "radial-gradient(ellipse at center, hsl(var(--background)) 0%, hsl(var(--background)) 70%)",
        paddingTop: "max(4rem, calc(var(--safe-top) + 2rem))",
        paddingBottom: "max(3rem, calc(var(--safe-bottom) + 2rem))",
      }}
      role="dialog"
      aria-label={`Call ${view}`}
    >
      <div className="flex flex-col items-center gap-6">
        <CallStatusBadge
          variant={badge.variant}
          label={badge.label}
          sublabel={badge.sublabel}
        />

        <div
          className={cn(
            "w-32 h-32 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden ring-4",
            view === "ringing" && "ring-primary/20 animate-pulse-glow",
            view === "connected" && "ring-emerald-500/30",
            view === "ended" && "ring-destructive/30 opacity-80",
          )}
        >
          {otherAvatar ? (
            <img
              src={otherAvatar}
              alt={otherName}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-4xl font-bold text-primary">
              {getAvatarInitials(otherName)}
            </span>
          )}
        </div>

        <h2 className="text-2xl font-semibold text-foreground">{otherName || "Unknown"}</h2>

        {view === "connected" && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatTime(durationSeconds)}
          </span>
        )}
      </div>

      {/* Action row — varies per view. The "ended" view intentionally has
          no actions; the parent auto-dismisses after a brief hold. */}
      <div className="flex items-center justify-center gap-16 w-full px-8 min-h-[5rem]">
        {showDecline && (
          <button
            onClick={onDecline}
            className="flex flex-col items-center gap-2 active:scale-95 transition-transform"
            aria-label="Decline call"
          >
            <span className="w-16 h-16 rounded-full bg-destructive flex items-center justify-center shadow-lg">
              <PhoneOff className="w-7 h-7 text-destructive-foreground" />
            </span>
            <span className="text-xs text-muted-foreground">Decline</span>
          </button>
        )}

        {showAccept && (
          <button
            onClick={onAccept}
            disabled={answering}
            className="flex flex-col items-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
            aria-label="Accept call"
          >
            <span className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
              <Phone className="w-7 h-7 text-white" />
            </span>
            <span className="text-xs text-muted-foreground">
              {answering ? "Answering…" : "Accept"}
            </span>
          </button>
        )}

        {showCancel && (
          <button
            onClick={onCancel}
            className="flex flex-col items-center gap-2 active:scale-95 transition-transform"
            aria-label="Cancel call"
          >
            <span className="w-16 h-16 rounded-full bg-destructive flex items-center justify-center shadow-lg">
              <PhoneOff className="w-7 h-7 text-destructive-foreground" />
            </span>
            <span className="text-xs text-muted-foreground">Cancel</span>
          </button>
        )}

        {showEnd && (
          <button
            onClick={onEnd}
            className="flex flex-col items-center gap-2 active:scale-95 transition-transform"
            aria-label="End call"
          >
            <span className="w-16 h-16 rounded-full bg-destructive flex items-center justify-center shadow-lg">
              <PhoneOff className="w-7 h-7 text-destructive-foreground" />
            </span>
            <span className="text-xs text-muted-foreground">End</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default CallStatusScreen;
