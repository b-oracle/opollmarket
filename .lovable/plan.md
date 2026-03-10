

## Fix ProfileShareCard: Badge, Avatar & Text Rendering

### Problems identified

1. **Badge**: The share card uses `isNftAvatar(avatarUrl)` to show a plain `✔` emoji character. It should use the actual tiered verification badge (blue/gold SVG) matching the user's `verification_level` from the database.

2. **Display name clipping**: The name container has `height: "30px"` and `whiteSpace: "nowrap"` which can clip longer names or names with descenders (g, y, p). Should use `overflow: "hidden"` + `textOverflow: "ellipsis"` instead of a fixed height.

3. **Bio visibility**: Bio has `whiteSpace: "nowrap"` with `maxWidth: "300px"` causing long bios to be invisible. Should allow up to 2 lines with proper line clamping.

4. **Avatar not rendering in screenshot**: The `crossOrigin="anonymous"` attribute on the avatar `<img>` may cause CORS failures for external NFT avatar URLs (not hosted on the same origin), causing html2canvas to skip the image. Need a fallback.

---

### Changes

#### 1. `src/components/ProfileShareCard.tsx`

- **Add `verificationLevel` prop** (`VerificationLevel` type, default `"none"`).
- **Replace the `✔` emoji** with an inline SVG badge matching the NftBadge component's starburst+checkmark design, rendered as pure inline SVG (html2canvas-safe). Use gold gradient for `"gold"`, blue gradient for `"blue"`, hidden for `"none"`.
- **Fix display name styles**: Remove fixed `height: "30px"`. Use `overflow: "hidden"`, `textOverflow: "ellipsis"`, `whiteSpace: "nowrap"`, `lineHeight: "1.3"`.
- **Fix bio styles**: Change to `whiteSpace: "normal"`, add `display: "-webkit-box"`, `WebkitLineClamp: 2`, `WebkitBoxOrient: "vertical"`, `overflow: "hidden"` for 2-line clamp. Remove `maxWidth` constraint.

#### 2. `src/pages/UserProfile.tsx`

- Pass `verificationLevel={verificationLevel}` to the `<ProfileShareCard>` component (around line 344).

