

# Restrict File Picker to Audio-Only Formats

## Problem
The file picker uses `accept="audio/*"` which on some devices (especially mobile) still shows photos and non-audio files in the file browser.

## Fix
**File**: `src/components/social/SpaceRoom.tsx` (line 1766)

Replace the generic `accept="audio/*"` with an explicit list of audio MIME types and extensions:

```
accept=".mp3,.m4a,.wav,.ogg,.flac,.aac,.wma,.opus,audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/flac,audio/aac"
```

This tells the OS file picker to filter specifically for music files, hiding images, videos, documents, and other non-audio formats. The combination of extensions and MIME types ensures broad device compatibility.

### File Modified
- `src/components/social/SpaceRoom.tsx` — one line change on the file input element

