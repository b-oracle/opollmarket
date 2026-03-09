

## Plan: Fix profile share card border + remove duplicate social tour button

### 1. Remove blue gradient border from share card screenshot

**File: `src/components/ShareModal.tsx`** (lines 67-88)

The `addWatermark` function draws a blue-to-purple gradient border onto the captured canvas. This is the blue edge the user sees on the shared profile card image. Remove the gradient border drawing code (lines 67-88) while keeping the logo watermark.

### 2. Remove duplicate "Replay Tour" button from profile header

**File: `src/pages/Profile.tsx`** (lines 574-588)

The profile header area has "Edit Profile | Social | Replay Tour" buttons. Remove the "Replay Tour" button and its preceding dot separator (lines 574-588), since this functionality already exists in the Resources section below.

### 3. Fix the Resources "Replay Social Tour" to actually work

**File: `src/pages/Profile.tsx`** (lines 1144-1147)

The Resources section uses `localStorage.removeItem("social_tutorial_seen")` but the `SocialTutorial` component stores the key as `social_tutorial_seen_{userId}`. This means the Resources button never actually resets the tutorial. Fix it to use the `resetTutorial` helper (which handles the user-specific key) instead of manually removing the wrong localStorage key.

