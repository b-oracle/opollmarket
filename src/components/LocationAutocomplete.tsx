import { useState, useRef, useEffect } from "react";
import { MapPin, X } from "lucide-react";
import { LOCATIONS } from "@/data/locations";

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
}

const LocationAutocomplete = ({ value, onChange }: LocationAutocompleteProps) => {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const suggestions = inputValue.trim().length >= 2
    ? LOCATIONS.filter((loc) => loc.toLowerCase().includes(inputValue.toLowerCase())).slice(0, 8)
    : [];

  const handleSelect = (loc: string) => {
    setInputValue(loc);
    onChange(loc);
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setOpen(true);
  };

  const handleClear = () => {
    setInputValue("");
    onChange("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => inputValue.trim().length >= 2 && setOpen(true)}
        onBlur={() => {
          // commit typed value on blur
          if (inputValue !== value) onChange(inputValue);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Search city or country…"
        className="w-full rounded-lg border border-border bg-muted/30 pl-9 pr-9 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
      />
      {inputValue && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Clear location"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
          {suggestions.map((loc) => (
            <button
              key={loc}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(loc)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-popover-foreground hover:bg-accent transition-colors text-left"
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span>{loc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LocationAutocomplete;
