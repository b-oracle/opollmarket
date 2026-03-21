import { useEffect, useMemo, useState } from "react";
import { Country, State, City, ICountry, IState, ICity } from "country-state-city";
import { MapPin, X } from "lucide-react";

interface LocationPickerProps {
  value: string;
  onChange: (value: string) => void;
}

const LocationPicker = ({ value, onChange }: LocationPickerProps) => {
  const countries = useMemo(() => Country.getAllCountries(), []);
  const [countryCode, setCountryCode] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [cityName, setCityName] = useState("");

  const states = useMemo(
    () => (countryCode ? State.getStatesOfCountry(countryCode) : []),
    [countryCode]
  );

  const cities = useMemo(
    () => (countryCode && stateCode ? City.getCitiesOfState(countryCode, stateCode) : []),
    [countryCode, stateCode]
  );

  useEffect(() => {
    if (!value) {
      setCountryCode("");
      setStateCode("");
      setCityName("");
      return;
    }

    const parts = value.split(",").map((part) => part.trim());
    if (parts.length === 0) return;

    const countryName = parts[parts.length - 1];
    const foundCountry = countries.find((c) => c.name.toLowerCase() === countryName.toLowerCase());
    if (!foundCountry) return;

    setCountryCode(foundCountry.isoCode);

    if (parts.length >= 2) {
      const stateName = parts[parts.length - 2];
      const foundState = State.getStatesOfCountry(foundCountry.isoCode).find(
        (s) => s.name.toLowerCase() === stateName.toLowerCase()
      );
      if (foundState) {
        setStateCode(foundState.isoCode);
      }
    }

    if (parts.length >= 3) {
      setCityName(parts[0]);
    }
  }, [value, countries]);

  const updateLocation = (
    nextCountryCode: string,
    nextStateCode: string,
    nextCityName: string
  ) => {
    const selectedCountry = countries.find((c) => c.isoCode === nextCountryCode) || null;
    const selectedState =
      nextCountryCode && nextStateCode
        ? State.getStatesOfCountry(nextCountryCode).find((s) => s.isoCode === nextStateCode) || null
        : null;
    const selectedCity =
      nextCountryCode && nextStateCode && nextCityName
        ? City.getCitiesOfState(nextCountryCode, nextStateCode).find((c) => c.name === nextCityName) || null
        : null;

    const parts: string[] = [];
    if (selectedCity) parts.push(selectedCity.name);
    if (selectedState) parts.push(selectedState.name);
    if (selectedCountry) parts.push(selectedCountry.name);

    onChange(parts.join(", "));
  };

  const clearLocation = () => {
    setCountryCode("");
    setStateCode("");
    setCityName("");
    onChange("");
  };

  const selectedCountry = countries.find((c) => c.isoCode === countryCode) as ICountry | undefined;
  const selectedState = states.find((s) => s.isoCode === stateCode) as IState | undefined;
  const selectedCity = cities.find((c) => c.name === cityName) as ICity | undefined;

  return (
    <div className="space-y-2">
      {value && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="flex-1 truncate text-foreground">{value}</span>
          <button
            type="button"
            onClick={clearLocation}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Clear location"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <select
        value={countryCode}
        onChange={(e) => {
          const nextCountry = e.target.value;
          setCountryCode(nextCountry);
          setStateCode("");
          setCityName("");
          updateLocation(nextCountry, "", "");
        }}
        className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
      >
        <option value="">Select country</option>
        {countries.map((country) => (
          <option key={country.isoCode} value={country.isoCode}>
            {country.flag} {country.name}
          </option>
        ))}
      </select>

      {countryCode && states.length > 0 && (
        <select
          value={stateCode}
          onChange={(e) => {
            const nextState = e.target.value;
            setStateCode(nextState);
            setCityName("");
            updateLocation(countryCode, nextState, "");
          }}
          className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
        >
          <option value="">Select state / region</option>
          {states.map((state) => (
            <option key={state.isoCode} value={state.isoCode}>
              {state.name}
            </option>
          ))}
        </select>
      )}

      {countryCode && stateCode && cities.length > 0 && (
        <select
          value={cityName}
          onChange={(e) => {
            const nextCity = e.target.value;
            setCityName(nextCity);
            updateLocation(countryCode, stateCode, nextCity);
          }}
          className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
        >
          <option value="">Select city</option>
          {cities.map((city) => (
            <option key={city.name} value={city.name}>
              {city.name}
            </option>
          ))}
        </select>
      )}

      {(selectedCountry || selectedState || selectedCity) && (
        <p className="text-[11px] text-muted-foreground">
          {selectedCity?.name ? `${selectedCity.name}, ` : ""}
          {selectedState?.name ? `${selectedState.name}, ` : ""}
          {selectedCountry?.name || ""}
        </p>
      )}
    </div>
  );
};

export default LocationPicker;
