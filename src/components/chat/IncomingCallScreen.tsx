// Full-screen Accept/Decline UI for incoming calls — the in-app equivalent
// of the native Android lockscreen IncomingCallActivity. Thin wrapper around
// the shared CallStatusScreen so incoming/outgoing/connected/ended all share
// the same visual language.
import CallStatusScreen from "./CallStatusScreen";

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
}: IncomingCallScreenProps) => (
  <CallStatusScreen
    view="ringing"
    direction="incoming"
    otherName={callerName}
    otherAvatar={callerAvatar}
    onAccept={onAccept}
    onDecline={onDecline}
    answering={answering}
  />
);

export default IncomingCallScreen;
