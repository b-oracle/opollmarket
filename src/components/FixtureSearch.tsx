import { useState, useRef, useEffect } from "react";
import { Search, Loader2, Calendar, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Fixture {
  id: string;
  date: string;
  status: string;
  homeTeam: string;
  homeLogo: string;
  awayTeam: string;
  awayLogo: string;
  league: string;
  leagueLogo: string;
  venue: string;
}

interface FixtureSearchProps {
  sportType: string;
  onSelect: (fixture: Fixture) => void;
  selectedFixtureId?: string;
  isMma?: boolean;
}

const FixtureSearch = ({ sportType, onSelect, selectedFixtureId, isMma }: FixtureSearchProps) => {
  const [query, setQuery] = useState("");
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedFixture, setSelectedFixture] = useState<Fixture | null>(null);
  const debounceRef = useRef<NodeJS.Timeout>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const searchFixtures = async (searchQuery: string) => {
    if (searchQuery.trim().length < 2) {
      setFixtures([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("search-fixtures", {
        body: { sport: sportType, team: searchQuery.trim() },
      });
      if (!error && data?.fixtures) {
        setFixtures(data.fixtures);
      } else {
        setFixtures([]);
      }
    } catch {
      setFixtures([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (value: string) => {
    setQuery(value);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchFixtures(value), 500);
  };

  const handleSelect = (fixture: Fixture) => {
    setSelectedFixture(fixture);
    setQuery("");
    setOpen(false);
    onSelect(fixture);
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "MMM d, yyyy HH:mm");
    } catch {
      return dateStr;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="text-xs font-semibold mb-1.5 block">Search Match by Team Name</label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => fixtures.length > 0 && setOpen(true)}
          placeholder="Type a team name (e.g. Arsenal, Lakers)"
          className="w-full bg-muted/50 border border-border rounded-xl pl-9 pr-9 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Dropdown */}
      {open && (fixtures.length > 0 || (query.length >= 2 && !loading)) && (
        <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto bg-popover border border-border rounded-xl shadow-lg">
          {fixtures.length === 0 && !loading ? (
            <div className="px-4 py-3 text-sm text-muted-foreground text-center">
              No upcoming matches found
            </div>
          ) : (
            fixtures.map((fixture) => (
              <button
                key={fixture.id}
                onClick={() => handleSelect(fixture)}
                className={`w-full text-left px-3 py-2.5 hover:bg-accent/50 transition-colors border-b border-border/50 last:border-0 ${
                  selectedFixtureId === fixture.id ? "bg-primary/10" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  {fixture.homeLogo && (
                    <img src={fixture.homeLogo} alt="" className="w-5 h-5 object-contain" />
                  )}
                  <span className="text-xs font-semibold truncate">{fixture.homeTeam}</span>
                  <span className="text-[10px] text-muted-foreground">vs</span>
                  {fixture.awayLogo && (
                    <img src={fixture.awayLogo} alt="" className="w-5 h-5 object-contain" />
                  )}
                  <span className="text-xs font-semibold truncate">{fixture.awayTeam}</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {formatDate(fixture.date)}
                  </span>
                  {fixture.league && (
                    <span className="text-[10px] text-muted-foreground truncate">
                      {fixture.league}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground/60">ID: {fixture.id}</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Selected fixture display */}
      {selectedFixture && (
        <div className="mt-2 bg-accent/30 border border-border rounded-xl px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selectedFixture.homeLogo && (
                <img src={selectedFixture.homeLogo} alt="" className="w-5 h-5 object-contain" />
              )}
              <span className="text-xs font-bold">{selectedFixture.homeTeam}</span>
              <span className="text-[10px] text-muted-foreground">vs</span>
              {selectedFixture.awayLogo && (
                <img src={selectedFixture.awayLogo} alt="" className="w-5 h-5 object-contain" />
              )}
              <span className="text-xs font-bold">{selectedFixture.awayTeam}</span>
            </div>
            <button
              onClick={() => {
                setSelectedFixture(null);
                onSelect({ id: "", date: "", status: "", homeTeam: "", homeLogo: "", awayTeam: "", awayLogo: "", league: "", leagueLogo: "", venue: "" });
              }}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              ✕
            </button>
          </div>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
            <span>{formatDate(selectedFixture.date)}</span>
            {selectedFixture.league && <span>• {selectedFixture.league}</span>}
            <span>• ID: {selectedFixture.id}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default FixtureSearch;
