import { useEffect, useState } from "react";
import { Bug, X, Trash2 } from "lucide-react";
import {
  CallLifecycleEntry,
  clearCallLifecycleEntries,
  isCallDebugEnabled,
  subscribeCallLifecycle,
} from "@/lib/callLifecycleLog";

interface CallDebugOverlayProps {
  callId: string;
}

const stageColor = (level: CallLifecycleEntry["level"]) => {
  if (level === "error") return "text-red-400";
  if (level === "warn") return "text-amber-300";
  return "text-emerald-300";
};

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}.${d
    .getMilliseconds()
    .toString()
    .padStart(3, "0")}`;
};

const CallDebugOverlay = ({ callId }: CallDebugOverlayProps) => {
  const [enabled] = useState(isCallDebugEnabled());
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<CallLifecycleEntry[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const unsub = subscribeCallLifecycle((all) => {
      setEntries(all.filter((e) => e.callId === callId).slice(-100));
    });
    return unsub;
  }, [enabled, callId]);

  if (!enabled) return null;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed top-3 right-3 z-[10001] w-9 h-9 rounded-full bg-black/70 text-white flex items-center justify-center backdrop-blur border border-white/10 active:scale-95"
        aria-label="Toggle call debug overlay"
      >
        <Bug className="w-4 h-4" />
        {entries.some((e) => e.level === "error") && (
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 border border-black" />
        )}
      </button>

      {open && (
        <div className="fixed inset-x-2 bottom-2 top-16 z-[10000] bg-black/85 text-white text-xs font-mono rounded-lg border border-white/10 shadow-2xl flex flex-col backdrop-blur-md">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Bug className="w-3.5 h-3.5" />
              <span className="font-semibold">Call lifecycle</span>
              <span className="text-white/50">{callId.slice(0, 8)}</span>
              <span className="text-white/40">· {entries.length} events</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => clearCallLifecycleEntries(callId)}
                className="p-1.5 hover:bg-white/10 rounded"
                aria-label="Clear log"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 hover:bg-white/10 rounded"
                aria-label="Close debug overlay"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {entries.length === 0 ? (
              <div className="text-white/40 text-center py-6">
                Waiting for lifecycle events…
              </div>
            ) : (
              entries
                .slice()
                .reverse()
                .map((e) => (
                  <div
                    key={e.id}
                    className="px-2 py-1.5 rounded bg-white/5 border border-white/5"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`font-semibold ${stageColor(e.level)}`}>
                        {e.stage}
                      </span>
                      <span className="text-white/40 text-[10px]">
                        {formatTime(e.ts)}
                      </span>
                    </div>
                    {e.status && (
                      <div className="text-white/60">status: {e.status}</div>
                    )}
                    {e.message && (
                      <div className="text-white/80 break-words">{e.message}</div>
                    )}
                    {e.data && Object.keys(e.data).length > 0 && (
                      <pre className="text-white/50 text-[10px] whitespace-pre-wrap break-words mt-0.5">
                        {JSON.stringify(e.data, null, 0)}
                      </pre>
                    )}
                  </div>
                ))
            )}
          </div>
          <div className="px-3 py-2 border-t border-white/10 text-[10px] text-white/40">
            Toggle off via <code>localStorage.removeItem("call-lifecycle-debug")</code>
          </div>
        </div>
      )}
    </>
  );
};

export default CallDebugOverlay;
