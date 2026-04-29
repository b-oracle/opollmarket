// Full-screen Accept/Decline UI for incoming calls — the in-app equivalent
// of the native Android lockscreen IncomingCallActivity. Replaces the small
// banner when the user is already in the app and a call comes in.
import { Phone, PhoneOff } from "lucide-react";
import CallStatusBadge from "./CallStatusBadge";

interface IncomingCallScreenProps {
  callerName: string;
  callerAvatar?: string;
  onAccept: () => void;
  onDecline: () => void;
  answering?: boolean;
}

const IncomingCallScreen = ({
  callerName,
  callerAvatar,
  onAccept,
  onDecline,
  answering = false,
}: IncomingCallScreenProps) => {
  return (
    <div
      className="fixed inset-0 z-[9998] flex flex-col items-center justify-between overflow-hidden animate-fade-in"
      style={{
        background:
          "radial-gradient(ellipse at center, hsl(var(--background)) 0%, hsl(var(--background)) 70%)",
        paddingTop: "max(4rem, calc(var(--safe-top) + 2rem))",
        paddingBottom: "max(3rem, calc(var(--safe-bottom) + 2rem))",
      }}
      role="dialog"
      aria-label="Incoming call"
    >
      <div className="flex flex-col items-center gap-6">
        <CallStatusBadge variant="ringing" label="Incoming call" />
        <div className="w-32 h-32 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden ring-4 ring-primary/20 animate-pulse-glow">
          {callerAvatar ? (
            <img
              src={callerAvatar}
              alt={callerName}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-4xl font-bold text-primary">
              {callerName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <h2 className="text-2xl font-semibold text-foreground">{callerName}</h2>
      </div>

      <div className="flex items-center justify-center gap-16 w-full px-8">
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
      </div>
    </div>
  );
};

export default IncomingCallScreen;
