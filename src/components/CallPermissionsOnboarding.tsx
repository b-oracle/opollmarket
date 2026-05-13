// CallPermissionsOnboarding — modal walkthrough that verifies every Android
// 14+ toggle required for swipe-to-answer lockscreen calls BEFORE the user
// makes their first test call. Auto-shown once per install on native Android
// when at least one required permission is missing. Skipped on web/iOS.
//
// Steps shown only when needed; if every check returns "granted" we unmount
// silently and persist the completion flag.

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, AlertTriangle, Phone, Bell, Battery, BellRing, X } from "lucide-react";
import {
  checkCallPermissions,
  requestNotificationsPermission,
  openFullScreenIntentSettings,
  openBatteryOptimizationSettings,
  openChannelSettings,
  isNativeAndroid,
  type CallPermissionsState,
  type PermissionStatus,
} from "@/lib/callPermissions";
import { Button } from "@/components/ui/button";

const COMPLETED_KEY = "call_perms_onboarded_v1";
const SKIP_UNTIL_KEY = "call_perms_skip_until_v1";

interface Step {
  id: keyof Pick<CallPermissionsState, "notifications" | "fullScreenIntent" | "batteryOptimization" | "channelImportance">;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  cta: string;
  action: () => Promise<unknown>;
  required: boolean;
  minSdk?: number;
}

const STEPS: Step[] = [
  {
    id: "notifications",
    icon: Bell,
    title: "Allow notifications",
    description: "We need permission to ring your phone when someone calls you.",
    cta: "Allow notifications",
    action: requestNotificationsPermission,
    required: true,
  },
  {
    id: "fullScreenIntent",
    icon: Phone,
    title: "Show calls on the lock screen",
    description:
      "Android 14 needs explicit permission to display the swipe-to-answer screen over the lock screen. Toggle “Allow full-screen notifications” ON.",
    cta: "Open settings",
    action: openFullScreenIntentSettings,
    required: true,
    minSdk: 34,
  },
  {
    id: "channelImportance",
    icon: BellRing,
    title: "Use the call ringtone",
    description:
      "If notification sound is muted for the Incoming Calls channel, the ringtone won’t play. Set the channel to Urgent / Sound + Pop-up.",
    cta: "Open channel settings",
    action: openChannelSettings,
    required: false,
  },
  {
    id: "batteryOptimization",
    icon: Battery,
    title: "Keep the app awake for calls",
    description:
      "Battery optimization can stop incoming-call pushes from reaching you. Allow opollmarket to run in the background.",
    cta: "Disable optimization",
    action: openBatteryOptimizationSettings,
    required: false,
  },
];

const labelFor = (s: PermissionStatus) =>
  s === "granted" ? "Enabled" : s === "denied" ? "Action needed" : "Not applicable";

export default function CallPermissionsOnboarding() {
  const [state, setState] = useState<CallPermissionsState | null>(null);
  const [open, setOpen] = useState(false);
  const [busyStep, setBusyStep] = useState<string | null>(null);

  const refresh = async () => {
    const next = await checkCallPermissions();
    setState(next);
    return next;
  };

  // Initial gate: only consider showing on native Android, when not completed
  // and not skipped within the cooldown window.
  useEffect(() => {
    if (!isNativeAndroid()) return;
    if (localStorage.getItem(COMPLETED_KEY) === "1") return;
    const skipUntil = Number(localStorage.getItem(SKIP_UNTIL_KEY) || 0);
    if (skipUntil > Date.now()) return;

    let cancelled = false;
    (async () => {
      const next = await refresh();
      if (cancelled) return;
      const missing = STEPS.some(
        (s) =>
          s.required &&
          (s.minSdk ? next.sdkInt >= s.minSdk : true) &&
          next[s.id] === "denied",
      );
      if (missing) setOpen(true);
      else localStorage.setItem(COMPLETED_KEY, "1");
    })();
    return () => { cancelled = true; };
  }, []);

  // Re-check whenever the app returns to foreground (user came back from Settings).
  useEffect(() => {
    if (!open) return;
    const onVis = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [open]);

  const visibleSteps = useMemo(() => {
    if (!state) return [];
    return STEPS.filter((s) => !s.minSdk || state.sdkInt >= s.minSdk);
  }, [state]);

  const allRequiredGranted = useMemo(
    () => state ? visibleSteps.every((s) => !s.required || state[s.id] === "granted") : false,
    [state, visibleSteps],
  );

  const finish = () => {
    localStorage.setItem(COMPLETED_KEY, "1");
    setOpen(false);
  };

  const skip = () => {
    // Snooze for 24h so we don't badger the user.
    localStorage.setItem(SKIP_UNTIL_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
    setOpen(false);
  };

  const runStep = async (s: Step) => {
    setBusyStep(s.id);
    try {
      await s.action();
      // Some actions (notifications) resolve synchronously; settings actions
      // resolve immediately and we re-check on focus return.
      await refresh();
    } finally {
      setBusyStep(null);
    }
  };

  if (!open || !state) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div
        className="relative w-full max-w-md rounded-t-3xl bg-background p-6 shadow-2xl sm:rounded-3xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" }}
      >
        <button
          onClick={skip}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-2xl bg-primary/15 p-2.5">
            <Phone className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold leading-tight">Set up incoming calls</h2>
            <p className="text-xs text-muted-foreground">
              A few quick toggles so calls ring on your lock screen.
            </p>
          </div>
        </div>

        <ul className="space-y-3">
          {visibleSteps.map((step) => {
            const status = state[step.id];
            const granted = status === "granted";
            const Icon = step.icon;
            return (
              <li
                key={step.id}
                className={`rounded-2xl border p-3 transition-colors ${
                  granted ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-muted/30"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {granted ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : step.required ? (
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">{step.title}</span>
                      {!step.required && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span
                        className={`text-[11px] font-medium ${
                          granted ? "text-emerald-500" : "text-amber-500"
                        }`}
                      >
                        {labelFor(status)}
                      </span>
                      {!granted && (
                        <Button
                          size="sm"
                          variant={step.required ? "default" : "secondary"}
                          disabled={busyStep === step.id}
                          onClick={() => runStep(step)}
                        >
                          {busyStep === step.id ? "Opening…" : step.cta}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex flex-col gap-2">
          <Button
            onClick={finish}
            disabled={!allRequiredGranted}
            className="h-11 w-full rounded-xl text-sm font-semibold"
          >
            {allRequiredGranted ? "Done — I'm ready for calls" : "Finish required steps to continue"}
          </Button>
          <button
            onClick={skip}
            className="text-center text-xs text-muted-foreground hover:text-foreground"
          >
            Remind me later
          </button>
        </div>
      </div>
    </div>
  );
}
