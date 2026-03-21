import { useState, useEffect, useMemo } from "react";
import { Country, State, City, ICountry, IState, ICity } from "country-state-city";
import { MapPin, ChevronDown, X, Search } from "lucide-react";

interface LocationPickerProps {
  value: string;
  onChange: (value: string) => void;
}

const LocationPicker = ({ value, onChange }: LocationPickerProps) => {
  const allCountries = useMemo(() => Country.getAllCountries(), []);

  // Parse existing value like "Lagos, Nigeria" or "California, United States"
  const [selectedCountry, setSelectedCountry] = useState<ICountry | null>(null);
  const [selectedState, setSelectedState] = useState<IState | null>(null);
  const [selectedCity, setSelectedCity] = useState<ICity | null>(null);
  const [openDropdown, setOpenDropdown] = useState<"country" | "state" | "city" | null>(null);
  const [search, setSearch] = useState("");

  // Parse initial value on mount
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
          const states = State.getStatesOfCountry(country.isoCode);
          const state = states.find(
            (s) => s.name.toLowerCase() === parts[parts.length - 2]?.toLowerCase()
          );
          if (state) {
            setSelectedState(state);
            if (parts.length >= 3) {
              const cities = City.getCitiesOfState(country.isoCode, state.isoCode);
              const city = cities.find(
                (c) => c.name.toLowerCase() === parts[0]?.toLowerCase()
              );
              if (city) setSelectedCity(city);
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

  const buildLocationString = (
    country: ICountry | null,
    state: IState | null,
    city: ICity | null
  ) => {
    const parts: string[] = [];
    if (city) parts.push(city.name);
    if (state) parts.push(state.name);
    if (country) parts.push(country.name);
    return parts.join(", ");
  };

  const handleCountrySelect = (country: ICountry) => {
    setSelectedCountry(country);
    setSelectedState(null);
    setSelectedCity(null);
    setOpenDropdown(null);
    setSearch("");
    onChange(buildLocationString(country, null, null));
  };

  const handleStateSelect = (state: IState) => {
    setSelectedState(state);
    setSelectedCity(null);
    setOpenDropdown(null);
    setSearch("");
    onChange(buildLocationString(selectedCountry, state, null));
  };

  const handleCitySelect = (city: ICity) => {
    setSelectedCity(city);
    setOpenDropdown(null);
    setSearch("");
    onChange(buildLocationString(selectedCountry, selectedState, city));
  };

  const handleClear = () => {
    setSelectedCountry(null);
    setSelectedState(null);
    setSelectedCity(null);
    setOpenDropdown(null);
    onChange("");
  };

  const filteredCountries = useMemo(
    () =>
      search
        ? allCountries.filter((c) =>
            c.name.toLowerCase().includes(search.toLowerCase())
          ).slice(0, 50)
        : allCountries,
    [search, allCountries]
  );

  const filteredStates = useMemo(
    () =>
      search
        ? states.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
        : states,
    [search, states]
  );

  const filteredCities = useMemo(
    () =>
      search
        ? cities.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())).slice(0, 50)
        : cities.slice(0, 50),
    [search, cities]
  );

  const renderDropdown = (
    items: { name: string; key: string }[],
    onSelect: (item: any) => void
  ) => (
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
            onClick={() => onSelect(item)}
            className="w-full text-left px-3 py-2 text-xs hover:bg-accent/50 transition-colors truncate"
          >
            {item.name}
          </button>
        ))
      )}
    </div>
  );

  return (
    <div className="space-y-2">
      {/* Summary display */}
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
        {openDropdown === "country" &&
          renderDropdown(
            filteredCountries.map((c) => ({ ...c, key: c.isoCode, name: `${c.flag} ${c.name}` })),
            (item) => handleCountrySelect(allCountries.find((c) => c.isoCode === item.isoCode)!)
          )}
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
          {openDropdown === "state" &&
            renderDropdown(
              filteredStates.map((s) => ({ ...s, key: s.isoCode })),
              (item) => handleStateSelect(states.find((s) => s.isoCode === item.isoCode)!)
            )}
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
          {openDropdown === "city" &&
            renderDropdown(
              filteredCities.map((c) => ({ ...c, key: `${c.name}-${c.stateCode}` })),
              (item) => handleCitySelect(cities.find((c) => c.name === item.name)!)
            )}
        </div>
      )}
    </div>
  );
};

export default LocationPicker;
