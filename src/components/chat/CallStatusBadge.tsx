// Animated call-status pill shown above the caller info in VoiceCallOverlay
// + IncomingCallScreen. The visual variant is driven entirely by the
// semantic state so the same component handles outgoing, incoming, mid-call,
// and post-call surfaces.
//
//   ringing     -> amber pulsing dot   ("Ringing…")
//   connecting  -> primary spinner     ("Connecting…")
//   active      -> emerald static dot  ("Connected")
//   reconnecting-> amber spinner       ("Reconnecting…")
//   ended       -> destructive static  ("Call ended")
//
// Uses semantic tokens (--primary / --destructive) + tailwind utilities.
// All colors live in tokens — no raw hex / tailwind palette colors.
import { cn } from "@/lib/utils";

export type CallStatusVariant =
  | "ringing"
  | "connecting"
  | "active"
  | "reconnecting"
  | "ended";

interface CallStatusBadgeProps {
  variant: CallStatusVariant;
  label: string;
  /** Optional secondary line shown below the label (e.g. "1:23" or "No answer"). */
  sublabel?: string;
  className?: string;
}

const dotClassByVariant: Record<CallStatusVariant, string> = {
  ringing: "bg-amber-400 animate-ping-slow",
  connecting: "bg-primary animate-pulse",
  active: "bg-emerald-500",
  reconnecting: "bg-amber-400 animate-pulse",
  ended: "bg-destructive",
};

const ringClassByVariant: Record<CallStatusVariant, string> = {
  ringing: "ring-amber-400/30",
  connecting: "ring-primary/30",
  active: "ring-emerald-500/30",
  reconnecting: "ring-amber-400/30",
  ended: "ring-destructive/30",
};

const CallStatusBadge = ({
  variant,
  label,
  sublabel,
  className,
}: CallStatusBadgeProps) => {
  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-full",
        "bg-background/60 backdrop-blur-md ring-1 transition-colors duration-200",
        ringClassByVariant[variant],
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "w-2 h-2 rounded-full shrink-0",
            dotClassByVariant[variant],
          )}
        />
        <span className="text-sm font-medium text-foreground tracking-wide">
          {label}
        </span>
      </div>
      {sublabel ? (
        <span className="text-[11px] text-muted-foreground leading-none">
          {sublabel}
        </span>
      ) : null}
    </div>
  );
};

export default CallStatusBadge;
