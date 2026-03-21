

## Plan: Location Autocomplete with Validated Suggestions

### Approach
Build a self-contained location autocomplete using a curated list of countries, states, and major cities — no external API needed. When the user types, a dropdown of matching locations appears. This keeps it fast, free, and works offline.

### Technical Details

**1. Create location data file (`src/data/locations.ts`)**
- Export a flat array of ~500 location strings covering all countries, their states/provinces, and top cities (e.g., "Lagos, Nigeria", "California, United States", "London, United Kingdom")
- Format: "City/State, Country" for consistency

**2. Create `LocationAutocomplete` component**
- Replace the plain text input with a combo-style input
- On typing, filter the locations list (case-insensitive, matching anywhere in string)
- Show a dropdown of up to 8 matching suggestions below the input
- User can click a suggestion to select it, or type a custom value (with a note that it should match a real place)
- Include the MapPin icon in the input and an X to clear
- Use a Popover or simple absolute-positioned dropdown styled to match the dark premium UI
- Close dropdown on selection, blur, or Escape

**3. Update `PersonalInfoSection.tsx`**
- Swap the plain `<input>` for the new `LocationAutocomplete` component
- Props remain `value` + `onChange` — no other changes needed

### Files to Create/Edit
- **Create**: `src/data/locations.ts` — curated location list
- **Create**: `src/components/LocationAutocomplete.tsx` — autocomplete input component
- **Edit**: `src/components/PersonalInfoSection.tsx` — use new component for location field

