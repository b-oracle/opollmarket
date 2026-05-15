import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User, Heart, Loader2, ChevronDown, Check } from "lucide-react";
import LocationAutocomplete from "@/components/LocationAutocomplete";

const INTEREST_OPTIONS = [
  "Politics", "Entertainment", "Sports", "Crypto", "Finance",
  "Technology", "Science", "Gaming", "Music", "Fashion",
  "Health", "Education", "News", "Culture", "Business",
];

const GENDER_OPTIONS = ["Male", "Female", "Non-binary", "Prefer not to say"];

interface PersonalInfoSectionProps {
  userId?: string;
}

const PersonalInfoSection = ({ userId }: PersonalInfoSectionProps) => {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [age, setAge] = useState<string>("");
  const [gender, setGender] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [interests, setInterests] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) return;
    // Sensitive cols (gender, location) are not directly readable; use SECURITY DEFINER RPC for owner self-read
    supabase
      .rpc("get_my_full_profile")
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          setAge(data.age?.toString() || "");
          setGender(data.gender || "");
          setLocation(data.location || "");
          setInterests(data.interests || []);
        }
        setLoaded(true);
      });
  }, [userId]);

  const toggleInterest = (interest: string) => {
    setInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    );
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const ageNum = age ? parseInt(age, 10) : null;
      if (age && (isNaN(ageNum!) || ageNum! < 13 || ageNum! > 120)) {
        toast.error("Please enter a valid age (13–120)");
        setSaving(false);
        return;
      }
      const { error } = await supabase
        .from("profiles")
        .update({
          age: ageNum,
          gender: gender || null,
          location: location.trim().slice(0, 100) || null,
          interests,
        })
        .eq("id", userId);
      if (error) throw error;
      toast.success("Personal info updated");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <div className="mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full mb-3"
      >
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Personal Info</h3>
        <span className="text-[9px] text-muted-foreground/60 px-1.5 py-0.5 rounded bg-muted/50">Private</span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground ml-auto transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="glass rounded-xl p-4 space-y-4">
          {/* Age */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              Age
            </label>
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="Your age"
              min={13}
              max={120}
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>

          {/* Gender */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              Gender
            </label>
            <div className="flex flex-wrap gap-2">
              {GENDER_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setGender(gender === opt ? "" : opt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    gender === opt
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground/30"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              Location
            </label>
            <LocationAutocomplete value={location} onChange={setLocation} />
          </div>

          {/* Interests */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5" />
              Interests
            </label>
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => toggleInterest(opt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1 ${
                    interests.includes(opt)
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground/30"
                  }`}
                >
                  {interests.includes(opt) && <Check className="w-3 h-3" />}
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2.5 rounded-xl font-bold text-sm bg-primary text-primary-foreground transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
};

export default PersonalInfoSection;
