

## Add Online Music Library to Live Spaces

### Overview
Integrate the **Jamendo API** (free music platform with 600K+ tracks, all licensed for streaming) into the existing spaces music menu. Hosts/co-hosts will be able to search, browse by genre, and stream tracks directly — no file uploads needed.

### Why Jamendo
- Free tier: 35,000 API requests/month, full catalog access
- Provides direct MP3 streaming URLs (no DRM)
- No cost to users; tracks are Creative Commons / royalty-free for non-commercial use
- Simple REST API, no SDK required

### Setup
- A Jamendo API key (free, from developer.jamendo.com) will be stored as a backend secret
- A new backend function will proxy search/browse requests to Jamendo, keeping the key server-side

### Architecture

```text
┌─────────────┐      ┌──────────────────┐      ┌──────────────┐
│ SpaceRoom   │ ──►  │ jamendo-search   │ ──►  │ Jamendo API  │
│ (frontend)  │      │ (edge function)  │      │ api.jamendo   │
└─────────────┘      └──────────────────┘      └──────────────┘
       │
       ▼
  Fetch MP3 URL → AudioContext → LiveKit publish
  (same pipeline as device music)
```

### Code Changes

**1. New edge function: `supabase/functions/jamendo-search/index.ts`**
- Accepts `query` (search text) and optional `genre` filter
- Calls `https://api.jamendo.com/v3.0/tracks/?client_id=...&search=...&limit=20&include=musicinfo`
- Returns simplified track list: `{ id, name, artist, duration, audioUrl, imageUrl }`

**2. New component: `src/components/social/JamendoMusicBrowser.tsx`**
- Search input with debounced query
- Genre quick-filter chips (Pop, Rock, Electronic, Jazz, Hip-Hop, Chill, etc.)
- Track list with play-preview button (30s preview via `audiodownload` URL), artist name, duration
- "Play in Space" button that triggers the existing device music pipeline using the full MP3 URL instead of a local file

**3. Update `SpaceRoom.tsx`**
- Add a new tab/option in the music menu: "Browse Music" alongside existing "Play from Device" and ambient sounds
- New function `playOnlineTrack(url: string, name: string)` that:
  - Fetches the MP3 via `fetch(url)` → `arrayBuffer`
  - Feeds it into the existing `AudioContext` → `decodeAudioData` → gain → LiveKit publish pipeline
  - Reuses all existing pause/resume/stop/volume controls
- Wire the JamendoMusicBrowser's "Play in Space" callback to `playOnlineTrack`

**4. Secret: `JAMENDO_CLIENT_ID`**
- Will prompt you to enter the Jamendo API client ID (free from developer.jamendo.com/v3.0)

### UI Flow
1. Host taps 🎵 music icon → menu shows three options: **Browse Music** | Play from Device | Ambient Sounds
2. "Browse Music" opens the Jamendo browser sheet
3. Host searches or picks a genre → sees track results
4. Taps a track to preview (plays locally only, 30s)
5. Taps "Play in Space" → track streams to all participants via LiveKit

### Files Changed
| File | Change |
|------|--------|
| `supabase/functions/jamendo-search/index.ts` | New edge function proxying Jamendo API |
| `src/components/social/JamendoMusicBrowser.tsx` | New search/browse UI component |
| `src/components/social/SpaceRoom.tsx` | Add "Browse Music" option, `playOnlineTrack` function |

