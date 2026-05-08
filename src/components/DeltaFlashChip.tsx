import { useDeltaFlash } from "@/hooks/useDeltaFlash";

interface Props {
  value: number;
  /** Suffix appended after the signed number, e.g. "¢" or "%". */
  unit?: string;
  /** Override the auto-clear timeout. */
  clearMs?: number;
  /** Tailwind classes for the chip wrapper. */
  className?: string;
}

/**
 * Tiny "+2¢" / "-1¢" chip that briefly flashes whenever `value` changes,
 * then fades. Green for positive, red for negative. Reserves space when idle
 * so adjacent layout doesn't shift.
 */
export default function DeltaFlashChip({ value, unit = "", clearMs, className }: Props) {
  const delta = useDeltaFlash(value, clearMs);
  if (delta === null) {
    return <span className={`inline-block w-0 ${className ?? ""}`} aria-hidden />;
  }
  const sign = delta > 0 ? "+" : "−";
  const abs = Math.abs(Math.round(delta));
  const pos = delta > 0;
  return (
    <span
      className={`ml-1 inline-flex items-center px-1 py-0 rounded text-[9px] font-black tabular-nums leading-tight animate-fade-in transition-opacity ${
        pos ? "bg-white/20 text-white" : "bg-black/30 text-white"
      } ${className ?? ""}`}
    >
      {sign}{abs}{unit}
    </span>
  );
}
