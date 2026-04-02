

## Move "Edit Profile" to top-right corner and center "My Social"

### What changes

**File: `src/pages/Profile.tsx`**

1. **Move "Edit Profile" button** out of the centered `div` (line ~957) and position it absolutely in the top-right corner of the profile header area. It will sit as a small icon-text button pinned to the right, aligned with the avatar row.

2. **Center "My Social" button** — remove the flex row with the dot separator, and place "My Social" as a standalone centered element beneath the email, keeping its existing pulsating style.

### Layout change (lines ~934-983)

```text
BEFORE:
  [Avatar]
  [Name + Admin badge]
  [Email]
  [Edit Profile • My Social]   ← side by side

AFTER:
  [Avatar]              [Edit Profile] ← top-right corner (absolute)
  [Name + Admin badge]
  [Email]
  [    My Social    ]   ← centered, full width
```

### Implementation detail

- Make the profile header container (`div.flex.flex-col.items-center.mb-8` at line 934) `relative` so we can absolutely position the edit button.
- Place the "Edit Profile" button as `absolute top-0 right-0` with the same styling but slightly adjusted padding.
- Remove the dot separator div and the wrapping flex row. Render "My Social" in its own centered `div` with `justify-center`.

