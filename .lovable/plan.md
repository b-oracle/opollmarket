

# Image Optimization: Compress, Lazy Load, and Reduce Costs

## Overview
Implement client-side image compression before upload across all upload points, and add `loading="lazy"` to all feed/card images that are missing it. This will reduce storage costs, bandwidth usage, and improve page load speed.

## Changes

### 1. Create shared image compression utility — `src/lib/imageCompression.ts`
- Install `browser-image-compression` (lightweight, ~15KB gzipped)
- Export a `compressImage(file, options)` function with presets:
  - **market-banner**: max 1200px width, quality 0.75, convert to WebP
  - **avatar**: max 300px width, quality 0.7, convert to WebP
  - **social/story**: max 800px width, quality 0.75, convert to WebP
- Returns the compressed `File` object with updated extension
- Gracefully falls back to original file if compression fails

### 2. Apply compression at all 4 upload points

**`src/pages/Create.tsx`** (~line 590) — market banner upload
- Import and call `compressImage(imageFile, 'market-banner')` before uploading
- Update file extension to `.webp` in the storage path

**`src/pages/admin/AdminCreateMarket.tsx`** (~line 264) — admin market banner upload
- Same compression call before upload

**`src/pages/Profile.tsx`** (~line 820) — avatar upload
- Call `compressImage(avatarFile, 'avatar')` before uploading
- Update storage path extension

**`src/components/social/StatusComposer.tsx`** (~line 92) — status image upload
- Call `compressImage(imageFile, 'social')` before uploading

**`src/components/social/StoryCreator.tsx`** (~line 117) — story image upload
- Call `compressImage(imageFile, 'social')` before uploading

### 3. Add `loading="lazy"` to all feed/card images missing it

Add `loading="lazy"` to `<img>` tags in:
- `src/components/MarketCard.tsx` — market banner images (2 locations)
- `src/components/social/StoriesCarousel.tsx` — avatar images
- `src/components/social/StatusCard.tsx` — avatar and market preview images (the ones without it)
- `src/components/social/SocialAdCard.tsx` — market preview image
- `src/components/social/SpaceRoom.tsx` — participant avatars
- `src/components/social/StoryViewer.tsx` — story images and avatars
- `src/components/social/StatusComposer.tsx` — market search result images and preview image

### 4. Install dependency
- Add `browser-image-compression` to `package.json`

## Technical Details
- WebP format saves 30-50% vs JPEG at equivalent quality
- Compression from e.g. 4MB originals down to ~50-150KB typical
- `loading="lazy"` defers off-screen image loading, improving initial paint
- All compression happens client-side before upload — no server changes needed
- Fallback to original file ensures uploads never break

## Files Modified
- **New**: `src/lib/imageCompression.ts`
- `src/pages/Create.tsx`
- `src/pages/admin/AdminCreateMarket.tsx`
- `src/pages/Profile.tsx`
- `src/components/social/StatusComposer.tsx`
- `src/components/social/StoryCreator.tsx`
- `src/components/MarketCard.tsx`
- `src/components/social/StoriesCarousel.tsx`
- `src/components/social/StatusCard.tsx`
- `src/components/social/SocialAdCard.tsx`
- `src/components/social/SpaceRoom.tsx`
- `src/components/social/StoryViewer.tsx`
- `package.json`

