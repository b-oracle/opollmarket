

## Plan: Media Storage Optimization & Cleanup

### Problem
Over time, storage will grow unbounded because recordings, social images, and support attachments are never cleaned up. Only stories have automated expiry.

### What We'll Build

**1. Automated Recording Cleanup Edge Function**
Create `cleanup-old-recordings` that deletes space recordings older than 30 days from both the `spaces` table (clears `recording_url`) and the `space-recordings` storage bucket.

**2. Automated Social Media Cleanup Edge Function**
Create `cleanup-old-social-media` that removes storage files for status post images older than 90 days (keeping the text post, just removing the blob). Updates `image_url` to null on affected `status_updates`.

**3. Schedule All Cleanup Jobs via pg_cron**
Add a single migration that schedules:
- `cleanup-expired-stories` — every hour
- `cleanup-old-recordings` — daily at 3 AM
- `cleanup-old-social-media` — daily at 4 AM
- `cleanup-deleted-markets` — every hour (already exists, just not scheduled)
- `cleanup-audit-logs` — daily at 5 AM (already exists, just not scheduled)

**4. Recording Size Cap**
In `SpaceRoom.tsx`, enforce a max recording duration of 2 hours and cap blob size at 50 MB before upload. Show a toast if exceeded.

**5. Upload File Size Validation**
Add a shared utility `validateFileSize(file, maxMB)` and apply it in:
- `StatusComposer.tsx` (10 MB cap)
- `StoryCreator.tsx` (10 MB cap)
- `SupportChat.tsx` (5 MB cap)
- `Create.tsx` / `AdminMarkets.tsx` (5 MB cap for market images)

### Technical Details

| Component | File(s) | Change |
|-----------|---------|--------|
| Recording cleanup | New `supabase/functions/cleanup-old-recordings/index.ts` | Query spaces with `recording_url` older than 30 days, delete from bucket, null out URL |
| Social cleanup | New `supabase/functions/cleanup-old-social-media/index.ts` | Query `status_updates` with `image_url` older than 90 days, delete from `social-media` bucket |
| Cron scheduling | New migration SQL | `cron.schedule()` calls for all 5 cleanup functions |
| Recording cap | `src/components/social/SpaceRoom.tsx` | Check blob size before upload, abort if >50 MB |
| File size util | New `src/lib/validateFileSize.ts` | Simple `(file, maxMB) => boolean` helper |
| Upload guards | `StatusComposer.tsx`, `StoryCreator.tsx`, `SupportChat.tsx`, `Create.tsx`, `AdminMarkets.tsx` | Add size check before compression/upload |

### Retention Summary
| Media Type | Retention | Already Exists? |
|-----------|-----------|-----------------|
| Stories | 24 hours | ✅ Yes |
| Recordings | 30 days | ❌ New |
| Social images | 90 days | ❌ New |
| Market images | Permanent | ✅ (tied to market lifecycle) |
| Audit logs | 90 days | ✅ Yes (just needs scheduling) |

