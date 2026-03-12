import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface PinInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  error?: boolean;
}

const PinInput = ({ length = 6, value, onChange, disabled, autoFocus = true, error }: PinInputProps) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  const handleChange = (index: number, digit: string) => {
    if (!/^\d?$/.test(digit)) return;
    const newValue = value.split("");
    newValue[index] = digit;
    const result = newValue.join("").slice(0, length);
    onChange(result);
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    onChange(pasted);
    const focusIdx = Math.min(pasted.length, length - 1);
    inputRefs.current[focusIdx]?.focus();
  };

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length }).map((_, i) => {
        const filled = !!value[i];
        return (
          <div
            key={i}
            className={cn(
              "relative w-11 h-13 rounded-lg border-2 bg-background transition-all",
              error ? "border-destructive" : "border-border",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            {/* Visual dot indicator — never shows the actual digit */}
            {filled && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-3 h-3 rounded-full bg-foreground" />
              </div>
            )}
            <input
              ref={(el) => { inputRefs.current[i] = el; }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={value[i] || ""}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={i === 0 ? handlePaste : undefined}
              disabled={disabled}
              autoComplete="off"
              className={cn(
                "w-full h-full text-center text-xl font-bold rounded-lg bg-transparent transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 caret-transparent text-transparent selection:bg-transparent",
                error ? "border-transparent" : "focus:border-primary border-transparent",
                disabled && "cursor-not-allowed"
              )}
              style={{ color: "transparent", WebkitTextSecurity: "disc" } as React.CSSProperties}
            />
          </div>
        );
      })}
    </div>
  );
};

export default PinInput;
