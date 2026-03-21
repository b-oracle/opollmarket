import { useState, useEffect, useMemo, useCallback } from "react";
import { Country, State, City, ICountry, IState, ICity } from "country-state-city";
import { MapPin, ChevronDown, X, Search } from "lucide-react";

interface LocationPickerProps {
  value: string;
  onChange: (value: string) => void;
}

interface DropdownItem {
  key: string;
  label: string;
}

const VISIBLE_LIMIT = 50;

const LocationPicker = ({ value, onChange }: LocationPickerProps) => {
  const allCountries = useMemo(() => Country.getAllCountries(), []);

  const [selectedCountry, setSelectedCountry] = useState<ICountry | null>(null);
  const [selectedState, setSelectedState] = useState<IState | null>(null);
  const [selectedCity, setSelectedCity] = useState<ICity | null>(null);
  const [openDropdown, setOpenDropdown] = useState<"country" | "state" | "city" | null>(null);
  const [search, setSearch] = useState("");

  // Parse initial value on mount only
  useEffect(() => {
    if (!value) return;
    const parts = value.split(",").map((s) => s.trim());
    if (parts.length >= 1) {
      const country = allCountries.find(
        (c) => c.name.toLowerCase() === parts[parts.length - 1]?.toLowerCase()
      );
      if (country) {
        setSelectedCountry(country);
        if (parts.length >= 2) {
          const sts = State.getStatesOfCountry(country.isoCode);
          const st = sts.find(
            (s) => s.name.toLowerCase() === parts[parts.length - 2]?.toLowerCase()
          );
          if (st) {
            setSelectedState(st);
            if (parts.length >= 3) {
              const cts = City.getCitiesOfState(country.isoCode, st.isoCode);
              const ct = cts.find(
                (c) => c.name.toLowerCase() === parts[0]?.toLowerCase()
              );
              if (ct) setSelectedCity(ct);
            }
          }
        }
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const states = useMemo(
    () => (selectedCountry ? State.getStatesOfCountry(selectedCountry.isoCode) : []),
    [selectedCountry]
  );

  const cities = useMemo(
    () =>
      selectedCountry && selectedState
        ? City.getCitiesOfState(selectedCountry.isoCode, selectedState.isoCode)
        : [],
    [selectedCountry, selectedState]
  );

  const buildLocationString = useCallback(
    (country: ICountry | null, state: IState | null, city: ICity | null) => {
      const parts: string[] = [];
      if (city) parts.push(city.name);
      if (state) parts.push(state.name);
      if (country) parts.push(country.name);
      return parts.join(", ");
    },
    []
  );

  const handleCountrySelect = useCallback(
    (isoCode: string) => {
      const country = allCountries.find((c) => c.isoCode === isoCode);
      if (!country) return;
      setSelectedCountry(country);
      setSelectedState(null);
      setSelectedCity(null);
      setOpenDropdown(null);
      setSearch("");
      onChange(buildLocationString(country, null, null));
    },
    [allCountries, onChange, buildLocationString]
  );

  const handleStateSelect = useCallback(
    (isoCode: string) => {
      const state = states.find((s) => s.isoCode === isoCode);
      if (!state) return;
      setSelectedState(state);
      setSelectedCity(null);
      setOpenDropdown(null);
      setSearch("");
      onChange(buildLocationString(selectedCountry, state, null));
    },
    [states, selectedCountry, onChange, buildLocationString]
  );

  const handleCitySelect = useCallback(
    (name: string) => {
      const city = cities.find((c) => c.name === name);
      if (!city) return;
      setSelectedCity(city);
      setOpenDropdown(null);
      setSearch("");
      onChange(buildLocationString(selectedCountry, selectedState, city));
    },
    [cities, selectedCountry, selectedState, onChange, buildLocationString]
  );

  const handleClear = useCallback(() => {
    setSelectedCountry(null);
    setSelectedState(null);
    setSelectedCity(null);
    setOpenDropdown(null);
    onChange("");
  }, [onChange]);

  // Build lightweight dropdown items — no object spreading
  const countryItems: DropdownItem[] = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    const source = search
      ? allCountries.filter((c) => c.name.toLowerCase().includes(lowerSearch))
      : allCountries;
    return source.slice(0, VISIBLE_LIMIT).map((c) => ({
      key: c.isoCode,
      label: `${c.flag} ${c.name}`,
    }));
  }, [search, allCountries]);

  const stateItems: DropdownItem[] = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    const source = search
      ? states.filter((s) => s.name.toLowerCase().includes(lowerSearch))
      : states;
    return source.slice(0, VISIBLE_LIMIT).map((s) => ({
      key: s.isoCode,
      label: s.name,
    }));
  }, [search, states]);

  const cityItems: DropdownItem[] = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    const source = search
      ? cities.filter((c) => c.name.toLowerCase().includes(lowerSearch))
      : cities;
    return source.slice(0, VISIBLE_LIMIT).map((c) => ({
      key: c.name,
      label: c.name,
    }));
  }, [search, cities]);

  const renderDropdown = (items: DropdownItem[], onSelect: (key: string) => void) => (
    <div className="absolute left-0 right-0 top-full mt-1 z-[70] bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
      <div className="sticky top-0 bg-card p-2 border-b border-border">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 border border-border">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full text-xs bg-transparent text-foreground placeholder:text-muted-foreground outline-none"
            autoFocus
          />
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">No results</p>
      ) : (
        items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            className="w-full text-left px-3 py-2 text-xs hover:bg-accent/50 transition-colors truncate"
          >
            {item.label}
          </button>
        ))
      )}
    </div>
  );

  return (
    <div className="space-y-2">
      {value && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 text-sm">
          <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="flex-1 truncate text-foreground">{value}</span>
          <button type="button" onClick={handleClear} className="text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Country */}
      <div className="relative">
        <button
          type="button"
          onClick={() => { setOpenDropdown(openDropdown === "country" ? null : "country"); setSearch(""); }}
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-1 focus:ring-primary/50"
        >
          <span className={selectedCountry ? "text-foreground" : "text-muted-foreground"}>
            {selectedCountry ? `${selectedCountry.flag} ${selectedCountry.name}` : "Select country"}
          </span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${openDropdown === "country" ? "rotate-180" : ""}`} />
        </button>
        {openDropdown === "country" && renderDropdown(countryItems, handleCountrySelect)}
      </div>

      {/* State */}
      {selectedCountry && states.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => { setOpenDropdown(openDropdown === "state" ? null : "state"); setSearch(""); }}
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            <span className={selectedState ? "text-foreground" : "text-muted-foreground"}>
              {selectedState ? selectedState.name : "Select state / region"}
            </span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${openDropdown === "state" ? "rotate-180" : ""}`} />
          </button>
          {openDropdown === "state" && renderDropdown(stateItems, handleStateSelect)}
        </div>
      )}

      {/* City */}
      {selectedState && cities.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => { setOpenDropdown(openDropdown === "city" ? null : "city"); setSearch(""); }}
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            <span className={selectedCity ? "text-foreground" : "text-muted-foreground"}>
              {selectedCity ? selectedCity.name : "Select city"}
            </span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${openDropdown === "city" ? "rotate-180" : ""}`} />
          </button>
          {openDropdown === "city" && renderDropdown(cityItems, handleCitySelect)}
        </div>
      )}
    </div>
  );
};

export default LocationPicker;
