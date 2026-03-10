

## Fix Double Verification Tick Across Platform

**Problem**: The verification badge appears twice — once overlaying the avatar and once next to the username — on several pages. Per user's rule: badge on avatar ONLY on the user's own Profile page; everywhere else, badge next to username only.

### Files to Edit

**1. `src/components/SocialSection.tsx` (line ~107)**
- **Remove** the `NftBadge` on the avatar (`absolute -bottom-0.5 -right-0.5 scale-75`)
- **Keep** the `NftBadge` next to the username (line ~112)

**2. `src/pages/Followers.tsx` (line ~217)**
- **Remove** the `NftBadge` on the avatar (`absolute -bottom-0.5 -right-0.5 scale-75`)
- **Keep** the `NftBadge` next to the username (line ~222)

**3. `src/components/CommentsDrawer.tsx` (line ~73)**
- **Remove** the `NftBadge` on the avatar (`absolute -bottom-0.5 -right-0.5`)
- **Keep** the `NftBadge` next to the author name (line ~80)

**4. `src/components/SocialPage.tsx` (lines ~172, ~243)**
- **Remove** both avatar-overlay `NftBadge` instances
- These rows likely also have username-adjacent badges; if not, add them next to the display name

**5. `src/pages/Profile.tsx` (lines ~661, ~688)**
- **Keep** the avatar-overlay badges — this is the user's own profile page where the badge should appear on the avatar

**6. `src/pages/Rankings.tsx`**
- Already fixed (avatar badge removed previously) — no changes needed

### Summary
Remove 6 avatar-overlay `NftBadge` instances across 4 files. Keep all username-adjacent badges. Leave Profile.tsx avatar badges untouched.

