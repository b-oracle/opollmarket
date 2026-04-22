export interface IncomingCallPayload {
  callId: string;
  conversationId?: string;
  callerId?: string;
  callerName?: string;
  callerAvatar?: string;
  roomName?: string;
}

export interface PendingActionResult {
  action?: "accept" | "decline";
  callId?: string;
  conversationId?: string;
}

export interface OpollCallPlugin {
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  getFcmToken(): Promise<{ token?: string }>;
  getPendingAction(): Promise<PendingActionResult>;
  clearIncomingCall(): Promise<{ ok: boolean }>;
  addListener(
    eventName: "incomingCall",
    listenerFunc: (payload: IncomingCallPayload) => void,
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "callAction",
    listenerFunc: (payload: PendingActionResult) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}
